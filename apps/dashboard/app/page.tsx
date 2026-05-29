import { useTranslations } from "next-intl";
import { logoutAction } from "./actions";

export default function Home() {
  const t = useTranslations("home");
  const tNav = useTranslations("nav");
  return (
    <main>
      <h1>{t("heading")}</h1>
      {/* AC#2: submitting this form destroys the session server-side, then redirects to /login. */}
      <form action={logoutAction}>
        <button type="submit">{tNav("logout")}</button>
      </form>
    </main>
  );
}
