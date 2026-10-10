import type { SourceModule } from './types.ts';
export const SOURCE_MODULES: Record<SourceModule, { label: string; capability: string; limits: string }> = {
  official: { label: '정부·공공기관', capability: '공개 발표·문서·PDF', limits: '비공개 브리핑은 공개 전달 경로를 표시' },
  news: { label: '언론', capability: '다국어 공개 기사·현장 보도', limits: '통신사 전재와 원발표 재인용을 묶음 처리' },
  'state-media': { label: '북한 발신 매체', capability: '북한 원문·공개 보존본·매체 목록 탐색', limits: '같은 체제의 매체는 자동 독립 판정하지 않음' },
  papers: { label: '연구·논문', capability: 'Crossref 초록·공개 연구기관 원문', limits: '논문 초록과 전체 본문을 구분' },
  discussion: { label: '공개 논의', capability: '검색에 노출된 게시물·영상 페이지', limits: '본문을 확보한 자료만 근거로 사용' },
  social: { label: 'SNS', capability: '공개 게시물 검색·원문·재전파 경로', limits: '계정 인증·비공개 게시물·전체 여론 대표성 미보장' },
  images: { label: '사진·영상', capability: '공개 보도 사진·영상 링크·캡션·크레디트', limits: '캡션 대조와 직접 영상 판독을 구분' },
  satellite: { label: '위성영상', capability: 'Sentinel-2 공개 STAC 관측·미리보기 및 공개 영상 분석', limits: '좌표가 필요하며 구름·해상도 제한과 픽셀 판독 여부를 표시' },
  aviation: { label: '항적', capability: '공개 항적 기록·공항·항공기관 발표 검색', limits: '실시간 전세계 ADS-B 피드나 북한 전역 커버리지 미보장' },
  maritime: { label: '선박', capability: '공개 AIS 기록·항만·해운기관 자료 검색', limits: '상용 AIS 피드 미연결; 송신 공백은 부재 증거가 아님' },
  patents: { label: '특허', capability: '공개 특허 공보·WIPO·특허청·Google Patents 검색', limits: '출원·등록·실제 구현과 배치를 구분' },
};
export const MODULE_IDS = Object.keys(SOURCE_MODULES) as SourceModule[];
