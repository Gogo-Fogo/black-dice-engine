import {join} from 'node:path';

/** Consume only the known SaveImage node inside the configured bde output directory. */
export function characterOutputPath(outputs:Record<string,unknown>|undefined, directory:string) {
  const node=outputs?.['11'];
  if(!directory||!node||typeof node!=='object'||!('images' in node)||!Array.isArray(node.images)||node.images.length!==1) throw Error('Character workflow did not report one image in the configured output directory.');
  const image=node.images[0];
  if(!image||typeof image.filename!=='string'||!/^[a-zA-Z0-9_-]+\.png$/.test(image.filename)||image.subfolder!=='bde'||image.type!=='output') throw Error('Character output location was not confirmed.');
  return join(directory,image.filename);
}
