"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import posthog from "posthog-js";
import { PostHogProvider as PHProvider, usePostHog } from "posthog-js/react";

// Clé publique du projet PostHog. Absente → analytics totalement inerte.
const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
// Région d'ingestion (défaut : UE, adapté au RGPD). Doit correspondre à la
// région de votre projet PostHog (« EU » → eu.i.posthog.com, « US » → us…).
const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com";

/**
 * Fournit l'analytics produit PostHog à toute l'application.
 * Sans `NEXT_PUBLIC_POSTHOG_KEY`, ne fait strictement rien (rend les enfants
 * tels quels) : aucun script chargé, aucune donnée envoyée.
 */
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!POSTHOG_KEY || posthog.__loaded) return;
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      // Pageviews gérées manuellement (App Router : pas de rechargement complet).
      capture_pageview: false,
      // Ne crée un profil que pour les utilisateurs identifiés (économie de quota).
      person_profiles: "identified_only",
      // Pas d'enregistrement de session par défaut (confidentialité + quota).
      disable_session_recording: true,
    });
  }, []);

  if (!POSTHOG_KEY) return <>{children}</>;

  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        <PageviewTracker />
      </Suspense>
      {children}
    </PHProvider>
  );
}

/** Émet un événement `$pageview` à chaque changement de route (App Router). */
function PageviewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ph = usePostHog();

  useEffect(() => {
    if (!pathname) return;
    let url = window.location.origin + pathname;
    const qs = searchParams?.toString();
    if (qs) url += `?${qs}`;
    ph?.capture("$pageview", { $current_url: url });
  }, [pathname, searchParams, ph]);

  return null;
}
