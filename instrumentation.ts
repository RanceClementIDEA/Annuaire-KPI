// Point d'entrée d'instrumentation Next.js : charge la config Sentry
// adaptée au runtime courant. Exécuté une fois au démarrage.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Capture des erreurs des Server Components / route handlers (Next 14.2+).
export { captureRequestError as onRequestError } from "@sentry/nextjs";
