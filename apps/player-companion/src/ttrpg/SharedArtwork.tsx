import React,{useEffect,useState} from 'react';
import {apiFetch} from '../../../session-client';
import {AssetImage} from '../../../gm-dashboard/src/ttrpg/AssetImage';
import type {PlayerSessionSnapshot} from '../../../../packages/contracts/dist/index.js';

export function SharedArtwork({snapshot,active}:{snapshot:PlayerSessionSnapshot|null;active:boolean}) {
  const [images,setImages]=useState<{filename:string;url:string}[]>([]),[error,setError]=useState('');
  useEffect(()=>{
    if(!active)return;
    const controller=new AbortController();let current=true;
    void apiFetch('/api/images',{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(5000)])}).then(async response=>{
      const body=await response.json();if(!response.ok||!Array.isArray(body.images)||body.images.length>20||body.images.some((item:{filename?:unknown;url?:unknown})=>typeof item.filename!=='string'||item.url!==`/api/assets/${encodeURIComponent(item.filename)}/content`))throw Error('Shared images could not be loaded.');
      if(current){setImages(body.images);setError('');}
    }).catch(()=>{if(current)setError('Shared images unavailable. Reopen Table to retry.');});
    return()=>{current=false;controller.abort();};
  },[snapshot,active]);
  return <article className="panel"><h2>Shared campaign art</h2>{error&&<p role="alert">{error}</p>}<div className="character-gallery">{images.map(image=><AssetImage key={image.filename} request={apiFetch} src={image.url} alt="Campaign image shared by the GM" className="character-portrait"/>)}</div>{!images.length&&!error&&<p>No shared campaign images yet.</p>}</article>;
}
