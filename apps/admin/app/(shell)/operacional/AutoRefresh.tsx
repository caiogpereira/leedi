'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Server-side refresh on an interval (Story 20.3 AC#5): a tenant whose quality
 * drops to red must appear in the churn-risk list within 5 minutes. No real-time
 * stream needed for V1 — this re-runs the server component periodically.
 */
export function AutoRefresh({ intervalMs = 5 * 60 * 1000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);

  return null;
}
