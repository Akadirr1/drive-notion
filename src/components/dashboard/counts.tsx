export interface CountsProps {
  blocked: number;
  completedThisWeek: number;
  activeNotBlocked: number;
}

export function Counts({
  blocked,
  completedThisWeek,
  activeNotBlocked,
}: CountsProps) {
  const blockedColor = blocked > 0 ? 'text-warning' : 'text-ink';

  return (
    <div className="grid grid-cols-3 gap-3 sm:gap-6 min-w-0 md:min-w-[260px] text-center md:text-right border-t md:border-t-0 md:border-l border-rule pt-3 md:pt-0 md:pl-6">
      <div>
        <div className={`text-[18px] font-semibold tabular-nums ${blockedColor}`}>
          {blocked}
        </div>
        <div className="text-[13px] text-ink-muted">
          Tıkalı
        </div>
      </div>

      <div>
        <div className="text-[18px] font-semibold tabular-nums text-ink">
          {completedThisWeek}
        </div>
        <div className="text-[13px] text-ink-muted">
          Bu hafta biten
        </div>
      </div>

      <div>
        <div className="text-[18px] font-semibold tabular-nums text-ink">
          {activeNotBlocked}
        </div>
        <div className="text-[13px] text-ink-muted">
          Devam
        </div>
      </div>
    </div>
  );
}
