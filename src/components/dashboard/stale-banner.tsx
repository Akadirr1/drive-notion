import { formatStaleMessage } from '@/lib/format';
import type { HealthPayload } from '@/server/queries/health';

interface StaleBannerProps {
  ok: boolean;
  sources: HealthPayload['sources'];
}

export function StaleBanner({ ok, sources }: StaleBannerProps) {
  if (ok) return null;

  const message = formatStaleMessage(sources);
  if (!message) return null;

  return (
    <div
      role="alert"
      className="w-full bg-caution-tint text-caution border border-caution/30 px-3 py-2 text-[13px] rounded-[6px] mb-4 md:mb-6 leading-tight"
    >
      {message}
    </div>
  );
}
