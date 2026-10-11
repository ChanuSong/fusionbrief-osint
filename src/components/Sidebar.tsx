import { ChevronRight, FileSearch, History, Library, Plus } from 'lucide-react';
import type { Dataset } from '../../shared/types.ts';
import { shortTime, type RecentRun } from '../lib.ts';

export type Tab = 'workspace' | 'sources' | 'reviews';

export function BrandMark() {
  return <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
    <rect x=".5" y=".5" width="31" height="31" rx="2" fill="#243f52" stroke="#6d8291" />
    <path d="M9 10 L16 23 L23 10" stroke="#fff" strokeWidth="1.5" fill="none" />
    <rect x="6.5" y="7.5" width="5" height="5" fill="#fff" /><rect x="20.5" y="7.5" width="5" height="5" fill="#fff" />
    <rect x="13.5" y="20.5" width="5" height="5" fill="#fff" />
  </svg>;
}

export function Sidebar({ tab, onTab, dataset, recentRuns, activeRunId, reviewCount, locked, onNew, onOpenRun, historyOpen, onHistory }: {
  tab: Tab; onTab: (tab: Tab) => void; dataset?: Dataset; recentRuns: RecentRun[]; activeRunId?: string; reviewCount: number;
  locked: boolean; onNew: () => void; onOpenRun: (id: string) => void; historyOpen: boolean; onHistory: (open: boolean) => void;
}) {
  const nav = [
    { id: 'workspace' as const, label: '분석', icon: FileSearch },
    { id: 'sources' as const, label: '공개 자료', icon: Library, count: dataset?.sources.length },
    { id: 'reviews' as const, label: '검토 기록', icon: History, count: reviewCount },
  ];
  return <aside className="sidebar">
    <a className="brand" href="/" aria-label="FUSIONBRIEF 홈"><BrandMark /><span>FUSIONBRIEF</span></a>
    <button className="new-analysis" onClick={onNew} disabled={locked}><Plus size={16} />새 분석</button>
    <nav className="main-nav" aria-label="주 메뉴">{nav.map(item => <button key={item.id} className={tab === item.id ? 'active' : ''}
      aria-current={tab === item.id ? 'page' : undefined} onClick={() => onTab(item.id)}>
      <item.icon size={17} />{item.label}{item.count !== undefined && item.count > 0 ? <span className="nav-count">{item.count}</span> : null}</button>)}
    </nav>
    <details className="history-section" open={historyOpen} onToggle={event => onHistory(event.currentTarget.open)}>
      <summary>최근 분석<span>{recentRuns.length}</span><ChevronRight size={14} /></summary>
      <div className="recent-runs">{recentRuns.length ? recentRuns.slice(0, 10).map(r =>
        <button key={r.id} onClick={() => onOpenRun(r.id)} disabled={locked} className={activeRunId === r.id ? 'selected' : ''}>
          <span className="recent-question">{r.question}</span>
          <span className="recent-meta">
            {shortTime(r.createdAt)} · v{r.version}</span>
        </button>) : <p>저장된 보고서 없음</p>}</div>
    </details>

  </aside>;
}
