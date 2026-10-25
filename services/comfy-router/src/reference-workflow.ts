/** Substitute values, never serialized JSON: quotes/newlines remain prompt data. */
export function fillWorkflow(value: unknown, values: {prompt:string; negativePrompt:string; seed:number; referenceName:string}): unknown {
  if (typeof value === 'string') {
    if (value === '{{seed}}') return values.seed;
    const replacements:Record<string,string>={'positivePrompt':values.prompt,'negativePrompt':values.negativePrompt,'referenceImageName':values.referenceName};
    return value.replace(/\{\{(positivePrompt|negativePrompt|referenceImageName)\}\}/g,(_match,key:string)=>replacements[key]);
  }
  if (Array.isArray(value)) return value.map(item=>fillWorkflow(item,values));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,fillWorkflow(item,values)]));
  return value;
}

export async function uploadReference(request: typeof fetch, endpoint: string, job: {id:string; referenceImage?:string}) {
  if (!job.referenceImage || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(job.referenceImage) || job.referenceImage.length > 750000) throw new Error('A valid PNG character reference is required.');
  const bytes = Buffer.from(job.referenceImage.split(',')[1], 'base64');
  const form = new FormData(); form.append('image', new Blob([bytes],{type:'image/png'}),`bde-reference-${job.id.replace(/[^a-zA-Z0-9_-]/g,'').slice(0,64)}.png`);
  const response = await request(endpoint+'/upload/image',{method:'POST',body:form,signal:AbortSignal.timeout(10000)});
  if (!response.ok) throw new Error('Character reference upload failed. No generation was submitted.');
  const reader=response.body?.getReader(); if(!reader)throw Error('Missing upload confirmation.');
  const chunks:Uint8Array[]=[];let size=0;
  try {for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384)throw Error('Invalid upload confirmation.');chunks.push(value);}}
  finally {void reader.cancel().catch(()=>{});reader.releaseLock();}
  const value = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {name?:unknown; subfolder?:unknown; type?:unknown};
  if (typeof value.name !== 'string' || !/^[a-zA-Z0-9_. -]+\.png$/.test(value.name) || value.name.includes('..') ||
      value.type !== 'input' || value.subfolder !== undefined && value.subfolder !== '') throw new Error('Character reference upload was not confirmed.');
  return value.name;
}
