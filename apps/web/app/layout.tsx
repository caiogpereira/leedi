import type { Metadata } from "next";
import { Roboto, Roboto_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { ThemeProvider } from "@leedi/ui";
import "@leedi/ui/globals.css";
import messages from "../messages/pt-BR.json";

// Gemini-style UI typeface. Roboto is Google's open sans (closest free match to
// the mockup's Google Sans). Exposed as --font-sans/--font-mono, which the
// Tailwind preflight + fontFamily tokens consume.
const roboto = Roboto({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});
const robotoMono = Roboto_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

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
    <html
      lang="pt-BR"
      className={`${roboto.variable} ${robotoMono.variable}`}
      suppressHydrationWarning
    >
      <body className="font-sans">
        <ThemeProvider>
          <NextIntlClientProvider locale="pt-BR" messages={messages}>
            {children}
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}