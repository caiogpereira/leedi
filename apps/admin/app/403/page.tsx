import Link from "next/link";

/**
 * 403 Forbidden page (Story 2.8). Reached when a non-super_admin tries to access
 * a workspace-admin area (e.g. the tenants list). Copy is pt-BR per project UI
 * convention.
 */
export default function ForbiddenPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900">403</h1>
        <p className="mt-2 text-lg text-gray-600">
          Você não tem permissão para acessar esta área
        </p>
        <Link href="/" className="mt-4 inline-block text-indigo-600 hover:underline">
          Voltar
        </Link>
      </div>
    </div>
  );
}
