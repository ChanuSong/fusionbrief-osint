import { useRef } from 'react';
import { ArrowRight, ChevronDown, LoaderCircle, SlidersHorizontal } from 'lucide-react';
import type { CollectionMode, SourceLanguage } from '../../shared/types.ts';

const LANGUAGES = [['ko', '한국어'], ['zh', '중국어'], ['ja', '일본어'], ['ru', '러시아어'], ['en', '영어']] as const;
export function QueryComposer({ question, onQuestion, mode, onMode, startDate, onStartDate, endDate, onEndDate,
  languages, onLanguages, urls, onURLs, capabilities, busy, locked, onSubmit, onCancel }: {
  question: string; onQuestion: (value: string) => void; mode: CollectionMode; onMode: (value: CollectionMode) => void;
  startDate: string; onStartDate: (value: string) => void; endDate: string; onEndDate: (value: string) => void;
  languages: SourceLanguage[]; onLanguages: (value: SourceLanguage[]) => void; urls: string; onURLs: (value: string) => void;
  capabilities: { available: boolean; message: string }; busy: boolean; locked: boolean;
  onSubmit: (event: React.FormEvent) => void; onCancel?: () => void;
}) {
  const questionRef = useRef<HTMLTextAreaElement>(null);
  return <form className="query-panel" onSubmit={onSubmit} onKeyDown={event => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && !locked && question.trim()) {
      event.preventDefault(); event.currentTarget.requestSubmit();
    }
  }}>
    <label className="visually-hidden" htmlFor="question">분석 질문</label>
    <textarea ref={questionRef} id="question" value={question} onChange={event => onQuestion(event.target.value)}
      required maxLength={1500} rows={3} disabled={locked} placeholder="사건, 지역, 궁금한 점을 적어주세요." />
    {!capabilities.available && mode === 'live' ? <p className="query-unavailable">분석 서비스에 연결할 수 없습니다. 서버 연결 상태를 확인해 주세요.</p> : null}
    <details className="query-options"><summary><SlidersHorizontal size={15} /><strong>조사 설정</strong>{urls.trim() ? <span>원문 {urls.trim().split('\n').filter(Boolean).length}개</span> : null}<ChevronDown size={14} /></summary>
    <div className="query-options-body">
    <div className="collection-settings">
      <fieldset className="mode-switch" disabled={locked}><legend className="visually-hidden">자료 모드</legend>
        {([['live', '공개자료 수집'], ['snapshot', '시연 자료'], ['refresh', '시연 원문 재확인']] as const).map(([value, label]) =>
          <label key={value} className={mode === value ? 'active' : ''}><input type="radio" name="mode" value={value} checked={mode === value}
            onChange={() => onMode(value)} />{label}</label>)}
      </fieldset>
    </div>
      <fieldset className="date-range" disabled={locked}><legend className="visually-hidden">발행 기간</legend>
        <span>{mode === 'live' ? '사건 기간' : '발행 기간'}</span><input aria-label={mode === 'live' ? '사건 시작일' : '발행 시작일'} type="date" value={startDate} onChange={event => onStartDate(event.target.value)} />
        <span>–</span><input aria-label={mode === 'live' ? '사건 종료일' : '발행 종료일'} type="date" value={endDate} onChange={event => onEndDate(event.target.value)} />
      </fieldset>
    {mode === 'live' ? <>
      <fieldset className="language-settings" disabled={locked}><legend>수집 언어</legend>{LANGUAGES.map(([code, label]) =>
        <label key={code}><input type="checkbox" checked={languages.includes(code)} onChange={event => onLanguages(event.target.checked
          ? [...languages, code] : languages.filter(l => l !== code))} />{label}</label>)}</fieldset>
      <details className="source-url-settings" open={!!urls.trim()}><summary>공개 원문 URL 추가</summary>
        <label htmlFor="source-urls">한 줄에 하나 · 최대 5개</label><textarea id="source-urls" value={urls} disabled={locked}
          onChange={event => onURLs(event.target.value)} rows={2} placeholder="https://…" /></details>
    </> : <p className="query-mode-note">프리덤 에지 2024 자료로 검토 기능을 시연합니다. 자유 질의 분석은 공개자료 수집을 선택하세요.</p>}
    </div></details>
    <div className="query-bottom"><div className="query-actions">{onCancel ? <button className="ghost-button" type="button" onClick={onCancel} disabled={locked}>취소</button> : null}
        <button className="primary-button analyze-button" disabled={locked || !question.trim() || (mode === 'live' && (!capabilities.available || !languages.length))}>
          {busy ? <LoaderCircle className="spinning" size={16} /> : null}{busy ? '분석 중…' : '분석 실행'}{busy ? null : <ArrowRight size={16} />}</button>
      </div></div>
  </form>;
}
