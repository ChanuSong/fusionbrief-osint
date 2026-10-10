import { useEffect, useRef, type ReactNode } from 'react';
import type { AnalysisRun, CriterionBasis, Evidence } from '../../shared/types.ts';
import { reportContent } from '../../shared/report-content.ts';
import { dateTime, dotDate } from '../lib.ts';

export function documentNumber(run: AnalysisRun) {
  return `TRACE-${run.createdAt.slice(0, 10).replaceAll('-', '')}-${run.id.slice(0, 8).toUpperCase()}`;
}

/** The reading and print surface. Investigation controls live outside this document. */
export function ReportDocument({ run, onEvidence, onBasis, children }: {
  run: AnalysisRun;
  onEvidence: (evidence: Evidence) => void;
  onBasis: (basis: CriterionBasis) => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.title;
    document.title = `${run.question} | TRACE`;
    return () => { document.title = previous; };
  }, [run.question]);
  useEffect(() => {
    let disclosures: HTMLDetailsElement[] = [];
    const beforePrint = () => {
      disclosures = Array.from(ref.current?.querySelectorAll<HTMLDetailsElement>('details.print-disclosure:not([open])') ?? []);
      disclosures.forEach(node => { node.open = true; });
    };
    const afterPrint = () => {
      disclosures.forEach(node => { node.open = false; });
      disclosures = [];
    };
    window.addEventListener('beforeprint', beforePrint);
    window.addEventListener('afterprint', afterPrint);
    return () => {
      window.removeEventListener('beforeprint', beforePrint);
      window.removeEventListener('afterprint', afterPrint);
      afterPrint();
    };
  }, []);

  const content = reportContent(run);
  const bases = [...new Map(content.criteria.flatMap(c => c.basis.filter(b => b.verified)).map(b => [b.id, b])).values()];
  const basisSources = run.sources.flatMap(source => {
    const references = bases.filter(b => b.sourceId === source.id);
    return references.length ? [{ source, references }] : [];
  });
  const evidence = run.evidence.filter(e => run.claims.some(c => c.evidenceIds.includes(e.id)));
  const sourceNotes = [...new Set(evidence.map(e => e.sourceId))].flatMap(sourceId => {
    const source = run.sources.find(s => s.id === sourceId);
    return source ? [{ source, quotes: evidence.filter(e => e.sourceId === sourceId) }] : [];
  });
  const status = run.approval?.decision === 'approved' ? '분석가 승인'
    : run.approval?.decision === 'changes-requested' ? '수정 요청' : '검토 전 초안';
  const period = `${run.dateRange.start ? dotDate(run.dateRange.start) : '시작 제한 없음'} — ${run.dateRange.end ? dotDate(run.dateRange.end) : '종료 제한 없음'}`;

  return <article className="report-document" aria-labelledby="document-title" ref={ref}>
    <header className="document-frontmatter">
      <div className="document-running-head"><span>TRACE</span><span>공개정보 기반 분석</span></div>
      <div className="document-title-block">
        <p className="document-type">정보분석 보고서</p>
        <h1 id="document-title">{run.question}</h1>
      </div>
      <dl className="document-metadata">
        <div><dt>문서번호</dt><dd className="document-number">{documentNumber(run)} · v{run.version}</dd></div>
        <div><dt>작성일</dt><dd>{dotDate(run.createdAt.slice(0, 10))}</dd></div>
        <div><dt>자료 기준</dt><dd>{dotDate(run.collectedAt.slice(0, 10))}</dd></div>
        <div><dt>검토 상태</dt><dd>{status}{run.analysis?.verification !== 'verified' ? ' · 근거 재검증 필요' : ''}</dd></div>
      </dl>
      <p className="document-scope"><strong>분석 기간</strong><span>{period}</span></p>
      {run.demo ? <p className="document-provenance">사전 수집·검증 자료를 사용한 분석 · 원문 확인과 분석가 검토는 현재 보고서에 기록</p> : null}
    </header>

    {children}

    {evidence.length || bases.length ? <section id="report-sources" className="document-references" aria-labelledby="references-title" tabIndex={-1}>
      <div className="document-appendix-heading"><span>부록 A</span><h2 id="references-title">주석·출처</h2></div>
      <p className="document-reference-note">본문의 인용 번호를 선택하면 보존한 원문과 해당 구절을 확인할 수 있습니다. 같은 발표의 재인용은 독립된 확인으로 세지 않습니다.</p>
      {sourceNotes.length ? <ol className="document-source-list">{sourceNotes.map(({ source, quotes }) => <li key={source.id}>
          <div className="document-note-numbers">{quotes.map(e => {
            const index = run.evidence.indexOf(e) + 1;
            return <button key={e.id} className="document-note-number" onClick={() => onEvidence(e)} aria-label={`주석 ${index} 원문 보기`}>[{index}]</button>;
          })}</div>
          <div><p><strong>{source.publisher}</strong><span>{source.publishedAt ? dotDate(source.publishedAt.slice(0, 10)) : '발행일 미확인'}</span></p>
            <a href={source.url} target="_blank" rel="noreferrer">{source.title}</a>
            <span className="document-print-url">{source.url}</span>
          </div>
        </li>)}</ol> : null}
      {basisSources.length ? <div className="document-basis-notes"><h3>판단 지표의 기준 자료</h3><ol>{basisSources.map(({ source, references }, i) => <li key={source.id}>
        <p className="document-basis-source"><strong>기준 {i + 1} · {source.publisher}</strong><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></p>
        <span className="document-print-url">{source.url}</span>
        <ol className="document-basis-locators">{references.map((b,j) => <li key={b.id}><button onClick={() => onBasis(b)} aria-label={`기준 주석 ${i + 1}-${j + 1} ${b.locator || source.title} 원문 보기`}>
          ({j + 1}) {b.locator || '인용 구절 확인'}
        </button></li>)}</ol>
      </li>)}</ol></div> : null}
    </section> : null}

    <footer className="document-footer">
      {run.approval ? <p className="document-signoff"><strong>{status}</strong> · {run.approval.reviewer} · {dateTime(run.approval.createdAt)} · v{run.approval.version}</p> : null}
      <p className="intel-report-meta">미 육군 <a href="https://rdl.train.army.mil/catalog-ws/view/100.ATSC/F4DDBAD5-3131-4C2A-9E00-CCACC087E984-1408655126204/ATP2_33x4wc1.pdf" target="_blank" rel="noreferrer">ATP 2-33.4</a> 및 <a href="https://www.dni.gov/files/documents/ICD/ICD-203.pdf" target="_blank" rel="noreferrer">ICD 203</a>의 공개 분석 원칙을 참고한 TRACE 양식입니다.</p>
      <div className="document-endmark"><span>{documentNumber(run)} · v{run.version}</span><span>문서 끝</span></div>
    </footer>
  </article>;
}
