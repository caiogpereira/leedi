"use client";

import { useTranslations } from "next-intl";

interface InviteFormProps {
  /** Only an owner may grant the owner role (mirrors the server-side guard). */
  allowOwnerRole: boolean;
}

/**
 * Invite form — SCAFFOLD (Story 2.6).
 *
 * The submit is intentionally disabled: the inviting flow needs the active
 * tenantId and the caller's role resolved server-side, which is DEFERRED to
 * Story 2.7 (see the page's note). The fields, role options and the owner-role
 * gate are in place so the real server action — calling `inviteMember` from
 * `@leedi/tenancy` — can be wired in without reworking the UI.
 */
export function InviteForm({ allowOwnerRole }: InviteFormProps) {
  const t = useTranslations("team");

  return (
    // TODO(Story 2.7): set `action` to a server action that resolves the active
    // tenantId + inviter role, then calls inviteMember({ email, role, tenantId, ... }).
    <form className="space-y-4">
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium">
          {t("emailLabel")}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <div>
        <label htmlFor="role" className="mb-1 block text-sm font-medium">
          {t("roleLabel")}
        </label>
        <select
          id="role"
          name="role"
          defaultValue="operator"
          className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="admin">{t("roles.admin")}</option>
          <option value="operator">{t("roles.operator")}</option>
          <option value="viewer">{t("roles.viewer")}</option>
          {allowOwnerRole && <option value="owner">{t("roles.owner")}</option>}
        </select>
      </div>
      <button
        type="submit"
        disabled
        className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {t("submitButton")}
      </button>
    </form>
  );
}
