'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

/**
 * "Entrar em contato" CTA for an upsell-opportunity tenant (Story 20.3 AC#3).
 *
 * V1 scope: copies the owner's email to the clipboard (full CRM integration is
 * out of scope). Disabled when the tenant has no resolvable owner email.
 */
export function ContactButton({ ownerEmail }: { ownerEmail: string | null }) {
  const t = useTranslations('operacional');
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!ownerEmail) return;
    try {
      await navigator.clipboard.writeText(ownerEmail);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be unavailable (insecure context); fail silently.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={!ownerEmail}
      title={ownerEmail ?? undefined}
      className="rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50"
    >
      {copied ? t('upsell.copied') : t('upsell.cta')}
    </button>
  );
}
