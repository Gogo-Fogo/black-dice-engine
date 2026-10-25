import React, {useEffect,useState} from 'react';
import {apiFetch,sessionIdentity} from '../../session-client';
import {preparePortrait} from '../../character-artwork';

export const abilities=([['str','STR'],['dex','DEX'],['con','CON'],['int','INT'],['wis','WIS'],['cha','CHA']] as const).map(([key,short])=>({key,short}));
export const abilityModifier=(score:number)=>Math.floor((score-10)/2);
export const formatMod=(value:number)=>value>=0?`+${value}`:String(value);
export const haptic=(pattern:number|number[])=>{try{navigator.vibrate?.(pattern);}catch{/* Optional feedback. */}};
export async function getJson<T>(path:string):Promise<T>{
  const response=await apiFetch(path,{signal:AbortSignal.timeout(12000)}),value=await response.json();
  if(!response.ok)throw Error(typeof value.error==='string'?value.error:'The table could not complete this request.');
  return value as T;
}
export async function postJson<T>(path:string,body:unknown):Promise<T>{
  const response=await apiFetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)}),value=await response.json();
  if(!response.ok)throw Error(typeof value.error==='string'?value.error:'The table could not save this request.');
  return value as T;
}
const storageKey=(fingerprint:string)=>`bde:${sessionIdentity().sessionId}:${sessionIdentity().actorId}:${fingerprint}`;
const pending=new Map<string,string>();
export function getPendingRequestId(fingerprint:string){
  const key=storageKey(fingerprint);let id=pending.get(key);
  try{id??=sessionStorage.getItem(key)??undefined;}catch{/* In-memory retry remains available. */}
  id??=crypto.randomUUID();pending.set(key,id);try{sessionStorage.setItem(key,id);}catch{/* Keep this view open. */}return id;
}
export function clearPendingRequestId(fingerprint:string){images.clear();choices.delete(storageKey(fingerprint)+':body');try{sessionStorage.removeItem(storageKey(fingerprint)+':body');}catch{/* Confirmation is already durable. */}const key=storageKey(fingerprint);pending.delete(key);try{sessionStorage.removeItem(key);}catch{/* Optional persistence. */}}
const images=new Map<string,Promise<string>>();
/** Freeze the normalized upload for retries; never change a saved command payload. */
export function selectedPortrait(path:string|null|undefined){
  if(!path)return Promise.resolve(undefined);
  let result=images.get(path);
  if(!result){result=(async()=>{const response=await apiFetch(path,{signal:AbortSignal.timeout(8000)});if(!response.ok)throw Error('Portrait unavailable. Choose a different design or try again.');return preparePortrait(new File([await response.blob()],'portrait.png',{type:'image/png'}));})();images.set(path,result);result.catch(()=>images.delete(path));}
  return result;
}
export function ForgeImage({path,alt,onError}:{path:string;alt:string;onError():void}){
  const [source,setSource]=useState('');
  useEffect(()=>{let active=true,url:string|undefined;const controller=new AbortController();
    void apiFetch(path,{signal:controller.signal}).then(async response=>{if(!response.ok)throw Error();const blob=await response.blob();if(active){url=URL.createObjectURL(blob);setSource(url);}}).catch(()=>{if(active)onError();});
    return()=>{active=false;controller.abort();if(url)URL.revokeObjectURL(url);};
  },[path]);
  return source?<img src={source} alt={alt}/>:<span role="status">Loading portrait…</span>;
}

// Keep the full selection payload, including an absent image, stable after a lost reply.
const choices=new Map<string,Record<string,unknown>>();
export function pendingChoice(fingerprint:string){
  const key=storageKey(fingerprint)+':body';let body=choices.get(key);
  if(!body){try{const raw=sessionStorage.getItem(key);if(raw)body=JSON.parse(raw);}catch{throw Error('Pending selection could not be recovered. Keep this page open and refresh the saved sheet.');}}
  return body;
}
export function saveChoice(fingerprint:string,body:Record<string,unknown>){
  const key=storageKey(fingerprint)+':body';
  try{sessionStorage.setItem(key,JSON.stringify(body));}catch{throw Error('Browser storage is full or unavailable. Free space before choosing a character.');}
  choices.set(key,body);return body;
}
