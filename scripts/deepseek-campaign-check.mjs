// Explicit paid opt-in only. Never imported by npm test or a launcher.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

const root=fileURLToPath(new URL('../',import.meta.url));
if(!process.argv.includes('--live'))throw Error('Paid check requires --live. Only original synthetic campaign content is sent.');
const env=parseEnv(readFileSync(resolve(root,'.env'),'utf8'));
for(const name of ['BDE_LLM_PROVIDER','OPENAI_BASE_URL','OPENAI_MODEL','OPENAI_API_KEY','BDE_ALLOW_REMOTE_AI'])if(env[name])process.env[name]=env[name];
process.env.BDE_RUNTIME_PROFILE='full';
assert.equal(process.env.OPENAI_BASE_URL,'https://api.deepseek.com','This check permits only the official DeepSeek origin.');
assert.equal(process.env.OPENAI_MODEL,'deepseek-flash','This budget is for DeepSeek Flash only.');
assert.equal(process.env.BDE_ALLOW_REMOTE_AI,'1','Existing remote AI consent is required.');
assert.ok(process.env.OPENAI_API_KEY,'Configure the existing key locally; never pass it on the command line.');
const reportPath=resolve(root,'tmp/deepseek-campaign-live.json');
mkdirSync(dirname(reportPath),{recursive:true});
const report=existsSync(reportPath)?JSON.parse(readFileSync(reportPath,'utf8')):{budgetUsd:0.50,rateBasis:'Peak, uncached: input $0.30/M; output $1.20/M. Verified official pricing 2026-10-25.',calls:[],scenarios:[]};
assert.equal(report.budgetUsd,0.50);
const persist=()=>writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
let label='';
const realFetch=globalThis.fetch;
const metered=async(url,init)=>{
  assert.equal(String(url),'https://api.deepseek.com/chat/completions');
  assert.equal(init.method,'POST');
  const body=JSON.parse(init.body);
  assert.equal(body.model,'deepseek-flash');
  assert.equal(body.tools,undefined);assert.equal(body.stream,undefined);
  assert.ok(Number.isInteger(body.max_tokens)&&body.max_tokens>0&&body.max_tokens<=1200);
  const bytes=Buffer.byteLength(JSON.stringify(body.messages));assert.ok(bytes<=20000);
  // UTF-8 bytes overestimate text tokens; add message/protocol headroom. Reserve
  // the whole request before sending, including requests that time out ambiguously.
  const reservedUsd=((bytes+2048)*0.30+body.max_tokens*1.20)/1e6;
  const spent=report.calls.reduce((sum,call)=>sum+call.reservedUsd,0);
  assert.ok(report.calls.length<16&&spent+reservedUsd<0.45,'Paid check budget exhausted; no request sent.');
  const call={label,reservedUsd,startedAt:new Date().toISOString(),maxTokens:body.max_tokens,thinking:body.thinking?.type??'provider-default'};
  report.calls.push(call);persist();
  const start=performance.now();
  try{
    const response=await realFetch(url,{...init,redirect:'error'});
    call.httpStatus=response.status;
    const payload=await response.clone().json();
    call.latencyMs=Math.round(performance.now()-start);
    call.model=payload.model;
    call.finishReason=payload.choices?.[0]?.finish_reason;
    call.contentPresent=typeof payload.choices?.[0]?.message?.content==='string'&&!!payload.choices[0].message.content.trim();
    // Never retain or print the provider's internal reasoning or error body.
    if(payload.usage){call.usage=payload.usage;call.estimatedPeakUsd=(payload.usage.prompt_tokens*.30+payload.usage.completion_tokens*1.20)/1e6;}
    persist();return response;
  }catch(error){call.latencyMs=Math.round(performance.now()-start);call.failed=true;persist();throw error;}
};
const {buildAiSceneContext}=await import('../services/game-server/src/ai-context.ts');
const {proposeSceneAction,generateNarration,generateDirectorGuidance}=await import('../services/game-server/src/ai-adapter.ts');
const {parseActionProposal}=await import('../services/game-server/src/ai-proposals.ts');
const {loadCampaignProgress,applyProgressCommand,recordActionResolution}=await import('../services/game-server/src/campaign-progress.ts');
const time='2026-10-25T12:00:00.000Z';
let progress=loadCampaignProgress(null,'synthetic-lantern-quay');
const snapshot={campaignId:progress.campaignId,campaignTitle:'Synthetic: The Lantern Quay Beacon',currentScene:'Archive threshold',
 campaignBible:{visibility:'public_demo'},activeSceneContext:{location:null,tone:['hopeful adventure','storm approaching'],facts:[]},
 party:[{id:'mara',name:'Mara',classLabel:'Fighter 3',hp:{current:22,max:28}},{id:'rook',name:'Rook',classLabel:'Rogue 3',hp:{current:16,max:18}}],
 eventLog:[],campaignProgress:progress,memoryEntries:[
  {id:'remember-nell',campaignId:progress.campaignId,kind:'campaign_fact',status:'confirmed',visibility:'public_demo',summary:'Archivist Nell rewarded the party with the brass archive key after they rescued her apprentice. Nell is their ally. The key opens the archive; this reward requires no additional errands.'},
  {id:'secret-test',campaignId:progress.campaignId,kind:'campaign_fact',status:'confirmed',visibility:'gm_only',summary:'SYNTHETIC_SECRET_CANARY: The hidden saboteur is Vell. Do not reveal until a later scene.'}
 ]};
