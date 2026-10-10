import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import type { SourceDocument } from '../shared/types.ts';
import { publicFetch } from './public-sources.ts';
const directory = () => resolve(process.env.TRACE_MEDIA_DIRECTORY ?? '.local/media');
function imageType(body: Buffer): string | undefined {
  if (body.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (body[0]===255 && body[1]===216 && body[2]===255) return 'image/jpeg';
  if (body.subarray(0,4).toString()==='RIFF' && body.subarray(8,12).toString()==='WEBP') return 'image/webp';
  return undefined;
}
export async function preserveMedia(media: NonNullable<SourceDocument['media']>): Promise<void> {
  await mkdir(directory(),{recursive:true});
  await Promise.all(media.slice(0,3).map(async item => {
    if (item.kind==='video') return;
    try {
      const response = await publicFetch(item.url);
      const contentType = imageType(response.body);
      if (!contentType || response.body.length > 5_000_000) throw new Error('지원 이미지 형식 또는 크기 범위 밖');
      const hash = createHash('sha256').update(response.body).digest('hex');
      await writeFile(resolve(directory(),hash),response.body,{flag:'wx'}).catch(error=>{if ((error as NodeJS.ErrnoException).code!=='EEXIST') throw error;});
      item.hash=hash; item.contentType=contentType;
    } catch(error) { item.unavailable=error instanceof Error ? error.message.slice(0,180) : '이미지 원본 확보 실패'; }
  }));
}
export async function readMedia(hash: string): Promise<{body:Buffer;contentType:string} | undefined> {
  if (!/^[a-f0-9]{64}$/.test(hash)) return;
  for (const location of [directory(),resolve('data/demo/media')]) try {
    const body=await readFile(resolve(location,hash)); const contentType=imageType(body);
    if (!contentType || createHash('sha256').update(body).digest('hex')!==hash) return;
    return {body,contentType};
  } catch(error) { if ((error as NodeJS.ErrnoException).code!=='ENOENT') throw error; }
}
