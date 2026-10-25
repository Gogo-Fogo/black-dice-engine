import React, {useEffect,useRef,useState} from 'react';
import {isPlayerSessionSnapshot,type PlayerSessionSnapshot} from '../../../packages/contracts/dist/index.js';
import {apiFetch,rememberSession} from '../../session-client';
import {Stage} from './stage';

/** Both preview and TV use a spectator credential: filtering happens on the server. */
export function StageApp({request=apiFetch,fullscreen=true}:{request?:typeof fetch;fullscreen?:boolean}){
  const [snapshot,setSnapshot]=useState<PlayerSessionSnapshot|null>(null);
  const [image,setImage]=useState<{filename:string;url:string}|null>(null);
  const [error,setError]=useState('');
  const revision=useRef(-1);
  useEffect(()=>{
    let active=true;const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
    const poll=async()=>{
      try{
        const response=await request('/api/session-snapshot',{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(5000)])}),value:unknown=await response.json();
        if(!response.ok||!isPlayerSessionSnapshot(value))throw Error();
        const imagesResponse=await request('/api/images',{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(5000)])}),images=await imagesResponse.json();
        if(!imagesResponse.ok||!Array.isArray(images.images)||images.images.some((item:{filename?:unknown;url?:unknown})=>typeof item.filename!=='string'||item.url!==`/api/assets/${encodeURIComponent(item.filename)}/content`))throw Error();
        if(active&&value.revision>=revision.current){revision.current=value.revision;setSnapshot(value);setImage(images.images[0]??null);setError('');}
      }catch{if(active){setImage(null);setSnapshot(null);setError('Display disconnected. Shared artwork is hidden while reconnecting.');}}
      finally{if(active)timer=setTimeout(()=>void poll(),2000);}
    };
    void poll();return()=>{active=false;controller.abort();clearTimeout(timer);};
  },[request]);
  const text=snapshot?.campaignProgress?.actions.at(-1)?.consequence||snapshot?.memoryEntries[0]?.summary||'';
  return <div className={fullscreen?'stage-window':'stage-frame'}>
    <Stage snapshot={snapshot} art={{latest:image,generating:null}} narration={{text,speaking:false,progress:1}} latestRoll={snapshot?.rollLog[0]??null} onRollShown={()=>{}} fullscreen={fullscreen} stageRequest={request}/>
    {error&&<p className="stage-offline" role="status">{error}</p>}
    {fullscreen&&<div className="stage-window-controls"><button type="button" onClick={()=>{void document.documentElement.requestFullscreen?.().catch(()=>{});}}>Fullscreen</button></div>}
  </div>;
}

export function StagePreview(){
  const [request,setRequest]=useState<typeof fetch|null>(null),[error,setError]=useState('');
  useEffect(()=>{let active=true;void(async()=>{
    try{
      const response=await apiFetch('/api/session/display',{method:'POST',signal:AbortSignal.timeout(5000)}),credential=await response.json();
      if(!response.ok)throw Error();rememberSession(credential);
      if(active)setRequest(()=>((input,init)=>fetch(input,{...init,headers:{...Object.fromEntries(new Headers(init?.headers)),Authorization:`Bearer ${credential.token}`}})) as typeof fetch);
    }catch{if(active)setError('Could not prepare the public display. Reopen Stage to retry.');}
  })();return()=>{active=false;};},[]);
  return <section className="stage-pane"><div className="stage-toolbar"><a className="gm-btn" href="?mode=ttrpg&view=stage" target="_blank" rel="opener">Open on TV</a><p>Shows public-approved artwork, portraits and campaign updates. Voice generation is off.</p></div>{error&&<p role="alert">{error}</p>}{request&&<StageApp request={request} fullscreen={false}/>}</section>;
}

export default StageApp;
