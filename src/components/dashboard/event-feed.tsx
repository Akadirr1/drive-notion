import {
  Check,
  CircleCheck,
  FilePen,
  FilePlus,
  OctagonAlert,
  Play,
} from 'lucide-react';
import { relativeTime } from '@/lib/format';

export interface FeedEvent {
  id: number;
  type: string;
  departmentId: string | null;
  subjectTitle: string;
  detail: string | null;
  url: string | null;
  occurredAt: string;
  isNew: boolean;
}

export interface EventFeedProps {
  events: FeedEvent[];
}

export function EventFeed({ events }: EventFeedProps) {
  return (
    <section>
      <div className="text-[13px] text-ink-muted mb-2 select-none">
        Son 48 saat
      </div>

      {events.length === 0 ? (
        <div className="text-[14px] text-ink-muted py-3">
          Son 48 saatte hareket yok.
        </div>
      ) : (
        <div className="divide-y divide-rule border-t border-b border-rule">
          {events.map((event) => {
            const sentence = buildSentence(event);
            const content = (
              <div className="flex items-center gap-2.5 sm:gap-3 py-2.5 group">
                {/* New dot indicator */}
                <div className="w-2 flex justify-center shrink-0">
                  {event.isNew && (
                    <span
                      className="w-1.5 h-1.5 rounded-full bg-ink inline-block"
                      aria-label="Yeni"
                    />
                  )}
                </div>

                {/* Event icon */}
                <div className="shrink-0 flex items-center justify-center">
                  {renderIcon(event.type)}
                </div>

                {/* Sentence clamped to 2 lines */}
                <div className="flex-1 min-w-0 pr-2">
                  <div
                    className="text-[14px] sm:text-[15px] text-ink line-clamp-2 leading-snug group-hover:text-ink/80 transition-colors"
                    title={sentence}
                  >
                    {sentence}
                  </div>
                </div>

                {/* Department code */}
                {event.departmentId && (
                  <div className="text-[13px] text-ink-muted tabular-nums shrink-0">
                    WP-{event.departmentId}
                  </div>
                )}

                {/* Relative time with ISO title */}
                <div
                  className="text-[13px] text-ink-muted tabular-nums shrink-0 text-right min-w-[48px]"
                  title={event.occurredAt}
                >
                  {relativeTime(event.occurredAt)}
                </div>
              </div>
            );

            if (event.url) {
              return (
                <a
                  key={event.id}
                  href={event.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block focus:outline-none"
                >
                  {content}
                </a>
              );
            }

            return <div key={event.id}>{content}</div>;
          })}
        </div>
      )}
    </section>
  );
}

function renderIcon(type: string) {
  const iconClass = 'w-4 h-4 text-ink-muted';

  switch (type) {
    case 'TASK_COMPLETED':
      return <Check className={iconClass} />;
    case 'TASK_STARTED':
      return <Play className={iconClass} />;
    case 'TASK_BLOCKED':
      return <OctagonAlert className="w-4 h-4 text-warning" />;
    case 'TASK_UNBLOCKED':
      return <CircleCheck className={iconClass} />;
    case 'DOC_CREATED':
      return <FilePlus className={iconClass} />;
    case 'DOC_UPDATED':
      return <FilePen className={iconClass} />;
    default:
      return <Check className={iconClass} />;
  }
}

function buildSentence(event: FeedEvent): string {
  const { type, subjectTitle, detail } = event;

  switch (type) {
    case 'TASK_COMPLETED':
      return `${subjectTitle} tamamlandı`;
    case 'TASK_STARTED':
      return `${subjectTitle} başladı`;
    case 'TASK_BLOCKED':
      return detail ? `${subjectTitle} tıkalı: ${detail}` : `${subjectTitle} tıkandı`;
    case 'TASK_UNBLOCKED':
      return `${subjectTitle} artık tıkalı değil`;
    case 'DOC_CREATED':
      return `Yeni belge: ${subjectTitle}`;
    case 'DOC_UPDATED':
      return `${subjectTitle} güncellendi`;
    default:
      return subjectTitle;
  }
}
