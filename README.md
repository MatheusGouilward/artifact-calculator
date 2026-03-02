# Genshin Artifact Calculator

Deterministic calculator for Genshin Impact artifact farming, scoring, and strategy planning.

## Key Features

- Domain / Strongbox (Oferta Mística) / Transmuter (Transmutador de Artefatos) strategy analysis
- Upgrade requirement modeling with 3-sub vs 4-sub artifact roll nuance
- Deterministic CV (Crit Value / Valor Crítico) scoring
- Optimizer recommendations with run/resin targets per strategy
- Shareable link config via `cfg` query param
- PT-BR localization and dark mode support

## Assumptions

- Always AR45+ (5-star domains)

## Commands

```bash
pnpm install
pnpm dev
pnpm update:game-data
pnpm test
pnpm build
pnpm start
```

## Game Data Updates

- Run `pnpm update:game-data` to refresh `game-data-lite.json` locally.
- A GitHub Actions workflow (`.github/workflows/update-game-data.yml`) can run manually or weekly to open a PR when generated data changes.

## Share Links (`cfg`)

The app can serialize UI/form state into the `cfg` query param (base64url JSON payload).
Opening a shared link restores configuration (including locale/theme when present).
