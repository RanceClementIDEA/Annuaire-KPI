import { ThemeToggle } from "@/components/theme/theme-toggle";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-muted p-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-2xl font-bold tracking-tight text-foreground">
            Altern<span className="text-primary">Pilot</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Le copilote du maître d&apos;apprentissage.
          </p>
        </div>
        <div className="rounded-2xl border bg-card p-6 shadow-soft-lg sm:p-8">
          {children}
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          <a href="/confidentialite" className="hover:underline">
            Politique de confidentialité
          </a>
        </p>
      </div>
    </div>
  );
}
