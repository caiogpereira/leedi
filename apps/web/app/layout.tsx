import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { ThemeProvider } from "@leedi/ui";
import "@leedi/ui/globals.css";
import messages from "../messages/pt-BR.json";

export const metadata: Metadata = {
  title: "Leedi",
  description: "Plataforma de vendas inteligente via WhatsApp",
};

// Shell layout — locale hardcoded until i18n middleware is configured (Epic 3+)
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <NextIntlClientProvider locale="pt-BR" messages={messages}>
            {children}
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}