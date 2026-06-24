/**
 * Registers (idempotently) the recurring QStash cron schedules that drive the
 * API's scheduled jobs. Run once per environment after deploy — or in the deploy
 * pipeline — so nobody has to click around the Upstash console.
 *
 * Only the THREE recurring crons live here. The other QStash-verified endpoints
 * (dispatch, gateway, agent-flush, campaign-phase-transition, process-asaas-event)
 * are event-driven — published on demand by the app, not on a schedule.
 *
 * Usage (from repo root):
 *   API_PUBLIC_URL=https://api.leedi.app \
 *     pnpm --filter @leedi/api exec tsx ../../scripts/register-qstash-schedules.ts
 *
 * Flags:
 *   --dry-run            Print the planned actions without touching QStash.
 *   --base-url=<url>     Override API_PUBLIC_URL (the public, QStash-reachable API origin).
 *
 * Requires env: QSTASH_TOKEN, and API_PUBLIC_URL (or --base-url). @leedi/config
 * loads the root .env automatically.
 *
 * Idempotent: reconciles by destination URL — creates when missing, recreates
 * when the cron changed, skips when already correct, and prunes duplicates.
 */
import { Client } from '@upstash/qstash';
import { env } from '@leedi/config';

interface DesiredSchedule {
  /** API route path (appended to the base URL). */
  path: string;
  /** Standard 5-field cron expression (UTC). */
  cron: string;
  /** Human label for logs. */
  description: string;
}

// The canonical list of recurring crons. Keep in sync with the route comments in
// apps/api/src/routes/internal.ts.
const SCHEDULES: DesiredSchedule[] = [
  {
    path: '/api/internal/whatsapp/health-check-all',
    cron: '*/15 * * * *',
    description: 'WhatsApp connection health check (every 15 min)',
  },
  {
    path: '/api/internal/billing/daily-check',
    cron: '0 12 * * *',
    description: 'Daily billing lockdown check (09:00 BRT)',
  },
  {
    path: '/api/internal/billing/charge-overage',
    cron: '0 13 * * *',
    description: 'Monthly overage charge (10:00 BRT, targets previous month)',
  },
];

function parseArgs(argv: string[]): { dryRun: boolean; baseUrl: string | undefined } {
  let baseUrl: string | undefined = env.API_PUBLIC_URL;
  let dryRun = false;
  for (const arg of argv) {
    if (arg === '--dry-run') dryRun = true;
    else if (arg.startsWith('--base-url=')) baseUrl = arg.slice('--base-url='.length);
  }
  return { dryRun, baseUrl: baseUrl?.replace(/\/+$/, '') };
}

async function main(): Promise<void> {
  const { dryRun, baseUrl } = parseArgs(process.argv.slice(2));

  if (!baseUrl) {
    throw new Error(
      'Missing public API URL. Set API_PUBLIC_URL or pass --base-url=https://api.leedi.app'
    );
  }
  if (/localhost|127\.0\.0\.1/.test(baseUrl)) {
    // QStash is a hosted service — it cannot reach a localhost origin. Allow only
    // a dry run so nobody accidentally registers unreachable schedules.
    if (!dryRun) {
      throw new Error(
        `Base URL "${baseUrl}" is not reachable by QStash. Use the public production URL, or add --dry-run.`
      );
    }
    console.warn(`⚠️  ${baseUrl} is local — QStash can't reach it. (dry-run)`);
  }

  const client = new Client({ token: env.QSTASH_TOKEN });
  const existing = await client.schedules.list();

  console.log(`${dryRun ? '[dry-run] ' : ''}Reconciling ${SCHEDULES.length} schedules at ${baseUrl}\n`);

  for (const desired of SCHEDULES) {
    const destination = `${baseUrl}${desired.path}`;
    const matches = existing.filter((s) => s.destination === destination);
    const correct = matches.find((s) => s.cron === desired.cron);
    const stale = matches.filter((s) => s.scheduleId !== correct?.scheduleId);

    if (correct && stale.length === 0) {
      console.log(`✓ up-to-date  ${desired.cron}  ${desired.description}`);
      continue;
    }

    // Prune any schedule for this destination with a wrong/duplicate cron.
    for (const s of stale) {
      console.log(`✗ removing stale (cron="${s.cron}", id=${s.scheduleId})  ${desired.description}`);
      if (!dryRun) await client.schedules.delete(s.scheduleId);
    }

    if (correct) {
      console.log(`✓ kept        ${desired.cron}  ${desired.description}`);
      continue;
    }

    console.log(`+ creating    ${desired.cron}  ${desired.description}  → ${destination}`);
    if (!dryRun) {
      await client.schedules.create({ destination, cron: desired.cron });
    }
  }

  console.log(`\n${dryRun ? '[dry-run] no changes made.' : 'Done.'}`);
}

main().catch((err: unknown) => {
  console.error('Failed to register QStash schedules:', err);
  process.exit(1);
});
