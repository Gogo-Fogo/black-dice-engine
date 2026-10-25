import React,{useEffect,useState} from 'react';
import {isCharacter,type Character} from '../packages/contracts/dist/index.js';
import {apiFetch} from './session-client';

export function CharacterPortrait({character,pending=false,request=apiFetch}:{character:Character;pending?:boolean;request?:typeof fetch}) {
  const id=pending?character.portrait?.pendingId:character.portrait?.approvedId;
  const [image,setImage]=useState<{id:string;url:string}|null>(null),[failed,setFailed]=useState(false);
  useEffect(()=>{
    if(!id)return;
    let active=true,url:string|undefined;const controller=new AbortController();setFailed(false);
    void request(`/api/characters/${encodeURIComponent(character.id)}/portrait/${id}`,{signal:controller.signal}).then(async response=>{
      if(!response.ok||response.headers.get('content-type')?.split(';')[0]!=='image/png')throw Error();
      const blob=await response.blob();if(blob.size>512*1024)throw Error();
      if(active){url=URL.createObjectURL(blob);setImage({id,url});}
    }).catch(()=>{if(active)setFailed(true);});
    return()=>{active=false;controller.abort();if(url)URL.revokeObjectURL(url);};
  },[character.id,id,request]);
  if(!id)return <div className="character-avatar-placeholder" aria-label={`No approved portrait for ${character.name}`}>{character.name.slice(0,1).toUpperCase()}</div>;
  return image?.id===id?<img className="character-portrait" src={image.url} alt={`${character.name}${pending?' submitted reference':' approved portrait'}`}/>:<p role="status">{failed?'Portrait unavailable. Reopen this view to retry.':'Loading portrait…'}</p>;
}

/** Resize and strip metadata before upload; the server validates the PNG independently. */
export async function preparePortrait(file:File) {
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>15*1024*1024)throw Error('Choose a PNG, JPEG or WebP image smaller than 15 MB.');
  const bitmap=await createImageBitmap(file);
  try{
    if(bitmap.width*bitmap.height>64000000)throw Error('Choose an image smaller than 64 megapixels.');
    const canvas=document.createElement('canvas'),context=canvas.getContext('2d');if(!context)throw Error('Image processing is unavailable in this browser.');
    for(let edge=768;edge>=128;edge=Math.floor(edge*.75)){
      const scale=Math.min(1,edge/Math.max(bitmap.width,bitmap.height));canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));context.drawImage(bitmap,0,0,canvas.width,canvas.height);
      const image=canvas.toDataURL('image/png');if(image.length<690000)return image;
    }
    throw Error('Crop the character and try again; this image is too detailed.');
  }finally{bitmap.close();}
}

export function CharacterArtwork({character,host=false,editable=false,disabled=false}:{character:Character;host?:boolean;editable?:boolean;disabled?:boolean}) {
  const [description,setDescription]=useState(character.portrait?.description??'');
  const [scenePrompt,setScenePrompt]=useState('');
  const [attempt,setAttempt]=useState<{path:string;body:Record<string,unknown>}|null>(null);
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
  const [current,setCurrent]=useState(character);
  useEffect(()=>{setCurrent(character);},[character]);
  useEffect(()=>{setDescription(character.portrait?.description??'');},[character.id,character.portrait?.pendingId,character.portrait?.approvedId]);
  const send=async(next:NonNullable<typeof attempt>)=>{
    setAttempt(next);setBusy(true);setError('');setMessage('Saving reference…');
    try{
      const response=await apiFetch(next.path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(next.body),signal:AbortSignal.timeout(15000)}),value=await response.json();
      if(!response.ok){if(response.status>=400&&response.status<500&&![408,429].includes(response.status))setAttempt(null);throw Error(typeof value.error==='string'?value.error:'Reference could not be saved.');}
      const saved=value.sessionSnapshot?.party?.find((c:unknown)=>isCharacter(c)&&c.id===character.id);
      if(!isCharacter(saved)||value.command?.requestId!==next.body.requestId)throw Error('Save not confirmed. Retry the same action.');
      setCurrent(saved);setAttempt(null);setMessage(next.path.endsWith('/scene-job')?'Scene queued for GM review. Start it in the media queue.':'Reference saved. Only GM-approved portraits are shared with the table.');
    }catch(e){setMessage('');setError(e instanceof Error?e.message:'Connection lost. Confirm the pending reference.');}
    finally{setBusy(false);}
  };
  const command=(action:string,fields:Record<string,unknown>)=>({path:`/api/characters/${encodeURIComponent(character.id)}/portrait${action}`,body:{requestId:crypto.randomUUID(),...fields}});
  const pending=current.portrait?.pendingId;
  return <section className="character-artwork" aria-label={`${character.name} artwork`}>
    <CharacterPortrait character={current}/>
    {pending&&(editable||host)&&<div><p>Awaiting GM review</p><CharacterPortrait character={current} pending/>{current.portrait?.description&&<p>{current.portrait.description}</p>}</div>}
    {(editable||host)&&<><label>Appearance to preserve<textarea maxLength={600} value={description} disabled={busy||!!attempt||disabled} onChange={e=>setDescription(e.target.value)} placeholder="Hair, face, clothing, distinctive features…"/></label>
      <label>Upload character image<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy||!!attempt||disabled} onChange={e=>{
        const file=e.target.files?.[0];e.target.value='';if(!file)return;setBusy(true);setError('');
        void preparePortrait(file).then(image=>send(command('',{image,description}))).catch(reason=>{setError(reason instanceof Error?reason.message:'Image could not be processed.');setBusy(false);});
      }}/></label><p className="artwork-help">Resized, metadata removed. The GM approves the reference before it is shared or used for generation.</p></>}
    {host&&pending&&<div><button disabled={busy||!!attempt||disabled} onClick={()=>void send(command('/review',{referenceId:pending,approve:true}))}>Approve portrait</button><button disabled={busy||!!attempt||disabled} onClick={()=>void send(command('/review',{referenceId:pending,approve:false}))}>Reject submission</button></div>}
    {host&&current.portrait?.approvedId&&<><label>Campaign scene<textarea maxLength={1200} value={scenePrompt} disabled={busy||!!attempt||disabled} onChange={e=>setScenePrompt(e.target.value)} placeholder="Describe the action and setting. Include only details suitable for players."/></label><button disabled={busy||!!attempt||disabled||!scenePrompt.trim()} onClick={()=>void send({path:`/api/characters/${encodeURIComponent(character.id)}/scene-job`,body:{requestId:crypto.randomUUID(),scenePrompt:scenePrompt.trim()}})}>Queue scene with approved reference</button><p className="artwork-help">Pins this approved image, appearance and seed. Requires the local ComfyUI IPAdapter workflow. The generated scene stays private until the GM shares it.</p></>}
    {attempt&&<button disabled={busy||disabled} onClick={()=>void send(attempt)}>{busy?'Confirming…':'Confirm pending reference'}</button>}
    {message&&<p role="status">{message}</p>}{error&&<p role="alert">{error}</p>}
  </section>;
}
