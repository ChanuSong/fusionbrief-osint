import {z}from'zod';
import type{SourceDocument,VisualFinding,ResearchTrace}from'../shared/types.ts';
import type{JsonModel}from'./model.ts';
import{readMedia}from'./media-cache.ts';
const findingSchema=z.object({findings:z.array(z.object({sourceId:z.string(),mediaHash:z.string(),description:z.string().min(1).max(450),
  relevant:z.boolean(),relevance:z.string().max(350),identityQuote:z.string().max(600),limitations:z.array(z.string().max(200)).min(1).max(5)})).max(6)});
const auditSchema=z.object({verdicts:z.array(z.object({mediaHash:z.string(),supported:z.boolean(),relevanceBounded:z.boolean(),identityGrounded:z.boolean(),reason:z.string().max(350)})).max(6)});
export async function analyzeImagery(question:string,sources:SourceDocument[],model:JsonModel,emit:(stage:string,message:string,status?:ResearchTrace['status'])=>void):Promise<VisualFinding[]> {
  if(!model.generateVision)return [];
  const selected=[...sources].sort((a,b)=>Number(b.attribution?.control==='dprk-state')-Number(a.attribution?.control==='dprk-state'))
    .filter(s=>s.media?.some(m=>m.hash) && /김주애|Ju[ -]?Ae|daughter|자제분|Kim Yo Jong|김여정|satellite|위성/i.test(s.body+' '+s.title))
    .flatMap(source=>(source.media??[]).filter(media=>media.hash && media.kind!=='video').slice(0,1).map(media=>({source,media})))
    .filter((item,i,all)=>all.findIndex(other=>other.media.hash===item.media.hash)===i).slice(0,3);
  const candidates=await Promise.all(selected.map(async item=>({...item,asset:await readMedia(item.media.hash!)})));
  const ready=candidates.filter((item):item is typeof item & {asset:NonNullable<typeof item.asset>}=>!!item.asset);
  if(!ready.length)return [];
  emit('시각 판독',`원본 이미지 ${ready.length}개의 관측 가능한 내용을 별도로 대조합니다.`,'running');
  try{
    const context={question,images:ready.map((item,i)=>({file:`public-image-${i+1}`,sourceId:item.source.id,mediaHash:item.media.hash,
      caption:item.media.caption,credit:item.media.credit,attribution:item.source.attribution,context:item.source.body.slice(0,2000)}))};
    const images=ready.map(item=>item.asset);
    const draft=await model.generateVision(findingSchema,'Write description, relevance and limitations in Korean. Describe only directly visible position, arrangement, interaction, clothing or geographic features relevant to the question. No recognition of people from faces. Named identity requires exact identityQuote copied from source context; if not sufficient use empty string and describe unnamed figures. Never infer official office, authority, intent, age, actual leadership transfer or hidden elite acceptance from pixels. Do not invent resolution or capture date. State image limitations. Mark irrelevant images relevant=false.',context,images);
    const checked=await model.generateVision(auditSchema,'You are an independent visual verifier. Read the SAME images and audit EVERY material description against actual pixels. Check relevance is bounded, identities are only attributed to exact source text and political authority is not inferred from posture or a staged scene. Reject unsupported descriptions; image metadata is not proof of capture date or authentic unstaged events.',{...context,draft},images);
    const results:VisualFinding[]=draft.findings.flatMap(f=>{
      const item=ready.find(item=>item.media.hash===f.mediaHash && item.source.id===f.sourceId);
      const verdict=checked.verdicts.filter(v=>v.mediaHash===f.mediaHash);
      if(!item || !f.relevant || draft.findings.filter(other=>other.mediaHash===f.mediaHash).length!==1 || verdict.length!==1
        || !verdict[0].supported || !verdict[0].relevanceBounded || !verdict[0].identityGrounded || f.identityQuote && !item.source.body.includes(f.identityQuote))return [];
      item.media.analysis='visual-reviewed';
      return [{sourceId:f.sourceId,mediaHash:f.mediaHash,description:f.description,relevance:f.relevance,identityQuote:f.identityQuote,
        limitations:[...new Set([...f.limitations,'배포된 이미지의 시각적 관측은 승계 지명·권한·연출되지 않은 상황을 입증하지 않습니다.'])],verified:true}];
    });
    emit('시각 판독',`원본 이미지 ${ready.length}개 중 관측 설명 ${results.length}개 독립 검증`,'complete');return results;
  }catch(error){emit('시각 판독',`직접 판독 미완료 · ${error instanceof Error ? error.message : '영상 모델 연결 오류'} · 캡션·본문 대조 범위로 제한합니다.`,'failed');return [];}
}
