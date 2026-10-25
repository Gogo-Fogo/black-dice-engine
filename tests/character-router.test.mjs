import assert from 'node:assert/strict';
import {test} from 'node:test';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdir,mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {png} from './helpers/portrait-fixture.mjs';

test('actual router submits confirmed reference once, preserves prompt/seed and fails closed on upload failure',{timeout:15000},async()=>{
 const root=resolve('.'),temporary=resolve(root,'tmp');await mkdir(temporary,{recursive:true});const folder=await mkdtemp(resolve(temporary,'character-router-'));
 const capture=resolve(folder,'submitted.jsonl'),preload=resolve(folder,'mock.mjs');
 await writeFile(preload,`import {appendFileSync} from 'node:fs';
globalThis.fetch=async(url,init)=>{
 if(url==='http://127.0.0.1:1/upload/image'){
  const file=init.body.get('image');
  if(file.name.includes('fail-reference'))return new Response('',{status:503});
  return Response.json({name:'confirmed-reference.png',subfolder:'',type:'input'});
 }
 if(url==='http://127.0.0.1:1/prompt'){
  appendFileSync(${JSON.stringify(capture)},init.body+'\\n');
  await new Promise(resolve=>setTimeout(resolve,40));
  return Response.json({prompt_id:'synthetic-prompt'});
 }
 throw Error('Unexpected synthetic outgoing request');
};`);
 const env=Object.fromEntries(['PATH','SystemRoot','WINDIR','TEMP','TMP'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
 Object.assign(env,{BDE_HOST:'127.0.0.1',BDE_COMFY_ROUTER_PORT:'0',BDE_COMFY_API_BASE:'http://127.0.0.1:1',BDE_COMFY_OUTPUT_ROOT:resolve(folder,'output')});
 const built=process.env.BDE_TEST_BUILT==='1';
 const child=spawn(process.execPath,[...(built?[]:['--import','tsx']),'--import',pathToFileURL(preload).href,`services/comfy-router/${built?'dist/index.js':'src/index.ts'}`],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
 const exited=once(child,'exit');let output='';child.stderr.on('data',chunk=>{output+=chunk;});
 try{
  const base=await new Promise((accept,reject)=>{const timer=setTimeout(()=>reject(Error(output)),6000);child.once('error',e=>{clearTimeout(timer);reject(e);});child.once('exit',()=>{clearTimeout(timer);reject(Error(output));});child.stdout.on('data',chunk=>{output+=chunk;const match=output.match(/listening on (http:\/\/127\.0\.0\.1:\d+)/);if(match){clearTimeout(timer);accept(match[1]);}});});
  const post=async(path,body)=>{const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(3000)});return {status:response.status,body:await response.json()};};
  const prompt='Demo "silver-haired hero"\nnear a bridge {{referenceImageName}}';
  const payload={id:'confirmed-reference',workflowId:'character-scene',prompt,referenceImage:'data:image/png;base64,'+png().toString('base64'),referenceId:'b'.repeat(64),seed:123};
  const prepared=await post('/api/jobs/prepare',payload);assert.equal(prepared.status,200);assert.equal(prepared.body.job.referenceImage,undefined);
  assert.equal((await post('/api/jobs/prepare',payload)).status,409);
  const submitted=await Promise.all([post('/api/jobs/confirmed-reference/submit'),post('/api/jobs/confirmed-reference/submit')]);assert.deepEqual(submitted.map(r=>r.status),[200,200]);
  const rows=(await readFile(capture,'utf8')).trim().split('\n').map(JSON.parse);assert.equal(rows.length,1);
  const workflow=rows[0].prompt;assert.equal(workflow['2'].inputs.text,prompt);assert.equal(workflow['4'].inputs.noise_seed,123);assert.equal(workflow['13'].inputs.image,'confirmed-reference.png');assert.equal(workflow['15'].class_type,'ReferenceLatent');assert.deepEqual(workflow['8'].inputs.conditioning,['15',0]);assert.equal(workflow['11'].class_type,'SaveImage');
  assert.equal((await post('/api/jobs/prepare',{...payload,id:'fail-reference'})).status,200);
  assert.equal((await post('/api/jobs/fail-reference/submit')).status,502);
  assert.equal((await readFile(capture,'utf8')).trim().split('\n').length,1);
  assert.equal((await post('/api/jobs/prepare',{...payload,id:'missing-reference',referenceImage:undefined})).status,200);
  assert.equal((await post('/api/jobs/missing-reference/submit')).status,502);
  assert.equal((await readFile(capture,'utf8')).trim().split('\n').length,1);
 }finally{if(child.exitCode===null&&child.signalCode===null)child.kill();await exited;assert.ok(resolve(folder).startsWith(temporary+sep));await rm(folder,{recursive:true,force:true});}
});
