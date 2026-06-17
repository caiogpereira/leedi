import { getCurrentTenantContext } from '../../../../lib/tenant-context';
import { PlaygroundClient } from './playground-client';

export default async function PlaygroundPage() {
  const ctx = await getCurrentTenantContext();

  if (!ctx) {
    return <div className="p-8 text-muted-foreground">Nenhum workspace encontrado.</div>;
  }

  const currentTenant = ctx.tenant;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Playground</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Teste seu agente em modo sandbox — nenhuma mensagem real é enviada.
        </p>
      </div>
      <PlaygroundClient tenantId={currentTenant.tenantId} />
    </div>
  );
}
