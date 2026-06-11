import { withTenant, sql } from '@leedi/db';

export interface ObjectionInstance {
  leadName: string | null;
  date: string;
  windowId: string | null;
}

export interface ObjectionItem {
  label: string;
  count: number;
  recentInstances: ObjectionInstance[];
}

export interface TopObjectionsResult {
  items: ObjectionItem[];
  total: number;
}

export async function getTopObjections(
  tenantId: string,
  from: Date,
  to: Date,
  limit = 10
): Promise<TopObjectionsResult> {
  return withTenant(tenantId, async (tx) => {
    // For each objection event: get label (categoria || texto_objecao), lead name,
    // event timestamp, and the nearest conversation window for that lead.
    // Group by label to get counts; aggregate 5 most recent instances per group.
    const rows = await tx.execute(sql`
      WITH ranked_objections AS (
        SELECT
          coalesce(
            nullif(lje.detalhes->>'categoria', ''),
            lje.detalhes->>'texto_objecao',
            'Sem categoria'
          ) AS label,
          l.nome AS lead_name,
          lje.created_at AS event_date,
          (
            SELECT cw.id
            FROM conversation_windows cw
            WHERE cw.lead_id = lje.lead_id
              AND cw.created_at <= lje.created_at + interval '2 hours'
              AND cw.created_at >= lje.created_at - interval '24 hours'
            ORDER BY ABS(EXTRACT(EPOCH FROM (cw.created_at - lje.created_at)))
            LIMIT 1
          ) AS window_id
        FROM lead_journey_events lje
        LEFT JOIN leads l ON l.id = lje.lead_id
        WHERE lje.tipo = 'objecao'
          AND lje.created_at >= ${from}
          AND lje.created_at <= ${to}
      ),
      grouped AS (
        SELECT
          label,
          cast(count(*) as int) AS count,
          json_agg(
            json_build_object(
              'leadName', lead_name,
              'date', to_char(event_date AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
              'windowId', window_id::text
            )
            ORDER BY event_date DESC
          ) AS instances
        FROM ranked_objections
        GROUP BY label
        ORDER BY count DESC
        LIMIT ${limit}
      )
      SELECT
        label,
        count,
        (
          SELECT json_agg(inst)
          FROM (
            SELECT inst
            FROM json_array_elements(instances) AS inst
            LIMIT 5
          ) sub
        ) AS recent_instances
      FROM grouped
    `) as Array<{
      label: string;
      count: unknown;
      recent_instances: ObjectionInstance[] | null;
    }>;

    const items: ObjectionItem[] = rows.map((row) => ({
      label: row.label,
      count: Number(row.count),
      recentInstances: row.recent_instances ?? [],
    }));

    return { items, total: items.length };
  });
}
