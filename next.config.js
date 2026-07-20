/** @type {import('next').NextConfig} */

// En-têtes de sécurité appliqués à toutes les réponses.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  // HSTS : n'a d'effet qu'en HTTPS (prod).
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // CSP volontairement compatible Next (inline styles/bootstrap). Durcir avec un
  // nonce en prod si besoin. img https: pour les logos de rapport.
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      // Supabase (Auth, REST, Realtime) + Sentry + PostHog (analytics).
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.sentry.io https://*.ingest.sentry.io https://*.ingest.de.sentry.io https://*.posthog.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig = {
  reactStrictMode: true,
  // Ces paquets Node ne doivent pas être bundlés par webpack (binaires/optional deps).
  experimental: {
    serverComponentsExternalPackages: ["playwright-core", "exceljs"],
    // Active le chargement d'instrumentation.ts (init Sentry serveur/edge).
    instrumentationHook: true,
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

// Enrobage Sentry. Sans DSN, le SDK est inerte ; l'upload de source maps est
// désactivé pour que le build passe sans jeton d'authentification Sentry.
const { withSentryConfig } = require("@sentry/nextjs");

module.exports = withSentryConfig(nextConfig, {
  silent: true,
  telemetry: false,
  disableLogger: true,
  sourcemaps: { disable: true },
});
