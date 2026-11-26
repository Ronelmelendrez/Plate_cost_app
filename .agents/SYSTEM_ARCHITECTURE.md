# System Architecture: PlateCost

Offline-first Android app. No backend in v1.

## 1. Stack

| Concern         | Choice                                                           | Why                                                                   |
| --------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------- |
| Framework       | React Native with Expo (managed, dev builds)                     | Fast setup, OTA-friendly, solid Android tooling                       |
| Language        | TypeScript, `strict: true`                                       | Safer money and unit math                                             |
| Styling         | NativeWind v4 (Tailwind for React Native)                        | Tailwind classes, theme tokens in one config                          |
| Navigation      | Expo Router (file-based, bottom tabs + stack)                    | Thin route files, simple deep structure                               |
| Local database  | expo-sqlite with Drizzle ORM                                     | Real relations for sub-recipes, typed queries, migrations             |
| UI state        | Zustand (small stores only)                                      | Slider, filters, onboarding step                                      |
| Forms           | React Hook Form + Zod                                            | Validation and typed inputs                                           |
| Lists           | FlashList                                                        | Smooth lists on low-end phones                                        |
| Files           | expo-file-system, expo-sharing, expo-document-picker, expo-print | Backup, restore, PDF export                                           |
| i18n and locale | i18next + expo-localization + Intl (Hermes)                      | 5 launch languages, plural rules, currency and number formatting, RTL |
| Decimal math    | decimal.js                                                       | Exact arithmetic for unit costs; no floating-point drift              |
| Testing         | Jest (domain logic), React Native Testing Library (screens)      | Math must be proven                                                   |
| Quality         | ESLint, Prettier, TypeScript, Husky pre-commit                   | Consistency                                                           |

No Redux, no server-state library, no analytics SDK in v1.

## 2. Architectural rules

1. **Feature folders.** Everything for a feature lives together. Features never import from each other's internals, only from a feature's `index.ts` public API.
2. **Thin routes.** `app/` files only render a screen from a feature.
3. **Pure domain layer.** All costing math lives in `domain/` as plain TypeScript functions with no React, no database. They are fully unit tested.
4. **Repositories wrap the database.** Screens and hooks never write SQL or Drizzle queries directly.
5. **Money is exact.** Prices the user enters are stored as integers in the currency's smallest unit (the unit depends on the currency: cents for USD, whole yen for JPY, fils for KWD). Derived values such as cost per gram are computed with a decimal library at high precision, never floats, and rounded only once for display. Quantities are stored in base units (grams, millilitres, pieces). Convert only at the UI edge.
6. **Shared code is generic.** `shared/` holds UI primitives, theme, utilities. If it knows about "recipes", it belongs in a feature.

## 3. Folder structure

```
platecost/
├─ app/                          # Expo Router, thin route files only
│  ├─ _layout.tsx
│  ├─ (tabs)/
│  │  ├─ _layout.tsx             # 4 bottom tabs
│  │  ├─ index.tsx               # Margins (dashboard)
│  │  ├─ recipes.tsx
│  │  ├─ ingredients.tsx
│  │  └─ settings.tsx
│  ├─ recipe/[id].tsx
│  ├─ recipe/[id]/price.tsx      # What-if
│  ├─ ingredient/[id].tsx
│  ├─ impact.tsx
│  └─ onboarding.tsx
├─ src/
│  ├─ features/
│  │  ├─ ingredients/
│  │  │  ├─ screens/
│  │  │  ├─ components/
│  │  │  ├─ hooks/
│  │  │  ├─ data/                # repository, queries
│  │  │  ├─ domain/              # yield and unit-cost logic
│  │  │  ├─ types.ts
│  │  │  └─ index.ts             # public API
│  │  ├─ recipes/                # builder, sub-recipes, packaging, cycle check
│  │  ├─ channels/               # channels, waste, target margin, fees
│  │  ├─ dashboard/              # margin list, target slider, status logic
│  │  ├─ pricing/                # what-if slider, suggested price, rounding
│  │  ├─ impact/                 # price-change impact calculation and screen
│  │  ├─ backup/                 # export, restore, PDF cost sheet
│  │  └─ onboarding/             # first-run flow, starter templates
│  ├─ core/
│  │  ├─ costing/                # cost engine used by multiple features
│  │  │  ├─ costEngine.ts
│  │  │  ├─ units.ts
│  │  │  ├─ money.ts
│  │  │  ├─ cycleCheck.ts
│  │  │  └─ __tests__/
│  │  └─ db/
│  │     ├─ client.ts
│  │     ├─ schema.ts
│  │     └─ migrations/
│  ├─ shared/
│  │  ├─ ui/                     # Button, Input, Card, Slider, StatusPill, EmptyState
│  │  ├─ theme/                  # tokens used by tailwind.config
│  │  ├─ i18n/
│  │  └─ lib/                    # formatters, hooks, helpers
│  └─ types/
├─ tailwind.config.js
├─ global.css
└─ tsconfig.json                 # path aliases: @features, @core, @shared
```

