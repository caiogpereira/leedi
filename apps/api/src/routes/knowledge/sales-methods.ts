import { Hono } from 'hono';
import { db, schema, eq } from '@leedi/db';

export async function listSalesMethods() {
  return db
    .select()
    .from(schema.salesMethods)
    .where(eq(schema.salesMethods.isGlobal, true));
}

export function createSalesMethodsRouter() {
  const router = new Hono();

  // GET /api/sales-methods — global sales methods (no tenant scope needed)
  router.get('/', async (c) => {
    const methods = await listSalesMethods();
    return c.json(methods);
  });

  return router;
}
