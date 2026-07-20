// Configuration Sentry — runtime Edge (middleware, routes edge).
// Chargée via instrumentation.ts quand NEXT_RUNTIME === "edge".
// Sans DSN, Sentry reste totalement inerte.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
});
