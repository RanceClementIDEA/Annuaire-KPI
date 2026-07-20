# Supply Chain Project Manager (MVP)

Application web de **gestion de projet spécialisée Supply Chain / Logistique** :
pilotage de réimplantations d'entrepôt, lancements de routes de transport,
optimisations d'approvisionnement.

## Fonctionnalités cibles
- **Diagramme de Gantt** — jalons critiques (validation plans, appro, tests, go-live).
- **Suivi de réunions** — comptes-rendus, décisions, affectation d'actions.
- **To-Do interactive** — reliée aux tâches du Gantt et aux réunions.
- **Dashboard logistique** — risques, retards des tâches critiques, charge des équipes.

## Stack
Next.js (React + TypeScript) · Prisma ORM · SQLite (local) / PostgreSQL (prod) ·
`gantt-task-react` · Recharts.

## Démarrage
```bash
npm install
npx prisma migrate dev --name init
npm run seed
npm run dev        # http://localhost:3000
```

## Documentation
Analyse de faisabilité, architecture et feuille de route MVP :
**[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)**.

> État actuel : squelette de démarrage (dashboard + API + modèle de données +
> intégration Gantt). Voir la feuille de route dans le doc d'architecture.
