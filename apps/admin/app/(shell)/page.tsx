import { getTranslations } from "next-intl/server";

export default async function AdminHome() {
  const t = await getTranslations("home");
  return (
    <div>
      <h1 className="text-2xl font-bold">{t("heading")}</h1>
    </div>
  );
}
