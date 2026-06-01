import { Hono } from 'hono';
import {
  createProduct,
  listProducts,
  getProduct,
  updateProduct,
  archiveProduct,
  updateProductArguments,
  ProductValidationError,
} from '@leedi/knowledge';
import { requireTenantSession } from '../../middleware/tenant-session.js';

const FIELDS = ['argumentos', 'diferenciais', 'provasSociais', 'bonus'] as const;
type MaterialField = (typeof FIELDS)[number];

export function createProductsRouter() {
  const router = new Hono();

  // GET /api/tenants/:tenantId/knowledge/products
  router.get('/', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');
    const archived = c.req.query('archived') === 'true';
    const products = await listProducts({ tenantId, archived });
    return c.json(products);
  });

  // GET /api/tenants/:tenantId/knowledge/products/:id
  router.get('/:id', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');
    const productId = c.req.param('id') ?? '';
    const product = await getProduct(tenantId, productId);
    if (!product) return c.json({ error: 'Produto não encontrado.' }, 404);
    return c.json(product);
  });

  // POST /api/tenants/:tenantId/knowledge/products
  router.post('/', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');
    const body = await c.req.json().catch(() => null);
    try {
      const product = await createProduct({ ...body, tenantId });
      return c.json(product, 201);
    } catch (err) {
      if (err instanceof ProductValidationError) {
        return c.json({ error: err.message }, 400);
      }
      throw err;
    }
  });

  // PATCH /api/tenants/:tenantId/knowledge/products/:id
  router.patch('/:id', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');
    const productId = c.req.param('id') ?? '';
    const body = await c.req.json().catch(() => null);
    try {
      const product = await updateProduct({ ...body, tenantId, productId });
      if (!product) return c.json({ error: 'Produto não encontrado.' }, 404);
      return c.json(product);
    } catch (err) {
      if (err instanceof ProductValidationError) {
        return c.json({ error: err.message }, 400);
      }
      throw err;
    }
  });

  // PATCH /api/tenants/:tenantId/knowledge/products/:id/archive
  router.patch('/:id/archive', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');
    const productId = c.req.param('id') ?? '';
    const ok = await archiveProduct(tenantId, productId);
    if (!ok) return c.json({ error: 'Produto não encontrado.' }, 404);
    return c.json({ ok: true });
  });

  // PATCH /api/tenants/:tenantId/knowledge/products/:id/material
  // Replaces a single jsonb array field wholesale (argumentos/diferenciais/provasSociais/bonus)
  router.patch('/:id/material', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');
    const productId = c.req.param('id') ?? '';
    const body = (await c.req.json().catch(() => null)) as {
      field?: unknown;
      items?: unknown;
    } | null;

    const field = body?.field;
    const items = body?.items;

    if (!FIELDS.includes(field as MaterialField)) {
      return c.json({ error: `Campo inválido. Use: ${FIELDS.join(', ')}.` }, 400);
    }

    if (!Array.isArray(items)) {
      return c.json({ error: 'items deve ser um array.' }, 400);
    }

    try {
      const ok = await updateProductArguments({
        tenantId,
        productId,
        field: field as MaterialField,
        items: items as string[],
      });
      if (!ok) return c.json({ error: 'Produto não encontrado.' }, 404);
      return c.json({ ok: true });
    } catch (err) {
      if (err instanceof ProductValidationError) {
        return c.json({ error: err.message }, 400);
      }
      throw err;
    }
  });

  return router;
}
