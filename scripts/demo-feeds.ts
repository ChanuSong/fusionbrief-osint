import type { SimulatedFeed } from '../shared/types.ts';
/** Explicitly synthetic. Never inserted into source/evidence/claim arrays or model context. */
export function demoFeeds(createdAt: string, includeSatellite: boolean, includeSocial: boolean): SimulatedFeed[] {
  const common = { createdAt, excludedFromAssessment: true as const };
  const points = (rows: [number, number, 'received' | 'gap'][]) => rows.map(([longitude,latitude,state], i) => ({ longitude,latitude,state,at:`2026-10-11T0${i}:00:00Z` }));
  const feeds: SimulatedFeed[] = [
    { ...common, id:'SIM-FLIGHT-01', module:'aviation', title:'민간 항공 경로 대조 · 합성 예시', description:'외부 실시간 ADS-B 피드가 연결되지 않은 경우의 경로 탐색 시연입니다. 편명·등록번호와 위치는 실제 항공기를 뜻하지 않습니다. 좌표 연결은 모의 항로이며 위험 회피가 실제로 발생했다는 판단에 쓰지 않습니다.', points:points([[128.4,36.1,'received'],[129.1,37.0,'received'],[130.3,38.2,'received'],[131.2,39.2,'received'],[131.8,40.2,'received'],[132.4,41.6,'received']]) },
    { ...common, id:'SIM-VESSEL-01', module:'maritime', title:'선박 위치·관측 공백 대조 · 합성 예시', description:'실시간 AIS 피드가 미연결된 상태의 탐색 기능을 시연합니다. 실제 선명·MMSI·IMO 번호는 사용하지 않았습니다. 황색 점의 모의 공백은 정박·침몰·군사 행동의 증거가 아닙니다.', points:points([[129.2,36.8,'received'],[129.5,37.1,'received'],[129.9,37.6,'gap'],[130.3,38.2,'received'],[130.6,38.7,'received']]) },
  ];
  if (includeSocial) feeds.push({ ...common, id:'SIM-SOCIAL-01', module:'social', title:'게시물 재전파 경로 · 합성 예시', description:'본문을 확보하지 못한 SNS의 검증 흐름을 보여주는 모의 게시물입니다. 실제 플랫폼에 게시되지 않았으며 여론·출처·사건 확인 수에 포함하지 않습니다.', posts:[
    { id:'SIM-POST-A', text:'발행일과 시험 실시일을 구분하고 공식 원문을 대조해 주세요. (합성 문구)', at:'2026-10-11T00:00:00Z', repeats:4 },
    { id:'SIM-POST-B', text:'같은 발표를 옮긴 게시물입니다. 별개의 현장 확인으로 계산하지 않습니다. (합성 문구)', at:'2026-10-11T00:20:00Z', repeats:2 },
  ] });
  if (includeSatellite) feeds.push({ ...common, id:'SIM-SATELLITE-01', module:'satellite', title:'관측 프레임 비교 · 코드로 만든 모의 영상', description:'관측 가능한 최신 위성영상이 확보되지 않은 경우의 프레임 대조 시연입니다. 이 도형은 실제 지형·시설·위성 사진이 아니며 북한 활동의 증거가 아닙니다.', cells:[{x:110,y:100,label:'관측 영역 A'},{x:340,y:200,label:'관측 영역 B'},{x:580,y:130,label:'가림 영역'}] });
  return feeds;
}