## 4. Data model

All ids are UUID text. All money fields are integers. All quantities are in base units.

| Table                      | Key fields                                                                                                                                                                                                                              |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ingredients`              | id, name, purchase_unit, purchase_qty, purchase_price, yield_pct, is_favourite, last_used_at, updated_at                                                                                                                                |
| `unit_conversions`         | id, ingredient_id, from_unit, to_base_factor (e.g. cup to 120 g)                                                                                                                                                                        |
| `ingredient_price_history` | id, ingredient_id, price, qty, recorded_at                                                                                                                                                                                              |
| `packaging_items`          | id, name, cost                                                                                                                                                                                                                          |
| `recipes`                  | id, name, batch_yield_qty, yield_unit, portions, is_sub_recipe, labor_minutes, notes, updated_at                                                                                                                                        |
| `recipe_items`             | id, recipe_id, kind (`ingredient` / `recipe` / `packaging`), ref_id, qty, unit                                                                                                                                                          |
| `channels`                 | id, name, commission_pct, payment_fee_pct, is_default                                                                                                                                                                                   |
| `recipe_channel_prices`    | recipe_id, channel_id, price                                                                                                                                                                                                            |
| `settings`                 | single row: currency_code, locale, language, unit_system (`metric` / `us`), cup_ml, tbsp_ml, prices_include_tax, tax_pct, waste_pct, target_margin_pct, labor_hourly_rate, overhead_mode, overhead_value, rounding_rule, schema_version |

Indexes: `recipe_items(recipe_id)`, `recipe_items(kind, ref_id)` (for impact lookups), `ingredients(name)`.

## 5. Cost engine (core/costing)

Pure functions, no side effects.

- `costPerUsableUnit(ingredient)`
- `resolveItemCost(item, context)` handles ingredient, sub-recipe (recursive), and packaging
- `recipeCost(recipeId, context)` returns `{ batchCost, perPortion, breakdown[] }`
- `netPrice(price, tax)` removes tax when prices include it
- `channelResult(cost, price, channel, tax)` returns `{ netPrice, fees, profit, marginPct }`
- `suggestedPrice(cost, targetMargin, channel, rounding)` returns a price, or an "impossible" result
- `detectCycle(recipeId, candidateChildId)` runs before saving a link
- `impactOfChange(changedRef, before, after, target)` returns the affected dishes and which crossed below target

Behaviour notes:

- Memoize per recompute so a sauce used by 5 dishes is costed once.
- Costs are derived, not stored. They are always recomputed from current inputs, so there is no stale data.
- Rounding happens once, at the end, never in the middle of the chain.
- Units convert through a base unit (g, ml, pc); incompatible units (grams to pieces without a custom conversion) return a typed error the UI can explain.

## 6. Data flow

```
Screen -> hook (useRecipeCost) -> repository (read rows) -> costEngine (pure) -> view model -> Screen
Edit   -> form (Zod validated) -> repository.write -> invalidate -> recompute dashboard
```

Dashboard recomputation loads all recipes and items in a few queries, runs the engine in memory, and renders. At 200 recipes this is well under 100 ms.

## 7. Backup and restore

- Export: serialize all tables plus `schema_version` into one JSON file, shared through the Android share sheet.
- Restore: pick file, validate with Zod and version, show a summary ("42 ingredients, 18 dishes"), ask to replace or merge (v1: replace only), then run in one transaction. Roll back on any error.
- Reminder: prompt after the first saved recipe, then a gentle weekly nudge. Nothing leaves the device unless the user shares it.

## 8. Error handling

- Typed domain errors (`UnitMismatch`, `CycleDetected`, `ImpossibleMargin`) mapped to plain-language messages in one place.
- Global error boundary with a "Your data is safe" screen and a restart button.
- DB migrations are forward-only, tested, and run before first render.

## 9. Performance budget

- Cold start under 2 s on a 2 GB RAM Android.
- List of 200 dishes scrolls at 60 fps using FlashList.
- Slider updates computed synchronously from cached cost (no DB calls while dragging).
- APK under 40 MB; no unused native modules.

## 10. Testing strategy

| Layer        | Tool                       | What                                                                                                |
| ------------ | -------------------------- | --------------------------------------------------------------------------------------------------- |
| Cost engine  | Jest                       | Hand-calculated cases: yield, waste, nested sub-recipes, delivery fees, impossible margin, rounding |
| Repositories | Jest + in-memory SQLite    | CRUD, migrations, restore transaction                                                               |
| Screens      | RNTL                       | First-dish flow, empty states, validation messages                                                  |
| Device       | Manual on 2 low-end phones | Performance, one-hand use, offline                                                                  |

Golden test: a fixture "Chicken Rice" dish with a stock sub-recipe, checked against a spreadsheet.

## 11. Build, release, and CI

- EAS Build for Android (AAB), GitHub Actions for lint, typecheck, tests on every PR.
- Release tracks: internal testing, closed beta, production.
- Feature flags are not needed in v1.

## 12. Privacy and security

- No accounts, no network calls, no analytics in v1. The app does not request the INTERNET permission unless added later.
- Backup files are plain JSON the user controls; warn that they contain business data.

## 13. Global readiness architecture

**Currency (`core/costing/money.ts`)**

- A small currency table: ISO code, minor-unit exponent (0, 2, or 3), default rounding rule.
- Display always goes through `Intl.NumberFormat` with the user's currency and locale. No hard-coded symbols anywhere.
- Changing currency later does not convert stored prices; show a warning and keep the numbers.

**Units (`core/costing/units.ts`)**

- Base units: grams, millilitres, pieces. Conversion table covers metric and US customary (oz, lb, fl oz, tsp, tbsp, cup).
- `cup_ml` and `tbsp_ml` come from settings, defaulted by region, because they vary by country.
- Per-ingredient conversions override the general table.

**Locale and first run**

- On first launch, `expo-localization` pre-fills language, currency, and unit system. The user confirms with one tap or changes them.
- All three are stored in `settings` and can be changed at any time.

**Number input**

- `parseDecimal(input, locale)` accepts "1,5", "1.5", "1 500,50", and "1,500.50" and returns an exact decimal.
- Ambiguous cases like "1,500" use the locale to decide (thousands vs decimal).
- Display formatting happens on blur; the field never rewrites digits while the user is typing.

**Tax**

- Handled in the pure engine (`netPrice`). Off by default; screens do not contain tax math.
- Fees and margin use net price. The commission base is an editable assumption, not hard-coded per platform.

**i18n**

- i18next with one namespace per feature; keys, never concatenated sentences; ICU-style plurals through `Intl.PluralRules`.
- English is the fallback. Launch language files are bundled (small); no network needed.
- A pseudo-locale (long, accented strings) is used in development to catch clipped text.
- RTL: `I18nManager` plus logical style properties; directional icons mirror; numbers stay left-to-right.

**Starter data**

- Starter ingredients, packaging, and channel templates are JSON per locale in `features/onboarding/templates/`, with English fallback. Adding a region pack needs no code change.

**Backup**

- The backup JSON includes `currency_code`, `unit_system`, tax settings, and `schema_version`, so a restore on another phone or country reproduces the same results.

**Tests**

- Golden cost tests for USD, EUR, JPY (0 decimals), IDR (large units), and KWD (3 decimals).
- Parser tests for decimal comma and dot formats.
- Screenshot checks in the pseudo-locale and in one RTL language.

**Release**

- Google Play: all countries, localized listing text and screenshots for each launch language.

## 14. Future-proofing (do not build now)

- Keep repositories behind interfaces so a sync backend can be added later.
- Keep `schema_version` and a migration path from day one.
- Keep all text in i18n files from the start.
