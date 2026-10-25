import { randomUUID } from 'node:crypto';
import type express from 'express';
import type Database from 'better-sqlite3';
import type { Character, SessionSnapshot } from '../../../packages/contracts/dist/index.js';
import { buildProposals, forgeRoles, forgeAncestries, forgeVibes, forgeLookIdeas, sanitizeAnswers, queuePortraits, refreshPortraits, isSafeComfyImageRef, type ForgeSession } from './character-forge.js';
import { identityFor } from './session-http.js';
import { SessionError } from './session-authority.js';
import type { CommandBoundary } from './command-boundary.js';
import type { createCharacterPortraits } from './character-portraits.js';

/** Forge drafts are owner-scoped. Only choosing a proposal changes the table. */
export function installForgeRoutes(app: express.Express, hooks: {
  db: Database.Database; party: Character[]; commands: CommandBoundary;
  portraits: ReturnType<typeof createCharacterPortraits>; publish(): SessionSnapshot;
  request: typeof fetch; endpoint: string; enabled(): boolean; active(): boolean;
}) {
  const busy = new Set<string>();
  const key = (room: string, id: string) => `forge:${room}:${id}`;
  const save = (room: string, session: ForgeSession) => hooks.db.prepare('INSERT OR REPLACE INTO meta(key,value) VALUES (?,?)').run(key(room,session.id), JSON.stringify(session));
  const read = (room: string, id: string) => {
    const row = hooks.db.prepare('SELECT value FROM meta WHERE key=?').get(key(room,id)) as {value:string}|undefined;
    return row ? JSON.parse(row.value) as ForgeSession : undefined;
  };
  const own = (request: express.Request) => {
    const viewer = identityFor(request), session = read(viewer.sessionId, String(request.params.id));
    if (!session || session.clientId !== viewer.actorId || Date.now()-session.createdAt>7200000) throw new SessionError(404,'Forge session expired or unavailable. Create new options.');
    return {viewer,session};
  };
  const view = (session: ForgeSession) => ({...session, proposals:session.proposals.map(({portraitPrompt: _prompt, ...proposal})=>({...proposal,
    portraits:proposal.portraits.map((portrait,index)=>({status:portrait.status, ...(portrait.status==='ready'?{url:`/api/character-forge/sessions/${session.id}/portraits/${proposal.id}/${index}`}:{})}))}))});
  const level = () => Math.max(1, Math.min(20, ...hooks.party.map(character=>Number(character.classLabel.match(/\d+$/)?.[0])||1)));
  const transport = { endpoint:hooks.endpoint, request:hooks.request, active:()=>hooks.enabled()&&hooks.active() };
  const paint = (room: string, session: ForgeSession) => {
    if (!transport.active()) return;
    busy.add(session.id);
    void queuePortraits(session,transport).then(()=>{
      if (hooks.active() && read(room,session.id)?.round===session.round && !read(room,session.id)?.chosenCharacterId) save(room,session);
    }).catch(()=>{}).finally(()=>busy.delete(session.id));
  };
  app.get('/api/character-forge/options', (_request,response)=>response.json({roles:forgeRoles,ancestries:forgeAncestries.map(({id,label})=>({id,label})),vibes:forgeVibes.map(({id,label})=>({id,label})),lookIdeas:forgeLookIdeas,level:level()}));
  app.post('/api/character-forge/sessions', async (request,response,next)=>{
    const viewer=identityFor(request), lock=`${viewer.sessionId}:${viewer.actorId}`;
    try {
      if (busy.has(lock)) throw new SessionError(409,'Your forge is already working.');
      const answers=sanitizeAnswers(request.body?.answers);
      if (!answers) throw new SessionError(400,'Choose a valid character role.');
      const rows=hooks.db.prepare('SELECT key,value FROM meta WHERE key LIKE ?').all(`forge:${viewer.sessionId}:%`) as {key:string;value:string}[];
      const owned=rows.filter(row=>(JSON.parse(row.value) as ForgeSession).clientId===viewer.actorId);
      if (owned.some(row=>Date.now()-(JSON.parse(row.value) as ForgeSession).createdAt<10000)) throw new SessionError(429,'Wait a few seconds before forging again.');
      busy.add(lock);
      const result=await buildProposals(answers,{level:level(),round:0,usedNames:[],campaignTitle:'The adventure',tone:[],avoid:[],useLlm:hooks.enabled(),transport:{request:hooks.request}});
      if (!hooks.active()) return;
      // Keep at most ten recent drafts per member; durable choose receipts remain separate.
      for (const row of owned.slice(0,Math.max(0,owned.length-9))) hooks.db.prepare('DELETE FROM meta WHERE key=?').run(row.key);
      const session: ForgeSession={id:randomUUID(),clientId:viewer.actorId,answers,...result,usedNames:result.proposals.map(p=>p.name),round:0,createdAt:Date.now(),chosenCharacterId:null};
      if(transport.active())for(const p of session.proposals)p.portraits=[{status:"queued"},{status:"queued"}];
      save(viewer.sessionId,session); paint(viewer.sessionId,session);
      response.status(201).json({session:view(session)});
    } catch(error){next(error);} finally {busy.delete(lock);}
  });
  app.get('/api/character-forge/sessions/:id', async(request,response,next)=>{
    try {
      const {viewer,session}=own(request);
      if (!busy.has(session.id)&&!session.chosenCharacterId&&transport.active()) {
        busy.add(session.id);
        try {let interrupted=false;for(const p of session.proposals)for(const image of p.portraits)if(image.status==="queued"){image.status="failed";interrupted=true;}
          if(await refreshPortraits(session,transport)||interrupted) { if(hooks.active()&&!read(viewer.sessionId,session.id)?.chosenCharacterId)save(viewer.sessionId,session); }} finally {busy.delete(session.id);}
      }
      response.json({session:view(session)});
    }catch(error){next(error);}
  });
  app.post('/api/character-forge/sessions/:id/reroll',async(request,response,next)=>{
    let locked=false;
    try {
      const {viewer,session}=own(request);
      if (busy.has(session.id)||session.chosenCharacterId||session.round>=10) throw new SessionError(409,'Wait for the forge, or create a new draft after choosing. Maximum ten rerolls.');
      busy.add(session.id);locked=true;
      const result=await buildProposals(session.answers,{level:level(),round:session.round+1,usedNames:session.usedNames,campaignTitle:'The adventure',tone:[],avoid:[],useLlm:hooks.enabled(),transport:{request:hooks.request}});
      if(!hooks.active())return;
      if(read(viewer.sessionId,session.id)?.chosenCharacterId)throw new SessionError(409,'This draft was already chosen.');
      Object.assign(session,result,{round:session.round+1,createdAt:Date.now(),usedNames:[...session.usedNames,...result.proposals.map(p=>p.name)]});
      if(transport.active())for(const p of session.proposals)p.portraits=[{status:"queued"},{status:"queued"}];
      save(viewer.sessionId,session);busy.delete(session.id);locked=false;paint(viewer.sessionId,session);
      response.json({session:view(session)});
    }catch(error){next(error);}finally{if(locked)busy.delete(String(request.params.id));}
  });
  app.get('/api/character-forge/sessions/:id/portraits/:proposal/:variant',async(request,response,next)=>{
    try{
      const {session}=own(request);
      const image=session.proposals.find(p=>p.id===request.params.proposal)?.portraits[Number(request.params.variant)]?.image;
      if(!image||!isSafeComfyImageRef(image))throw new SessionError(404,'Portrait unavailable.');
      const upstream=await hooks.request(`${hooks.endpoint}/view?${new URLSearchParams(image)}`,{signal:AbortSignal.timeout(5000)});
      if(!upstream.ok)throw new SessionError(502,'Portrait provider unavailable.');
      if(Number(upstream.headers.get('content-length'))>8*1024*1024)throw new SessionError(502,'Portrait too large.');
      const reader=upstream.body?.getReader();if(!reader)throw new SessionError(502,'Portrait unavailable.');
      const chunks:Uint8Array[]=[];let size=0;
      try{for(;;){const item=await reader.read();if(item.done)break;size+=item.value.byteLength;if(size>8*1024*1024)throw new SessionError(502,'Portrait too large.');chunks.push(item.value);}}
      finally{void reader.cancel().catch(()=>{});reader.releaseLock();}
      const bytes=Buffer.concat(chunks);
      if(bytes.length>8*1024*1024||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new SessionError(502,'Invalid portrait output.');
      response.setHeader('X-Content-Type-Options','nosniff');response.type('image/png').send(bytes);
    }catch(error){next(error);}
  });
  app.post('/api/character-forge/sessions/:id/choose',(request,response)=>{
    const {viewer,session}=own(request);
    if(session.chosenCharacterId)throw new SessionError(409,'This draft was already chosen.');
    if(busy.has(session.id))throw new SessionError(409,'Wait for the current forge operation to finish.');
    const proposal=session.proposals.find(p=>p.id===request.body.proposalId);
    if(!proposal)throw new SessionError(400,'Choose one of your current proposals.');
    if(hooks.party.length>=30)throw new SessionError(409,'The table has reached its character limit.');
    const character: Character={id:randomUUID(),name:proposal.name,classLabel:proposal.classLabel,hp:{current:proposal.hp,max:proposal.hp},armorClass:proposal.armorClass,initiative:null,conditions:[],resources:proposal.resources,inventory:proposal.inventory,stats:proposal.stats,...(proposal.build?{build:proposal.build}:{}),
      notes:[proposal.appearance,proposal.personality,proposal.hook],image:null,claimedByClientId:viewer.actorId,claimedByLabel:viewer.label};
    if(request.body.image){const reference=hooks.portraits.prepare(character,request.body.image,proposal.appearance);hooks.commands.persist(reference.save);character.portrait={pendingId:reference.id,description:proposal.appearance,seed:reference.seed,version:1};}
    for(const existing of hooks.party)if(existing.claimedByClientId===viewer.actorId){existing.claimedByClientId=null;existing.claimedByLabel=null;}
    hooks.party.push(character);
    hooks.commands.persist(()=>save(viewer.sessionId,{...session,chosenCharacterId:character.id}));
    response.json({ok:true,sessionSnapshot:hooks.publish()});
  });
}