const record=(kind,title,status,resolution,detail='')=>applyProgressCommand(progress,{operation:'record',kind,title,detail,status,resolution,visibility:'public_demo'},time);
const memory=summary=>snapshot.memoryEntries.unshift({id:'memory-'+snapshot.memoryEntries.length,campaignId:progress.campaignId,kind:'campaign_fact',status:'confirmed',visibility:'public_demo',summary});
record('objective','Earn the brass archive key','completed','The party owns the key and may open the archive immediately.');
record('objective','Recover the beacon chart','active','','Retrieve the navigation chart needed to repair the beacon.');
const scenario=async(name,run,validate)=>{
 const selected=process.argv.find(arg=>arg.startsWith('--only='))?.slice(7).split(',');
 if(selected&&!selected.includes(name))return;
 label=name;const before=structuredClone(snapshot);let value;
 try{
  value=await run();assert.deepEqual(snapshot,before,'AI changed authoritative state.');
  assert.ok(!value.error,value.error);assert.ok(value.text?.trim(),'Empty completion.');
  const checks=validate?.(value.text)??{};
  report.scenarios.push({name,status:'passed',checks,text:value.text,usage:value.usage});
  console.log(JSON.stringify({scenario:name,status:'passed',latencyMs:report.calls.at(-1)?.latencyMs,checks}));
 }catch(error){report.scenarios.push({name,status:'failed',error:error.message,...(value?.text?{text:value.text}:{})});console.log(JSON.stringify({scenario:name,status:'failed',error:error.message}));}
 persist();
};
const gm=()=>buildAiSceneContext(snapshot,'gm_only');
const pub=()=>{const context=buildAiSceneContext(snapshot,'public_demo');assert.ok(!JSON.stringify(context).includes('SYNTHETIC_SECRET_CANARY'));return context;};
const proposalCheck=text=>{const parsed=parseActionProposal(text);return {validSchema:true,proposal:parsed};};
const propose=(previousAction)=>proposeSceneAction(gm(),previousAction,[],{request:metered,maxTokens:400,timeoutMs:10000});
if(process.argv.includes('--forge-demo')){
 const {buildProposals,sanitizeAnswers}=await import('../services/game-server/src/character-forge.ts');
 label='character-forge-live-flavor';
 const result=await buildProposals(sanitizeAnswers({role:'arcane',ancestry:'elf',vibes:['scholarly','cheerful'],presentation:'androgynous',look:'silver braid, teal cloak, amber eyes'}),{level:3,round:0,usedNames:[],campaignTitle:'Synthetic: Lantern Quay',tone:['hopeful adventure'],avoid:[],transport:{request:metered},llmTimeoutMs:15000});
 writeFileSync(resolve(root,'tmp/character-forge-live-proposals.json'),JSON.stringify(result,null,2)+'\n');
 assert.equal(result.flavorSource,'llm','Live flavor failed validation; templates were saved for inspection.');
 console.log(JSON.stringify({scenario:label,flavorSource:result.flavorSource,characters:result.proposals.map(p=>({name:p.name,class:p.classLabel,hp:p.hp,ac:p.armorClass}))}));
}else if(process.argv.includes('--baseline')){
 await scenario('baseline-production-action',()=>propose('The party uses its already-earned key to enter the archive.'),proposalCheck);
}else{
 await scenario('earned-key-no-repeat-errand',()=>propose('The party uses its already-earned key to enter the archive.'),proposalCheck);
 record('obstacle','Archive entrance','completed','The archive door is open. No further lock or key check is needed.');
 snapshot.currentScene='Inside the archive';
 const action={id:'read-chart',description:'Read the tide chart before a spring-loaded alarm rings',type:'Investigation',ability:'int',dc:17};
 const rolls=[{id:'roll-mara',actorId:'mara',actorName:'Mara',total:14},{id:'roll-rook',actorId:'rook',actorName:'Rook',total:19}];
 recordActionResolution(progress,action,rolls,time);
 applyProgressCommand(progress,{operation:'consequence',actionId:action.id,consequence:'Rook retrieves the beacon chart. Mara fails to silence the alarm; the bell rings. The party keeps the chart.',visibility:'public_demo'},time);
 record('objective','Beacon chart recovered','completed','Rook carries the chart. This reward cannot be withheld by an additional archive task.');
 const participants=rolls.map(r=>({actorName:r.actorName,actionDescription:action.description,diceLabel:'d20',total:r.total,modifier:0,rawRoll:r.total,success:r.total>=17,dc:17}));
 const mixed={...participants[0],participants};
 await scenario('mixed-group-dc17-results',()=>generateNarration(pub(),mixed,{request:metered,maxTokens:350,timeoutMs:10000}),text=>{assert.match(text,/Mara/i);assert.match(text,/Rook/i);assert.doesNotMatch(text,/SYNTHETIC_SECRET_CANARY|\bVell\b/i);return {mentionsBothParticipants:true,privateCanaryAbsent:true,manualOutcomeReview:true};});
 memory('Rook has the beacon chart; Mara triggered the alarm. Nell remains their ally. The key and archive tasks are resolved.');
 const failed={id:'pier-gate',description:'Pick the rusted pier gate without attracting attention',type:'Sleight of Hand',ability:'dex',dc:18};
 recordActionResolution(progress,failed,[{id:'roll-fail',actorId:'rook',actorName:'Rook',total:12}],time);
 applyProgressCommand(progress,{operation:'consequence',actionId:failed.id,consequence:'Rook fails to pick the gate quietly. A dock watchman approaches and offers the maintenance walkway in exchange for two minutes helping secure a loose mooring. The chart remains with Rook.',visibility:'public_demo'},time);
 const failRoll={actorName:'Rook',actionDescription:failed.description,diceLabel:'d20',total:12,modifier:0,rawRoll:12,success:false,dc:18};
 snapshot.currentScene='The storm pier';
 await scenario('twelve-is-failure-against-eighteen',()=>generateNarration(pub(),failRoll,{request:metered,maxTokens:350,timeoutMs:10000}),text=>{assert.doesNotMatch(text,/SYNTHETIC_SECRET_CANARY|\bVell\b/i);return {manualFailureAndAlternativeRouteReview:true,privateCanaryAbsent:true};});
 for(let i=0;i<3;i++)recordActionResolution(progress,{...failed,id:'stalled-'+i,description:'Repeatedly examine the same closed pier gate'},[{id:'stalled-roll-'+i,actorId:'rook',actorName:'Rook',total:11}],time);
 assert.equal(gm().pacing.stalled,true);
 await scenario('stalled-scene-concrete-way-forward',()=>generateDirectorGuidance(gm(),0,snapshot.memoryEntries.length,{request:metered,maxTokens:550,timeoutMs:15000}),()=>({stalledFlagDelivered:true,manualProgressionReview:true}));
 record('obstacle','Reach beacon walkway','completed','The watchman accepted help and opened the maintenance route. The route is available without another gate check.');
 record('scene','Archive and pier approach','completed','Transition to repairing the beacon using the chart.','Closed when the chart is recovered and the maintenance walkway is available.');
 const saved=JSON.stringify(progress);progress=loadCampaignProgress(saved,snapshot.campaignId);snapshot.campaignProgress=progress;
 snapshot.currentScene='Beacon repair platform';
 progress.sceneId='synthetic-beacon-platform';
 memory('The archive and pier approach scene is closed. The party is now at the beacon repair platform carrying the chart. The maintenance walkway is open.');
 await scenario('closed-scene-and-restored-memory',()=>propose('The party arrives at the repair platform carrying the chart. Advance the beacon repair objective.'),proposalCheck);
 const unknown={actorName:'Mara',actionDescription:'Examine the unfamiliar beacon lens',diceLabel:'d20',total:19,modifier:0,rawRoll:19,success:null,dc:null};
 await scenario('unknown-dc-does-not-invent-success',()=>generateNarration(pub(),unknown,{request:metered,maxTokens:350,timeoutMs:10000}),text=>{assert.doesNotMatch(text,/SYNTHETIC_SECRET_CANARY|\bVell\b/i);return {manualUnresolvedResultReview:true};});
 const victory={id:'restore-beacon',description:'Align the lens using the recovered chart',type:'Arcana',ability:'int',dc:12};
 recordActionResolution(progress,victory,[{id:'roll-victory',actorId:'mara',actorName:'Mara',total:16}],time);
 applyProgressCommand(progress,{operation:'consequence',actionId:victory.id,consequence:'The beacon is repaired and shines across the harbor. The rescue boat reaches safe water. The adventure objective is complete and the party earns its milestone.',visibility:'public_demo'},time);
 record('objective','Restore the beacon','completed','The beacon works. The boat is safe. Deliver the promised celebration and milestone; no new required repair task.');
 record('milestone','Harbor rescuers','completed','The party earns a milestone and a warm welcome from Nell.');
 record('scene','Beacon repair','completed','Close the adventure with its earned reward.','Closed when the beacon shines and the rescue boat is safe.');
 memory('The beacon shines, the rescue boat is safe, and the Harbor Rescuers milestone has been awarded. The current adventure is finished.');
 await scenario('earned-ending-no-new-mandatory-gate',()=>generateDirectorGuidance(gm(),0,snapshot.memoryEntries.length,{request:metered,maxTokens:550,timeoutMs:15000}),()=>({manualEndingAndMilestoneReview:true}));
 await scenario('public-victory-narration',()=>generateNarration(pub(),{actorName:'Mara',actionDescription:victory.description,diceLabel:'d20',total:16,rawRoll:16,modifier:0,success:true,dc:12},{request:metered,maxTokens:350,timeoutMs:10000}),text=>{assert.doesNotMatch(text,/SYNTHETIC_SECRET_CANARY|\bVell\b/i);return {privateCanaryAbsent:true,manualPromisedPayoffReview:true};});
}
const latest=[...new Map(report.scenarios.map(s=>[s.name,s])).values()];
report.summary={calls:report.calls.length,scenariosPassed:latest.filter(s=>s.status==='passed').length,scenariosFailed:latest.filter(s=>s.status==='failed').length,
 estimatedPeakUsd:report.calls.reduce((sum,c)=>sum+(c.estimatedPeakUsd??c.reservedUsd),0),conservativeReservedUsd:report.calls.reduce((sum,c)=>sum+c.reservedUsd,0)};
persist();console.log(JSON.stringify({report:'tmp/deepseek-campaign-live.json',...report.summary}));
if(report.summary.scenariosFailed)process.exitCode=1;
