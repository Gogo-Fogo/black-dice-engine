import assert from 'node:assert/strict';
import {test} from 'node:test';
import {resolve} from 'node:path';
import Database from 'better-sqlite3';
import {withIsolatedServer} from './helpers/isolated-server.mjs';
import {largePng} from './helpers/portrait-fixture.mjs';
const built=process.env.BDE_TEST_BUILT==='1';
const {buildProposals,sanitizeAnswers,portraitWorkflow}=await import(`../services/game-server/${built?'dist/character-forge.js':'src/character-forge.ts'}`);
const api=server=>async(path,token,body)=>{const response=await fetch(server.base+path,{method:body?'POST':'GET',headers:{...(token?{authorization:`Bearer ${token}`} : {}),'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()};};

test('forge uses the installed Flux architecture and isolates each portrait prompt and seed',()=>{
 const first=portraitWorkflow('Demo "elf"\nwith a book',123,'bde/forge/one');
 const second=portraitWorkflow('Demo dwarf',456,'bde/forge/two');
 assert.equal(first['1'].class_type,'UNETLoader');assert.equal(first['3'].inputs.type,'flux2');
 assert.equal(first['7'].inputs.steps,4);assert.equal(first['2'].inputs.text,'Demo "elf"\nwith a book');
 assert.equal(first['4'].inputs.noise_seed,123);assert.equal(second['4'].inputs.noise_seed,456);
 assert.equal(first['11'].inputs.filename_prefix,'bde/forge/one');
});

test('forge creates playable proposals without providers and rotates class choices',async()=>{
 assert.equal(sanitizeAnswers({role:'invalid'}),null);
 const answers=sanitizeAnswers({role:'arcane',ancestry:'elf',look:'demo\u0000cloak',name:'Demo Hero'});
 assert.equal(answers.look,'demo cloak');
 const options={level:1,round:0,usedNames:[],campaignTitle:'Demo',tone:[],avoid:[],useLlm:false};
 const first=await buildProposals(answers,options),next=await buildProposals(answers,{...options,round:1,usedNames:first.proposals.map(p=>p.name)});
 assert.equal(first.flavorSource,'template');assert.equal(first.proposals.length,3);
 assert.notEqual(first.proposals[0].classLabel,next.proposals[0].classLabel);
 for(const proposal of [...first.proposals,...next.proposals]){assert.ok(proposal.hp>0);assert.ok(proposal.armorClass>=10);assert.equal(proposal.stats.skills.length>0,true);assert.equal(proposal.resources.every(r=>r.current===r.max),true);}
});

test('quick-start resources include higher spell tiers and match equipped hide armor',async()=>{
 const options={level:5,round:0,usedNames:[],campaignTitle:'Demo',tone:[],avoid:[],useLlm:false};
 const arcane=await buildProposals(sanitizeAnswers({role:'arcane',ancestry:'elf'}),options);
 assert.deepEqual(arcane.proposals[0].resources.map(r=>[r.label,r.max]),[['Spell Slots I',4],['Spell Slots II',3],['Spell Slots III',2]]);
 assert.equal(arcane.proposals[2].resources[0].label,'Pact Slots (level 3)');
 const support=await buildProposals(sanitizeAnswers({role:'support',ancestry:'human'}),options);
 const druid=support.proposals.find(p=>p.classId==='druid');assert.equal(druid.armorClass,12+Math.min(2,Math.floor((druid.stats.dex-10)/2)));
 const frontline=await buildProposals(sanitizeAnswers({role:'frontline',ancestry:'human'}),{...options,level:1});
 assert.equal(frontline.proposals[0].resources.some(r=>r.label==='Action Surge'),false);
 assert.equal(frontline.proposals[2].resources.some(r=>r.label.startsWith('Spell Slots')),false);
});

test('forge isolates drafts, persists selection atomically and replays once across restart',async()=>{
 await withIsolatedServer(async server=>{
  const request=api(server),host=await server.hostToken(),initial=(await request('/api/session-snapshot',host)).body;
  const owner=(await request('/api/session/join','',{code:initial.tablePin,label:'Demo Creator'})).body;
  const other=(await request('/api/session/join','',{code:initial.tablePin,label:'Demo Other'})).body;
  const display=(await request('/api/session/display',host,{})).body;
  assert.equal((await request('/api/character-forge/options',display.token)).status,403);
  assert.equal((await request('/api/character-forge/sessions',owner.token,{answers:{role:'wrong'}})).status,400);
  const created=await request('/api/character-forge/sessions',owner.token,{clientId:other.actorId,answers:{role:'frontline',ancestry:'human',name:'Demo Created'}});
  assert.equal(created.status,201,JSON.stringify(created.body));
  const session=created.body.session,path=`/api/character-forge/sessions/${session.id}`;
  assert.equal((await request(path,other.token)).status,404);
  assert.equal(session.proposals.some(p=>'portraitPrompt' in p),false);
  const image=largePng();assert.ok(image.length>100*1024&&image.length<512*1024);
  const input={requestId:'forge-demo-once',proposalId:session.proposals[0].id,portraitIndex:0,image:'data:image/png;base64,'+image.toString('base64')};
  assert.equal((await request(path+'/choose',other.token,input)).status,404);
  const db=new Database(resolve(server.folder,'demo.db'));
  try{
   db.exec("CREATE TRIGGER fail_forge BEFORE INSERT ON meta WHEN NEW.key LIKE 'forge:%' BEGIN SELECT RAISE(ABORT,'synthetic forge failure'); END");
   const before=(await request('/api/session-snapshot',host)).body;
   assert.equal((await request(path+'/choose',owner.token,input)).status,503);
   const after=(await request('/api/session-snapshot',host)).body;
   assert.deepEqual(after.party,before.party);assert.equal(after.revision,before.revision);
   db.exec('DROP TRIGGER fail_forge');
   const chosen=await request(path+'/choose',owner.token,input);assert.equal(chosen.status,200,JSON.stringify(chosen.body));
   const saved=chosen.body.sessionSnapshot.party.find(c=>c.claimedByClientId===owner.actorId);
   assert.equal(saved.name,session.proposals[0].name);assert.ok(saved.stats.str);assert.ok(saved.portrait.pendingId);assert.equal(chosen.body.command.requestId,input.requestId);
   await server.restart();
   assert.deepEqual(await request(path+'/choose',owner.token,input),chosen);
   assert.equal((await request(path+'/choose',owner.token,{...input,requestId:'new-request'})).status,409);
   const snapshot=(await request('/api/session-snapshot',host)).body;
   assert.equal(snapshot.party.length,initial.party.length+1);
   assert.equal(snapshot.party.filter(c=>c.claimedByClientId===owner.actorId).length,1);
  }finally{db.close();}
 },{profile:'party'});
});

test('forge submits six local portraits, polls saved jobs and protects preview ownership',async()=>{
 const base='http://127.0.0.1:1';
 const mockFetches=[{url:base+'/chat/completions',method:'POST',body:{choices:[{message:{content:'[]'}}]}},
  ...Array.from({length:6},(_,i)=>({url:base+'/prompt',method:'POST',body:{prompt_id:`demo-forge-${i}`}})),
  ...Array.from({length:6},(_,i)=>({url:base+`/history/demo-forge-${i}`,body:{[`demo-forge-${i}`]:{outputs:{'7':{images:[{filename:`demo-${i}.png`,subfolder:'bde/forge',type:'output'}]}}}}}))];
 await withIsolatedServer(async server=>{
  const request=api(server),host=await server.hostToken(),initial=(await request('/api/session-snapshot',host)).body;
  const owner=(await request('/api/session/join','',{code:initial.tablePin,label:'Demo Artist'})).body;
  const other=(await request('/api/session/join','',{code:initial.tablePin,label:'Demo Guest'})).body;
  const result=await request('/api/character-forge/sessions',owner.token,{answers:{role:'support',ancestry:'human'}});
  assert.equal(result.status,201,JSON.stringify(result.body));
  const path=`/api/character-forge/sessions/${result.body.session.id}`;
  let session;
  for(let attempt=0;attempt<20;attempt++){
   session=(await request(path,owner.token)).body.session;
   if(session.proposals.every(p=>p.portraits.every(image=>image.status==='ready')))break;
   await new Promise(resolve=>setTimeout(resolve,20));
  }
  assert.equal(session.proposals.flatMap(p=>p.portraits).filter(p=>p.status==='ready').length,6);
  for(const proposal of session.proposals)for(const portrait of proposal.portraits){assert.match(portrait.url,/^\/api\/character-forge\/sessions\//);assert.equal((await request(portrait.url,other.token)).status,404);}
  const chosen=await request(path+'/choose',owner.token,{requestId:'choose-painted',proposalId:session.proposals[0].id});
  assert.equal(chosen.status,200);assert.equal(chosen.body.sessionSnapshot.party.find(c=>c.claimedByClientId===owner.actorId).portrait,undefined);
 },{configuredProviders:true,mockFetches});
});
