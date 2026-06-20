// Public surface of @leedi/knowledge — only import from this file

export { createProduct, createProductSchema, ProductValidationError } from './use-cases/create-product.js';
export type { CreateProductInput, ProductRow } from './use-cases/create-product.js';

export { listProducts } from './use-cases/list-products.js';
export type { ListProductsInput } from './use-cases/list-products.js';

export { updateProduct, updateProductSchema } from './use-cases/update-product.js';
export type { UpdateProductInput } from './use-cases/update-product.js';

export { archiveProduct } from './use-cases/archive-product.js';

export { getProduct } from './use-cases/get-product.js';

export { getProductMaterial } from './use-cases/get-product-material.js';
export type { ProductMaterial } from './use-cases/get-product-material.js';

export { getActiveOffers } from './use-cases/get-active-offers.js';
export type { ActiveOffer } from './use-cases/get-active-offers.js';

export { updateProductArguments, updateProductArgumentsSchema } from './use-cases/update-product-arguments.js';
export type { UpdateProductArgumentsInput } from './use-cases/update-product-arguments.js';

export {
  createKnowledgeEntry,
  createKnowledgeEntrySchema,
  KnowledgeValidationError,
} from './use-cases/create-knowledge-entry.js';
export type { CreateKnowledgeEntryInput, KnowledgeEntryRow } from './use-cases/create-knowledge-entry.js';

export { listKnowledgeBase } from './use-cases/list-knowledge-base.js';
export type { ListKnowledgeBaseInput } from './use-cases/list-knowledge-base.js';

export { updateKnowledgeEntry, updateKnowledgeEntrySchema } from './use-cases/update-knowledge-entry.js';
export type { UpdateKnowledgeEntryInput } from './use-cases/update-knowledge-entry.js';

export { deleteKnowledgeEntry } from './use-cases/delete-knowledge-entry.js';

export { searchKnowledgeBase } from './use-cases/search-knowledge-base.js';
export type { SearchKnowledgeBaseInput, KnowledgeSearchResult } from './use-cases/search-knowledge-base.js';
