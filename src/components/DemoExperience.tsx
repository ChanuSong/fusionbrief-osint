import { useEffect, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, LoaderCircle, Play, X } from 'lucide-react';
import type { AnalysisRun } from '../../shared/types.ts';
import type { DemoScenario } from '../../shared/demo.ts';
import { request, dateTime } from '../lib.ts';
import type { EvidenceView } from './ReportView.tsx';
const time = (ms: number) => `${Math.floor(ms / 60000)}분 ${Math.floor(ms / 1000) % 60}초`;
export function DemoLauncher({ locked, loading, onStart }: { locked: boolean; loading: boolean; onStart: (id: string) => void }) {
  const [scenarios, setScenarios] = useState<DemoScenario[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { const controller = new AbortController(); request<{ scenarios: DemoScenario[] }>('/api/demo', { signal: controller.signal }).then(result => setScenarios(result.scenarios)).catch(e => { if (!controller.signal.aborted) setError(e.message); }); return () => controller.abort(); }, []);
  if (!scenarios.length && !error) return null;
  return <section aria-busy={loading} className="demo-launcher" aria-labelledby="demo-launch-title"><div className="section-heading"><h2 id="demo-launch-title">5분 시연</h2><span>공개 원문과 검증 결과 사전 준비</span></div>
    <p>저장된 분석을 바로 열고, 원문 대조부터 분석가 승인까지 직접 진행합니다.</p>
    {loading ? <p className="demo-load-status" role="status"><LoaderCircle size={15} className="spinning" />저장된 보고서와 원문을 불러오는 중…</p> : null}
    {error ? <p role="status">시연 목록을 불러오지 못했습니다. {error}</p> : <div className="demo-scenarios">{scenarios.map(item => <article key={item.id}><span className="eyebrow">{item.main ? '대표 사례' : '추가 사례'}</span><h3>{item.title}</h3><p>{item.subtitle}</p><div className="demo-source-count">{item.documents}개 문서 · {item.citations}개 인용 · {item.languages.map(l => l.toUpperCase()).join(' / ')}</div><small>자료 준비 {dateTime(item.preparedAt)}</small><button className="secondary-button" disabled={locked} onClick={() => onStart(item.id)}><Play size={14} />{item.main ? '5분 시연 시작' : '추가 사례 열기'}<ArrowRight size={14} /></button></article>)}</div>}
  </section>;
}
const STEPS = [
  { title: '판단할 문제', slot: '0:00–0:40', target: 'report-answer', hint: '이 자료로 어떤 판단을 내려도 되는지 설명합니다. 결론과 아직 확인되지 않은 내용을 구분하세요.' },
  { title: '서로 다른 보도 대조', slot: '0:40–1:40', target: 'report-wisdom', hint: '발표와 보도의 관계를 선택해 원문을 확인합니다. 서로 다른 수치가 집계 기간이나 범위의 차이인지, 실제 충돌인지 해석과 한계를 함께 검토합니다.' },
  { title: '시각 브리핑', slot: '1:40–2:30', target: 'report-visuals', hint: '사건 흐름에서 예정일과 발표일을 구분합니다. 출처 의존도 막대를 선택하면 해당 판단의 원문 근거로 연결됩니다.' },
  { title: '원문·다국어 대조', slot: '2:30–3:30', target: 'report-comparison', hint: '언어별 원문과 번역을 열어 같은 발표를 재인용했는지 확인합니다. 지도에서는 공개 좌표의 원문을 확인할 수 있습니다.' },
  { title: '검토·승인', slot: '3:30–4:30', target: 'report-review', hint: '판단별 근거에서 재인용 자료를 같은 원출처로 묶어보세요. 검토 결과와 남은 한계를 적고 승인·보완 요청을 저장합니다.' },
  { title: '보고서 전달', slot: '4:30–5:00', target: 'report-answer', hint: '출처·신뢰도·검토 이력을 포함한 보고서를 내려받고, 추가 사례로 전환할 수 있습니다.' },
];
export function DemoGuide({ run, onView, onExit }: { run: AnalysisRun; onView: (view: EvidenceView) => void; onExit: () => void }) {
  const forecast=run.analysis?.dimension==='forecast';
  const steps=forecast ? [STEPS[0],
    {title:'판단 지표와 근거',slot:'0:40–1:40',target:'report-criteria',hint:'공식 지명, 의전, 위임된 역할을 구분합니다. 지표의 관측 결과에서 인용 원문을 열고 연구 기준의 정의와 한계를 확인하세요.'},
    {title:'관측과 이미지 대조',slot:'1:40–2:30',target:run.imagery?.length ? 'report-imagery' : 'report-behaviors',hint:'배포 사진에서 직접 보이는 내용과 승계에 관한 해석을 구분합니다. 같은 북한 배포 사진을 인용한 여러 매체는 독립 관측이 아닙니다.'},
    {title:'조건부 전망',slot:'2:30–3:30',target:'report-outlook',hint:'가능성과 근거 신뢰도를 각각 확인합니다. 경쟁 설명과 향후 어떤 관측이 판단을 강화하거나 약화할지 검토하세요.'},STEPS[4],STEPS[5]] : STEPS;
  const [step, setStep] = useState(0);
  const [started] = useState(() => run.demo ? Date.parse(run.demo.loadedAt) : Date.now());
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => { const timer = window.setInterval(() => setElapsed(Date.now() - started), 1000); return () => clearInterval(timer); }, [started]);
  const navigate = (next: number) => {
    setStep(next);
    if (next === 3 && !forecast) onView('timeline');
    requestAnimationFrame(() => {
      const target = document.getElementById(steps[next].target);
      if (next === 4) target?.querySelector('details')?.setAttribute('open', '');
      target?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
      target?.focus({ preventScroll: true });
    });
  };
  const item = steps[step];
  return <aside className="demo-guide" aria-label="5분 시연 진행 안내"><div className="demo-guide-top"><b>{step + 1}/6 · {item.title}</b><span>{item.slot}</span><time className={elapsed > 300000 ? 'over-time' : ''}>시연 {time(elapsed)}</time><button className="icon-button" aria-label="시연 안내 닫기" onClick={onExit}><X size={15} /></button></div>
    <p>{item.hint}</p><div className="demo-guide-actions"><button className="ghost-button" disabled={step === 0} onClick={() => navigate(step - 1)}><ChevronLeft size={14} />이전</button>
      {step === 3 && !forecast ? <>{run.events?.length ? <button className="ghost-button" onClick={() => { onView('timeline'); document.getElementById('report-evidence')?.scrollIntoView({ block: 'start' }); }}>타임라인</button> : null}{run.locations?.length ? <button className="ghost-button" onClick={() => { onView('map'); document.getElementById('report-evidence')?.scrollIntoView({ block: 'start' }); }}>지도</button> : null}</> : null}
      {step === 5 ? <a className="primary-button" href={`/api/runs/${run.id}/export`}>보고서 내려받기</a> : <button className="primary-button" onClick={() => navigate(step + 1)}>다음<ChevronRight size={14} /></button>}
    </div></aside>;
}
export function DemoProvenance({ run }: { run: AnalysisRun }) {
  if (!run.demo) return null;
  return <div className="demo-provenance"><b>사전 수집·검증 결과</b><span>준비 {dateTime(run.demo.preparedAt)} · 원래 분석 {time(run.demo.originalDurationMs)}</span><details><summary>자료 사용 방식</summary><p>이번 시연은 저장 원문·검색 기록·검증 결과를 불러옵니다. 검색 대기 시간은 생략하고, 원문 탐색·근거 검토·승인은 현재 화면에서 실제 수행합니다.</p><p>원래 분석 ID: {run.demo.originalRunId}</p></details></div>;
}
