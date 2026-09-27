'use client';

import { useEffect } from 'react';

export function ClientVisitManager() {
  useEffect(() => {
    // Write new timestamp to cookie on mount. Non-HTTP-only, 365 days max-age.
    const now = new Date().toISOString();
    const expires = new Date(Date.now() + 365 * 86_400_000).toUTCString();
    document.cookie = `bumin_last_visit=${now};path=/;max-age=${365 * 86400};expires=${expires};samesite=lax`;
  }, []);

  return null;
}
