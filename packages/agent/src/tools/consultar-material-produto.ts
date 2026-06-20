// Tool: consultar_material_produto — on-demand deep product dossier.
//
// Returns the long-form launch material (CPL/VSL scripts, gatilhos, oferta
// context) for a specific product. Kept out of the always-on prompt to control
// token cost; the agent calls it only when it needs deep selling context.
//
// schema-vs-ctx boundary: Claude supplies { productId }. tenantId comes from ctx.

import { getProductMaterial } from '@leedi/knowledge';
import type { ToolContext } from './types.js';

export interface ConsultarMaterialProdutoInput {
  productId: string;
}

export type ConsultarMaterialProdutoResult =
  | { encontrado: true; nome: string; material: string | null }
  | { encontrado: false };

export async function consultarMaterialProduto(
  input: ConsultarMaterialProdutoInput,
  ctx: Pick<ToolContext, 'tenantId'>
): Promise<ConsultarMaterialProdutoResult> {
  const row = await getProductMaterial(ctx.tenantId, input.productId);
  if (!row) return { encontrado: false };
  return { encontrado: true, nome: row.nome, material: row.materialLancamento };
}
