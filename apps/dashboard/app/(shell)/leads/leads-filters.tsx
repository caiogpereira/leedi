"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

const SELECT_CLASS =
  "rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

/**
 * Temperatura + status filter controls. Reflected in the URL query params so the
 * server component can read them from searchParams. Changing a filter resets the
 * page back to 1.
 */
export function LeadsFilters({
  temperatura,
  status,
}: {
  temperatura: string;
  status: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      // Any filter change returns to the first page.
      params.delete("page");
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="temperatura" className="text-sm font-medium">
          Temperatura
        </label>
        <select
          id="temperatura"
          name="temperatura"
          value={temperatura}
          onChange={(e) => setParam("temperatura", e.target.value)}
          className={SELECT_CLASS}
        >
          <option value="">Todas</option>
          <option value="frio">Frio</option>
          <option value="morno">Morno</option>
          <option value="quente">Quente</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="status" className="text-sm font-medium">
          Status
        </label>
        <select
          id="status"
          name="status"
          value={status}
          onChange={(e) => setParam("status", e.target.value)}
          className={SELECT_CLASS}
        >
          <option value="">Todos</option>
          <option value="ativo">Ativo</option>
          <option value="optout">Opt-out</option>
          <option value="bloqueado">Bloqueado</option>
        </select>
      </div>
    </div>
  );
}
