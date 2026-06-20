"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { inviteAction, type InviteState } from "./actions";

interface InviteFormProps {
  /** Only an owner may grant the owner role (mirrors the server-side guard). */
  allowOwnerRole: boolean;
}

const INITIAL_STATE: InviteState = {};

/**
 * Invite form (Story 2.6 AC#1/AC#3).
 *
 * Submits to the `inviteAction` Server Action, which resolves the active tenant +
 * inviter role server-side and calls `inviteMember`. The tenantId and inviter role
 * are NEVER taken from the form body. A duplicate-pending invite surfaces AC#3's
 * message returned by the use-case.
 */
export function InviteForm({ allowOwnerRole }: InviteFormProps) {
  const t = useTranslations("team");
  const [state, formAction, pending] = useActionState(inviteAction, INITIAL_STATE);

  return (
    <form action={formAction} className="space-y-4">
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

      {state.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="text-sm text-green-600">
          {t("inviteSent")}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {t("submitButton")}
      </button>
    </form>
  );
}
