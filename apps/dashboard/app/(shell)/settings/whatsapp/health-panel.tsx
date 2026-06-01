'use client';

import { useState, useTransition } from 'react';
import {
  getStatusBadge,
  getQualityBadge,
  getTierLabel,
  getErrorExplanation,
  formatRelativeTime,
} from './health-display';
import { triggerHealthCheck } from './actions';

interface ConnectionHealth {
  status: string | null;
  displayName: string | null;
  qualityRating: string | null;
  messagingTier: string | null;
  lastHealthCheckAt: string | null;
}

interface HealthPanelProps {
  connection: ConnectionHealth;
  tenantId: string;
}

export function HealthPanel({ connection: initial, tenantId }: HealthPanelProps) {
  const [connection, setConnection] = useState(initial);
  const [isPending, startTransition] = useTransition();

  const statusBadge = getStatusBadge(connection.status);
  const qualityBadge = getQualityBadge(connection.qualityRating);
  const tierLabel = getTierLabel(connection.messagingTier);
  const relativeTime = formatRelativeTime(connection.lastHealthCheckAt);

  function handleRefresh() {
    startTransition(async () => {
      const result = await triggerHealthCheck(tenantId);
      if (result) {
        setConnection(result);
      }
    });
  }

  return (
    <div className="rounded-lg border p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Status da Conexão</h2>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isPending}
          aria-busy={isPending}
          className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          {isPending ? 'Verificando...' : 'Verificar agora'}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {/* Status badge (semantic colors — NOT WhatsApp green per UX-DR1) */}
        <span
          aria-label={statusBadge.ariaLabel}
          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusBadge.className}`}
        >
          {statusBadge.label}
        </span>

        {/* Quality rating badge */}
        {qualityBadge && (
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${qualityBadge.className}`}
          >
            {qualityBadge.label}
          </span>
        )}

        {/* Messaging tier */}
        {tierLabel && (
          <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
            {tierLabel}
          </span>
        )}
      </div>

      {/* Display name */}
      {connection.displayName && (
        <p className="text-sm text-muted-foreground">{connection.displayName}</p>
      )}

      {/* Error explanation (AC#2) */}
      {connection.status === 'erro' && (
        <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-md px-3 py-2">
          {getErrorExplanation()}
        </p>
      )}

      {/* Last check relative time */}
      {relativeTime && (
        <p className="text-xs text-muted-foreground">{relativeTime}</p>
      )}
    </div>
  );
}
