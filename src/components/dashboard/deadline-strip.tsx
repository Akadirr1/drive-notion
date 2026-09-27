import { formatDeadline, relativeTimeAgo } from '@/lib/format';

export interface DeadlineStripProps {
  projectName: string;
  daysLeft: number;
  deadline: string;
  deliverable: string;
  progressText: string;
  progressPercent: number;
  syncStatus: {
    lastSuccessAt: string | null;
    ok: boolean;
  };
}

export function SyncStatus({
  lastSuccessAt,
}: {
  lastSuccessAt: string | null;
  ok: boolean;
}) {
  if (!lastSuccessAt) {
    return null;
  }

  return (
    <span className="text-[13px] text-ink-muted select-none" title={lastSuccessAt}>
      Son senkron {relativeTimeAgo(lastSuccessAt)}
    </span>
  );
}

export function DeadlineStrip({
  projectName,
  daysLeft,
  deadline,
  deliverable,
  progressText,
  progressPercent,
  syncStatus,
}: DeadlineStripProps) {
  const daysLeftText =
    daysLeft > 0
      ? `${daysLeft} gün kaldı`
      : daysLeft === 0
      ? 'Bugün son gün'
      : `${Math.abs(daysLeft)} gün geçti`;

  const deadlineFormatted = formatDeadline(deadline, deliverable);
  const clampedPercent = Math.min(100, Math.max(0, progressPercent));

  return (
    <section className="border-b border-rule pb-4 md:pb-6 mb-4 md:mb-6">
      {/* Top line: Project name and sync status */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <h1 className="text-[15px] font-semibold tracking-tight text-ink">
          {projectName}
        </h1>
        <SyncStatus lastSuccessAt={syncStatus.lastSuccessAt} ok={syncStatus.ok} />
      </div>

      {/* Main stat line: Days left and deadline/deliverable info */}
      <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 sm:gap-4 mb-3">
        <div className="text-[40px] font-semibold leading-tight tracking-tight text-ink tabular-nums">
          {daysLeftText}
        </div>
        <div className="text-[13px] text-ink-muted sm:text-right">
          {deadlineFormatted}
        </div>
      </div>

      {/* Progress bar */}
      <div className="progress-track w-full mb-2" role="progressbar" aria-valuenow={clampedPercent} aria-valuemin={0} aria-valuemax={100}>
        <div
          className="progress-fill"
          style={{ width: `${clampedPercent}%` }}
        />
      </div>

      {/* Progress text */}
      <div className="text-[13px] text-ink-muted">
        {progressText}
      </div>
    </section>
  );
}
