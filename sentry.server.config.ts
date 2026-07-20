// Configuration Sentry — runtime serveur (Node.js).
// Chargée via instrumentation.ts au démarrage du serveur.
// Sans DSN, Sentry reste totalement inerte : aucun envoi, aucun coût.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  // Échantillonnage des traces de performance (10 % suffit pour un MVP).
  tracesSampleRate: 0.1,
  // Ne pas envoyer les données de requête personnelles par défaut (RGPD).
  sendDefaultPii: false,
});
