import type {
  DepartmentStatusResult,
  QuietSummary,
} from '@/server/domain/department-status';

export interface AnnunciatorDepartment extends DepartmentStatusResult {
  name: string;
  driveFolderId: string;
}

export interface AnnunciatorProps {
  departments: AnnunciatorDepartment[];
  quietSummary: QuietSummary;
}

export function Annunciator({ departments, quietSummary }: AnnunciatorProps) {
  const loudDepartments = departments.filter(
    (d) => d.status === 'blocked' || d.status === 'stale' || d.status === 'active',
  );

  return (
    <section className="border-b border-rule pb-4 md:pb-6 mb-4 md:mb-6">
      <div className="text-[13px] text-ink-muted mb-2 select-none">
        Kim ne durumda?
      </div>

      {loudDepartments.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2 sm:gap-2.5 mb-3">
          {loudDepartments.map((dept) => {
            const driveUrl = `https://drive.google.com/drive/folders/${dept.driveFolderId}`;
            return (
              <a
                key={dept.departmentId}
                href={driveUrl}
                target="_blank"
                rel="noopener noreferrer"
                title={`${dept.name} Google Drive klasörü`}
                className={`block rounded-[10px] p-2.5 sm:p-3 border text-left transition-opacity hover:opacity-85 ${getTileStyle(
                  dept.status,
                )}`}
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="text-[13px] text-ink-muted font-medium tabular-nums">
                    WP-{dept.departmentId}
                  </span>
                  {dept.status === 'active' && (
                    <span
                      className="w-1.5 h-1.5 rounded-full bg-go inline-block shrink-0"
                      aria-label="Yolunda"
                    />
                  )}
                </div>

                <div className="text-[14px] sm:text-[15px] font-medium leading-tight text-ink mb-1.5">
                  {dept.name}
                </div>

                <div className="text-[13px] leading-none">
                  {getStatusWord(dept)}
                </div>
              </a>
            );
          })}
        </div>
      )}

      {quietSummary.text && (
        <div className="text-[13px] text-ink-muted">
          {quietSummary.text}
        </div>
      )}
    </section>
  );
}

function getTileStyle(status: string): string {
  switch (status) {
    case 'blocked':
      return 'bg-warning-tint border-warning/40 text-warning';
    case 'stale':
      return 'bg-caution-tint border-caution/40 text-caution';
    case 'active':
    default:
      return 'bg-panel border-rule text-ink';
  }
}

function getStatusWord(dept: AnnunciatorDepartment) {
  switch (dept.status) {
    case 'blocked':
      return <span className="text-warning font-medium">Tıkalı</span>;
    case 'stale':
      return (
        <span className="text-caution font-medium">
          {dept.staleDaysCount ? `${dept.staleDaysCount} gün sessiz` : 'Sessiz'}
        </span>
      );
    case 'active':
      return <span className="text-ink-muted">Yolunda</span>;
    default:
      return null;
  }
}
