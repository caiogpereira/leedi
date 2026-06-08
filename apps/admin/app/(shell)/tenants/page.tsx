import { redirect } from 'next/navigation';

/**
 * The tenant list shipped in Story 2.8 was consolidated into the richer Clientes
 * surface in Story 20.2. This route is kept as a permanent redirect so any old
 * bookmarks/links continue to work.
 */
export default function TenantsPage() {
  redirect('/clientes');
}
