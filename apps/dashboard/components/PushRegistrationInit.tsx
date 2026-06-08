'use client';

import { useEffect } from 'react';
import { registerPushSubscription } from '../src/lib/push-registration';

export function PushRegistrationInit({ tenantId }: { tenantId: string }) {
  useEffect(() => {
    if (!tenantId) return;
    registerPushSubscription(tenantId).catch(() => {});
  }, [tenantId]);

  return null;
}
