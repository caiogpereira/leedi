import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@leedi/auth";
import { env } from "@leedi/config";
import { logoutAction } from "../actions";

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const requestHeaders = await headers();
  const session = await getSession(requestHeaders);

  if (!session) {
    // Login lives on the web app origin (BETTER_AUTH_URL). Defense-in-depth fallback —
    // the Edge middleware already redirects unauthenticated users to login first.
    redirect(new URL("/login", env.BETTER_AUTH_URL).toString());
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b px-6 py-4 flex items-center justify-between">
        <span className="text-xl font-bold text-primary">leedi</span>
        {/* F-29: the old relative <a href="/api/auth/sign-out"> 404'd (the
            Better-Auth handler lives on the web origin and sign-out is a POST).
            Use the server action, which signs out + redirects to the web login. */}
        <form action={logoutAction}>
          <button
            type="submit"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Sair
          </button>
        </form>
      </header>
      <main className="flex-1 flex flex-col items-center justify-start py-10 px-4">
        {children}
      </main>
    </div>
  );
}
