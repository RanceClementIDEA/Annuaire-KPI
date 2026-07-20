/**
 * Logique (pure) des alertes d'échéance de missions.
 * La partie base de données vit dans app/api/cron/alertes-echeances.
 */

/** Nombre de jours avant l'échéance à partir duquel on alerte. */
export const SEUIL_JOURS = 3;

/** Date limite = maintenant + seuil (bornes de la fenêtre d'alerte). */
export function dateLimite(maintenant: Date, seuilJours = SEUIL_JOURS): Date {
  const d = new Date(maintenant.getTime());
  d.setUTCDate(d.getUTCDate() + seuilJours);
  return d;
}

/** Une échéance (ISO AAAA-MM-JJ) est-elle dépassée par rapport à aujourd'hui (ISO) ? */
export function estEnRetard(echeanceIso: string, todayIso: string): boolean {
  return echeanceIso < todayIso;
}

/** Message d'alerte destiné au tuteur. Déterministe (sert aussi de clé de déduplication). */
export function messageAlerte(
  titre: string,
  alternantNom: string,
  echeanceIso: string,
  enRetard: boolean,
): string {
  return enRetard
    ? `Échéance dépassée pour ${alternantNom} : « ${titre} » (prévue le ${echeanceIso}).`
    : `Échéance proche pour ${alternantNom} : « ${titre} » (le ${echeanceIso}).`;
}
