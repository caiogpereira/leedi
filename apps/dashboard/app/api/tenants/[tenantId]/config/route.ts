import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSession } from '@leedi/auth';
import { withTenant, withUser, schema, eq } from '@leedi/db';

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ tenantId: string }> }
) {
  const session = await getSession(request.headers);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  const { tenantId } = await context.params;

  // Verify the caller is a member of this tenant
  const membership = await withUser(session.user.id, async (tx) => {
    const rows = await tx
      .select({ id: schema.memberships.id })
      .from(schema.memberships)
      .where(
        eq(schema.memberships.tenantId, tenantId)
      )
      .limit(1);
    return rows[0] ?? null;
  });

  if (!membership) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
  }

  let updates: Record<string, unknown>;
  try {
    updates = await request.json();
  } catch {
    return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 });
  }

  // Merge the incoming keys into the existing config jsonb
  await withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select({ config: schema.tenants.config })
      .from(schema.tenants)
      .where(eq(schema.tenants.id, tenantId))
      .limit(1);

    const existing = (rows[0]?.config as Record<string, unknown>) ?? {};
    const merged = { ...existing, ...updates };

    await tx
      .update(schema.tenants)
      .set({ config: merged })
      .where(eq(schema.tenants.id, tenantId));
  });

  return NextResponse.json({ ok: true });
}
