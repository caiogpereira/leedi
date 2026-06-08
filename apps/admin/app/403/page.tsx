"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

/**
 * 403 Forbidden page (Story 2.8). Reached when a non-super_admin tries to access
 * a workspace-admin area (e.g. the tenants list). Copy comes from next-intl (pt-BR).
 */
export default function ForbiddenPage() {
  const t = useTranslations("forbidden");
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900">{t("code")}</h1>
        <p className="mt-2 text-lg text-gray-600">{t("message")}</p>
        <Link href="/" className="mt-4 inline-block text-indigo-600 hover:underline">
          {t("back")}
        </Link>
      </div>
    </div>
  );
}
