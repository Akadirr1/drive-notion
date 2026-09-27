import { relativeTimeAgo } from '@/lib/format';

interface StaleBannerProps {
  ok: boolean;
  lastSuccessAt: string | null;
}

export function StaleBanner({ ok, lastSuccessAt }: StaleBannerProps) {
  if (ok) return null;

  const message = !lastSuccessAt
    ? 'Veriler henüz hiç güncellenmedi.'
    : `Veriler ${relativeTimeAgo(lastSuccessAt)} güncellendi. Senkron çalışmıyor olabilir.`;

  return (
    <div
      role="alert"
      className="w-full bg-caution-tint text-caution border border-caution/30 px-3 py-2 text-[13px] rounded-[6px] mb-4 md:mb-6 leading-tight"
    >
      {message}
    </div>
  );
}
