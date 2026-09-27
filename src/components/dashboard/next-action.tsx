export interface NextActionProps {
  action: {
    title: string;
    departmentId: string | null;
    departmentName: string | null;
    dueDate: string | null;
    url: string;
  } | null;
}

export function NextAction({ action }: NextActionProps) {
  return (
    <div className="flex-1 min-w-0">
      <div className="text-[13px] text-ink-muted mb-1 select-none">
        Şimdi ne yapmalıyım?
      </div>

      {!action ? (
        <p className="text-[14px] text-ink-muted leading-relaxed">
          Sırada iş yok. Notion&apos;da bir görevi devam ediyor durumuna al.
        </p>
      ) : (
        <div>
          <a
            href={action.url}
            target="_blank"
            rel="noopener noreferrer"
            title={action.title}
            className="group block"
          >
            <h2 className="text-[18px] font-semibold text-ink line-clamp-2 group-hover:underline leading-snug">
              {action.title}
            </h2>
          </a>
          <div className="text-[13px] text-ink-muted mt-1">
            {buildMetaText(action.departmentId, action.departmentName, action.dueDate)}
          </div>
        </div>
      )}
    </div>
  );
}

function buildMetaText(
  departmentId: string | null,
  departmentName: string | null,
  dueDate: string | null,
): string {
  const parts: string[] = [];

  if (departmentId) {
    const deptPrefix = `WP-${departmentId}`;
    if (departmentName) {
      parts.push(`${deptPrefix} ${departmentName}`);
    } else {
      parts.push(deptPrefix);
    }
  } else if (departmentName) {
    parts.push(departmentName);
  }

  if (dueDate) {
    parts.push(dueDate);
  }

  return parts.join(', ');
}
