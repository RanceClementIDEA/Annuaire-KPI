// Configuration Sentry — runtime navigateur (client).
// Sans DSN, Sentry reste totalement inerte : aucun envoi, aucun coût.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  tracesSampleRate: 0.1,
  // Pas de session replay par défaut (confidentialité + quota gratuit).
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  sendDefaultPii: false,
});
