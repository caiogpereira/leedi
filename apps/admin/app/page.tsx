import { useTranslations } from "next-intl";

export default function Home() {
  const t = useTranslations("home");
  return (
    <main>
      <h1>{t("heading")}</h1>
    </main>
  );
}
