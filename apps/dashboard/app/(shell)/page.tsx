import { getTranslations } from "next-intl/server";
import { logoutAction } from "../actions";

export default async function Home() {
  const t = await getTranslations("home");
  const tNav = await getTranslations("nav");
  return (
    <div>
      <h1 className="text-2xl font-bold">{t("heading")}</h1>
      <form action={logoutAction} className="mt-4">
        <button
          type="submit"
          className="rounded-md border px-4 py-2 text-sm hover:bg-accent"
        >
          {tNav("logout")}
        </button>
      </form>
    </div>
  );
}
