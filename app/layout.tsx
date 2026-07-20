import type { Metadata } from "next";
import "./globals.css";
import { PostHogProvider } from "@/lib/posthog/provider";
import { ThemeProvider } from "@/components/theme/theme-provider";

export const metadata: Metadata = {
  title: "AlternPilot — Le copilote du maître d'apprentissage",
  description:
    "Suivi d'alternance pour les TPE/PME : calendrier, missions, bilans et alertes.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <PostHogProvider>{children}</PostHogProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
