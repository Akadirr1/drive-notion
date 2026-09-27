import { loadConfig } from '@/server/config';
import { getReaderDb } from '@/server/db/client';
import { getDashboardData } from '@/server/queries/dashboard';
import { getHealth } from '@/server/queries/health';
import { getLastVisit } from '@/lib/last-visit';
import { formatDateTurkish } from '@/lib/format';
import { ClientVisitManager } from '@/components/dashboard/client-visit-manager';
import { StaleBanner } from '@/components/dashboard/stale-banner';
import { DeadlineStrip } from '@/components/dashboard/deadline-strip';
import { NextAction } from '@/components/dashboard/next-action';
import { Counts } from '@/components/dashboard/counts';
import { Annunciator } from '@/components/dashboard/annunciator';
import { EventFeed } from '@/components/dashboard/event-feed';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {

  // 1. Load config safely
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    return (
      <main>
        <p className="text-warning p-4">
          {err instanceof Error ? err.message : 'Config error'}
        </p>
      </main>
    );
  }

  // 2. Read last visit from cookie
  const lastVisit = await getLastVisit();

  // 3. Get database and health status
  const db = getReaderDb();
  const health = getHealth(db);

  // 4. Get dashboard data using loaded config
  const data = getDashboardData(db, config);

  // 5. If no data (DB doesn't exist), show empty state
  if (!data) {
    return (
      <main>
        <p className="text-ink-muted p-4">
          Henüz veri yok. Worker&apos;ın en az bir senkron tamamlamasını bekleyin.
        </p>
      </main>
    );
  }

  // 6. Mark events as new/old based on lastVisit
  const eventsWithNew = data.recentEvents.map((e) => ({
    ...e,
    isNew: lastVisit ? e.ingestedAt > lastVisit : false,
  }));

  // 7. Enrich departments and next action with config details
  const deptMap = new Map(config.departments.map((d) => [d.id, d]));
  const todayStr = new Date().toLocaleDateString('en-CA', {
    timeZone: config.project.timezone,
  });

  const nextActionProps = data.nextAction
    ? {
        title: data.nextAction.title,
        departmentId: data.nextAction.departmentId,
        departmentName: data.nextAction.departmentId
          ? deptMap.get(data.nextAction.departmentId)?.name ?? null
          : null,
        dueDate: data.nextAction.dueDate
          ? data.nextAction.dueDate.slice(0, 10) === todayStr
            ? 'bugün'
            : formatDateTurkish(data.nextAction.dueDate)
          : null,
        url: data.nextAction.url,
      }
    : null;

  const annunciatorDepts = data.departments.map((d) => ({
    ...d,
    name: deptMap.get(d.departmentId)?.name ?? d.departmentId,
    driveFolderId: deptMap.get(d.departmentId)?.drive_folder_id ?? '',
  }));

  return (
    <main>
      <ClientVisitManager />
      <StaleBanner
        ok={health.ok}
        lastSuccessAt={health.sources.notion.lastSuccessAt}
      />
      <DeadlineStrip
        projectName={data.projectName}
        daysLeft={data.progress.daysLeft}
        deadline={data.deadline}
        deliverable={data.deliverable}
        progressText={data.progress.progressText}
        progressPercent={data.progress.percent}
        syncStatus={{
          lastSuccessAt: health.sources.notion.lastSuccessAt,
          ok: health.ok,
        }}
      />
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 md:gap-6 border-b border-rule pb-4 md:pb-6 mb-4 md:mb-6">
        <NextAction action={nextActionProps} />
        <Counts
          blocked={data.counts.blockedCount}
          completedThisWeek={data.counts.completedThisWeekCount}
          activeNotBlocked={data.counts.activeNotBlockedCount}
        />
      </div>
      <Annunciator
        departments={annunciatorDepts}
        quietSummary={data.quietSummary}
      />
      <EventFeed events={eventsWithNew} />
    </main>
  );
}
