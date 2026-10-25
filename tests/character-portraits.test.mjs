import assert from 'node:assert/strict';
import {test} from 'node:test';
import {deflateSync} from 'node:zlib';
import {resolve} from 'node:path';
import Database from 'better-sqlite3';
import {withIsolatedServer} from './helpers/isolated-server.mjs';
const built=process.env.BDE_TEST_BUILT==='1';
const {normalizePortrait}=await import(`../services/game-server/${built?'dist/character-portraits.js':'src/character-portraits.ts'}`);
const {fillWorkflow,uploadReference}=await import(`../services/comfy-router/${built?'dist/reference-workflow.js':'src/reference-workflow.ts'}`);
const {createMediaRouterClient}=await import(`../services/game-server/${built?'dist/media-router-client.js':'src/media-router-client.ts'}`);
const {characterOutputPath}=await import(`../services/game-server/${built?'dist/character-output.js':'src/character-output.ts'}`);

const crc=bytes=>{let n=0xffffffff;for(const b of bytes){n^=b;for(let i=0;i<8;i++)n=(n>>>1)^(n&1?0xedb88320:0);}return(n^0xffffffff)>>>0;};
const chunk=(type,data)=>{const b=Buffer.alloc(data.length+12);b.writeUInt32BE(data.length);b.write(type,4);data.copy(b,8);b.writeUInt32BE(crc(b.subarray(4,-4)),b.length-4);return b;};
function png(color=120,metadata=false){const header=Buffer.alloc(13);header.writeUInt32BE(2);header.writeUInt32BE(2,4);header[8]=8;header[9]=6;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),...(metadata?[chunk('tEXt',Buffer.from('Private metadata\0DEMO_CANARY'))]:[]),chunk('IDAT',deflateSync(Buffer.from([0,...Array(8).fill(color),0,...Array(8).fill(color)]))),chunk('IEND',Buffer.alloc(0))]);}
const data=image=>'data:image/png;base64,'+image.toString('base64');
const api=server=>async(path,token,body)=>{const r=await fetch(server.base+path,{method:body?'POST':'GET',headers:{...(token?{authorization:`Bearer ${token}`}:{ } ),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(3000)});return {status:r.status,body:await r.json()};};
const character=(body,id)=>body.sessionSnapshot.party.find(c=>c.id===id);

test('PNG normalization strips metadata and rejects corrupt, oversized and non-image inputs',()=>{
  assert.deepEqual(normalizePortrait(data(png(120,true))),png());
  const corrupt=png();corrupt[corrupt.length-1]^=1;
  for(const input of [data(corrupt),'data:image/svg+xml;base64,PHN2Zz4=',data(Buffer.from('not a PNG')),'data:image/png;base64,'+'A'.repeat(750001)]) assert.throws(()=>normalizePortrait(input),/valid PNG/);
});

test('portrait ownership, private review, immutable generation references and restart-safe atomic replay', {timeout:20000},async()=>{
 await withIsolatedServer(async server=>{
  const request=api(server),host=await server.hostToken(),initial=(await request('/api/session-snapshot',host)).body;
  const owner=(await request('/api/session/join','',{code:initial.tablePin,label:'Demo Painter'})).body;
  const other=(await request('/api/session/join','',{code:initial.tablePin,label:'Demo Viewer'})).body;
  const display=(await request('/api/session/display',host,{})).body;
  const id=initial.party[0].id,path=`/api/characters/${id}/portrait`;
  assert.equal((await request('/api/claim-character',owner.token,{requestId:'claim-demo-art',characterId:id})).status,200);
  const input={requestId:'portrait-one',image:data(png(120,true)),description:'Demo silver hair and blue cloak'};
  for(const token of ['',other.token,display.token]) assert.ok([401,403].includes((await request(path,token,input)).status));
  assert.equal((await request(`/api/characters/${id}/scene-job`,host,{requestId:'scene-before',scenePrompt:'A demo bridge'})).status,409);
  const db=new Database(resolve(server.folder,'demo.db'));
  try {
   db.exec("CREATE TRIGGER fail_portrait BEFORE INSERT ON meta WHEN NEW.key LIKE 'character-portrait:%' BEGIN SELECT RAISE(ABORT,'synthetic storage failure'); END");
   const before=(await request('/api/session-snapshot',host)).body;
   assert.equal((await request(path,owner.token,input)).status,503);
   const after=(await request('/api/session-snapshot',host)).body;
   assert.deepEqual(after.party,before.party);assert.equal(after.revision,before.revision);
   db.exec('DROP TRIGGER fail_portrait');
   const uploaded=await request(path,owner.token,input);assert.equal(uploaded.status,200);
   const pending=character(uploaded.body,id).portrait.pendingId;
   assert.deepEqual(await request(path,owner.token,input),uploaded);
   assert.equal((await request(path,owner.token,{...input,description:'Changed input'})).status,409);
   assert.equal((await request(path+'/review',owner.token,{requestId:'unauthorized-review',referenceId:pending,approve:true})).status,403);
   for(const token of [other.token,display.token]) assert.equal((await fetch(server.base+path+'/'+pending,{headers:{authorization:`Bearer ${token}`}})).status,403);
   const ownImage=await fetch(server.base+path+'/'+pending,{headers:{authorization:`Bearer ${owner.token}`}});assert.equal(ownImage.status,200);assert.deepEqual(Buffer.from(await ownImage.arrayBuffer()),png());
   const peer=(await request('/api/session-snapshot',other.token)).body;
   assert.doesNotMatch(JSON.stringify(peer),new RegExp(pending));assert.doesNotMatch(JSON.stringify(peer),/silver hair/);
   assert.equal((await request(path+'/review',host,{requestId:'approve-one',referenceId:pending,approve:true})).status,200);
   assert.equal((await fetch(server.base+path+'/'+pending,{headers:{authorization:`Bearer ${other.token}`}})).status,200);
   assert.equal((await fetch(server.base+path+'/'+pending,{headers:{authorization:`Bearer ${display.token}`}})).status,200);
   const publicView=(await request('/api/session-snapshot',display.token)).body;assert.equal(publicView.party.find(c=>c.id===id).portrait.approvedId,pending);assert.doesNotMatch(JSON.stringify(publicView),/silver hair|pendingId/);
   const queued=await request(`/api/characters/${id}/scene-job`,host,{requestId:'scene-one',scenePrompt:'Standing on a demo bridge at dawn'});
   assert.equal(queued.status,200);assert.equal(queued.body.job.settings.referenceId,pending);assert.equal(queued.body.job.visibility,'gm_only');
   assert.equal(queued.body.job.workflowId,'character-scene');assert.doesNotMatch(queued.body.job.prompt,/PRIVATE|Created at level/);
   assert.deepEqual(await request(`/api/characters/${id}/scene-job`,host,{requestId:'scene-one',scenePrompt:'Standing on a demo bridge at dawn'}),queued);
   const newer=await request(path,owner.token,{...input,requestId:'portrait-two',image:data(png(180)),description:'Demo new appearance'});
   assert.equal(newer.status,200);const second=character(newer.body,id).portrait.pendingId;
   assert.notEqual(second,pending);assert.equal(character(newer.body,id).portrait.approvedId,pending);
   assert.equal((await request(path+'/review',host,{requestId:'stale-review',referenceId:pending,approve:true})).status,409);
   assert.equal((await request(path+'/review',host,{requestId:'approve-two',referenceId:second,approve:true})).status,200);
   await server.restart();
   const restored=(await request('/api/session-snapshot',host)).body;
   assert.equal(restored.party.find(c=>c.id===id).portrait.approvedId,second);
   assert.equal(restored.mediaJobs.find(j=>j.id===queued.body.job.id).settings.referenceId,pending);
   const firstRecord=JSON.parse(db.prepare('SELECT value FROM meta WHERE key=?').get(`character-portrait:${id}:${pending}`).value);
   assert.deepEqual(Buffer.from(firstRecord.image.split(',')[1],'base64'),png());
   assert.deepEqual(await request(path,owner.token,input),uploaded);
  } finally {db.close();}
 });
});

test('reference upload confirmation and workflow substitution preserve image, seed and escaped prompt data',async()=>{
 const prompt='Demo "hero"\nby a bridge {{referenceImageName}}';
 const workflow=fillWorkflow({prompt:'{{positivePrompt}}',seed:'{{seed}}',image:'{{referenceImageName}}'},{prompt,seed:123,negativePrompt:'',referenceName:'renamed.png'});
 // Text containing template-like characters must remain text, never become another input.
 assert.equal(workflow.seed,123);assert.equal(workflow.image,'renamed.png');assert.equal(workflow.prompt,prompt);
 assert.doesNotThrow(()=>JSON.parse(JSON.stringify(workflow)));
 let calls=0;
 const name=await uploadReference(async(url,init)=>{calls++;assert.ok(init.signal);assert.deepEqual(Buffer.from(await init.body.get('image').arrayBuffer()),png());return Response.json({name:'server-renamed.png',type:'input',subfolder:''});},'http://demo',{id:'demo',referenceImage:data(png())});
 assert.equal(name,'server-renamed.png');assert.equal(calls,1);
 for(const response of [new Response('',{status:500}),Response.json({name:'../bad.png',type:'input'}),Response.json({name:'good.png',type:'output'})]) await assert.rejects(uploadReference(async()=>response,'http://demo',{id:'demo',referenceImage:data(png())}));
});

test('router client sends pinned reference bytes once and rejects altered retry input',async()=>{
 const reference={referenceImage:data(png()),seed:123,referenceId:'a'.repeat(64)};let calls=0,payload;
 const job={id:'demo-ref',workflowId:'character-scene',type:'image',status:'queued',prompt:'Demo crossing',settings:{}};
 const client=createMediaRouterClient(async(url,init)=>{calls++;if(url.endsWith('/prepare'))payload=JSON.parse(init.body);return Response.json({ok:true,job:{id:job.id,workflowId:job.workflowId,promptTemplateId:'character-visual-canon',type:job.type,status:url.endsWith('/prepare')?'prepared':'submitted',prompt:job.prompt,negativePrompt:'',referenceId:reference.referenceId,seed:reference.seed,outputRoot:null,readyForComfySubmission:true,warnings:[],createdAt:'demo',...(url.endsWith('/submit')?{comfyPromptId:'demo-prompt'}:{})}});},{reference:()=>reference});
 await client.start('http://demo',job);await client.start('http://demo',job);
 assert.equal(calls,2);assert.equal(payload.referenceImage,reference.referenceImage);assert.equal(payload.seed,123);
 reference.seed=124;await assert.rejects(client.start('http://demo',job),/different input/);client.dispose();
});

test('character output consumes the expected image node and refuses traversal or missing evidence',()=>{
 const directory=resolve('tmp','synthetic-output');
 const image={filename:'character_00001_.png',subfolder:'bde',type:'output'};
 const outputs={'11':{images:[image]}};
 assert.equal(characterOutputPath(outputs,directory),resolve(directory,image.filename));
 for(const invalid of [undefined,{}, {'11':{images:[]}}, {'11':{images:[{...image,filename:'../secret.png'}]}}, {'11':{images:[{...image,subfolder:'private'}]}}])assert.throws(()=>characterOutputPath(invalid,directory));
 assert.throws(()=>characterOutputPath(outputs,''));
});
