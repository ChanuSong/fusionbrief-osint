import { CircleAlert, CircleCheck, CircleDashed, TriangleAlert } from 'lucide-react';
import type { VerificationStatus } from '../../shared/types.ts';
import { STATUS_LABELS } from '../../shared/types.ts';

const ICONS = { corroborated: CircleCheck, 'single-origin': CircleAlert, conflicting: TriangleAlert, insufficient: CircleDashed, 'independence-pending': CircleDashed };

export function StatusBadge({ status, large }: { status: VerificationStatus; large?: boolean }) {
  const Icon = ICONS[status];
  return <span className={`status-badge status-${status}${large ? ' large' : ''}`}><Icon size={large ? 15 : 13} aria-hidden="true" />{STATUS_LABELS[status]}</span>;
}

export const STATUS_HINTS: Record<VerificationStatus, string> = {
  corroborated: '독립성이 확인된 2개 이상 원출처가 일치',
  'single-origin': '확인된 원출처 1곳에 의존',
  conflicting: '근거가 서로 일치하지 않음',
  insufficient: '질문을 뒷받침하는 원문 없음',
  'independence-pending': '원문은 확보했으며 출처 간 독립성 검토가 필요함',
};
