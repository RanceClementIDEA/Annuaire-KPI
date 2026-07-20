"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * Fournit le thème clair/sombre à toute l'application.
 * `attribute="class"` bascule la classe `.dark` sur <html> (tokens CSS),
 * `enableSystem` respecte la préférence du système par défaut.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
