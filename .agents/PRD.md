# PRD: PlateCost (working name)

A free, offline Android app that tells food business owners what each dish really costs and whether they are actually making money.

## 1. Problem

Small food businesses worldwide (cafés, bakeries, street food stalls, small restaurants, cloud kitchens, home bakers) price by guesswork. Their costing is wrong because:

- They ignore trimming and yield loss (90% usable chicken is not 100%).
- They forget packaging, spoilage, and delivery platform commissions.
- A supplier price change never reaches their menu prices.
- Existing tools are paid, online-only, or built for accountants.

## 2. Goal and success metrics

**Goal:** an owner, in any country, can cost a dish and see a trustworthy margin in under 3 minutes, in their own language and currency, with no training.

| Metric                                                           | Target          |
| ---------------------------------------------------------------- | --------------- |
| Time to first costed dish (new user)                             | under 3 minutes |
| Users with 5+ recipes by day 7                                   | 40%             |
| Users who open "Price change impact" after editing an ingredient | 50%             |
| 30-day retention                                                 | 25%             |
| Crash-free sessions                                              | 99.5%           |

## 3. Users

- **Primary:** owner-operator, non-technical, phone-only, often one-handed in a busy kitchen.
- **Secondary:** home baker or online seller starting to price products.
- **Not for (v1):** multi-branch chains, accountants, inventory/stock tracking.

## 4. Principles

1. Free, fully offline, no account, no ads.
2. Simple first: max 4 tabs, one main action per screen.
3. Numbers must be right. Costing math is tested and money is never stored as floating point.
4. Explain, don't decorate. Say "profit per plate", not "contribution margin".
5. Works anywhere: any currency, metric or US units, any of the launch languages, with no country-specific assumptions baked in.

## 5. MVP scope

### F1. Ingredient Library

- Fields: name, purchase unit (kg, L, piece), purchase quantity, purchase price, usable yield % (default 100).
- Auto-shows cost per usable unit.
- Per-ingredient unit conversions (e.g. 1 cup flour = 120 g).
- Recent and favourite ingredients first; search by name.
- Updating price saves a history entry.

### F2. Recipe Builder

- Add ingredients, sub-recipes, and packaging items by quantity and unit.
- Fields: batch yield (portions), selling price, notes.
- Shows cost per batch and per portion.
- Sub-recipes are linked, not copied. A change flows to every dish that uses them.
- Circular links are blocked with a plain-language message.
- Packaging items are reusable (name, cost), added per portion.
- Optional: labor minutes per batch times hourly rate; overhead as flat amount or % per portion.

### F3. Channels and Costs Settings

- Global: waste % (default 5%, spoilage and mistakes), target margin %, plus currency, units, and tax settings (see section 6A).
- Channels: Dine-in (no fees), Delivery (commission %, payment fee %), custom channels allowed.
- Per recipe: choose which channels it is sold through and the price on each.
- Waste % and yield % are labeled separately so owners understand the difference.

### F4. Margin Dashboard (home screen)

- List of every dish: price, true cost, profit per plate, margin %.
- Status per row: green at or above target, amber within 5 points below, red worse. Always icon + label as well as colour.
- Channel switch at top (Dine-in / Delivery) so the same dish shows two margins.
- Target margin slider shows how many dishes fail.
- Sort by worst margin first (default).
- Analytics overview shows average margin, dishes below target, and the best and lowest margins for the selected channel, using saved prices only.

### F5. What-If Price Slider

- On a recipe: slider changes price and shows new margin and profit live.
- "Suggested price" button for the target margin on the selected channel, rounded to a friendly price.
- "Use this price" saves it.

### F6. Price Change Impact

- After editing an ingredient or sub-recipe price: "This affects 7 dishes. 2 are now below target." with a tap-through list.

### F7. Backup and Export

- One-tap backup to a JSON file (share to Drive, WhatsApp, etc.) and restore from file.
- Restore merges non-conflicting records. Existing records and current settings win conflicts; recipe items and channel prices are added only for new dishes, and unit conversions only for new ingredients.
- Export a recipe cost sheet as PDF.

### F8. First-run Onboarding

- 3-step guided flow: add 3 ingredients, build 1 dish, see margin.
- Starter templates for common ingredients, packaging, and platform commission rates (editable).

## 6. Core formulas (source of truth)

- Cost per usable unit = purchase price ÷ (purchase quantity × yield %).
- Ingredient line cost = quantity (converted to base unit) × cost per usable base unit.
- Sub-recipe cost per unit = sub-recipe batch cost ÷ its batch yield quantity.
- Batch ingredient cost = sum of line costs × (1 + waste %).
- Cost per portion = batch cost ÷ portions + packaging per portion + labor per portion + overhead per portion.
- Net price = price ÷ (1 + tax %) when the user's prices include tax (VAT, GST, sales tax); otherwise net price = price. Tax is off by default.
- Channel fees = net price × (commission % + payment fee %). Fees are charged on price, not cost. (Platforms differ on whether the base includes tax; the commission base is an editable assumption.)
- Profit per plate = net price − fees − cost per portion.
- Margin % = profit ÷ net price.
- Suggested net price = cost per portion ÷ (1 − target margin − commission % − payment fee %). Suggested shelf price = suggested net price × (1 + tax %) when prices include tax, then rounded by the currency's rounding rule.
  If the denominator is zero or less, show: "This channel's fees are too high to reach your target margin."

## 6A. Global readiness (required in v1, not a later add-on)

| Area                | Requirement                                                                                                                                                                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Currency            | Any ISO 4217 currency, pre-selected from the device region at first run and changeable in Settings. Supports 0-decimal (JPY, KRW, IDR, VND), 2-decimal, and 3-decimal (KWD, BHD) currencies. Symbol position and separators follow the locale.      |
| Units               | Metric (g, kg, ml, L) and US customary (oz, lb, fl oz, cup, tbsp, tsp). The user picks a unit system at first run and can still mix units per recipe line.                                                                                          |
| Cup and spoon sizes | These differ by country (for example a cup is 240 ml in the US and 250 ml in many other places). Setting "Cup size" and "Tablespoon size" with a sensible default per region. Per-ingredient conversions (e.g. 1 cup flour = 120 g) still override. |
| Tax                 | Optional, under "More options": "My prices include tax" plus a tax rate %. Margins are calculated on the price without tax, so VAT/GST countries do not see overstated profit.                                                                      |
| Languages           | Launch: English, Spanish, Portuguese (Brazil), Indonesian, Filipino. Next wave: Hindi, French, Vietnamese, Thai, Turkish, Arabic (right-to-left). All text lives in translation files from day one.                                                 |
| Number entry        | Accept both "," and "." as the decimal separator in every number field; show the locale's format after leaving the field.                                                                                                                           |
| Channels            | Generic templates: Dine-in, Takeaway, Delivery app, Online order. No platform brand names baked in. The user names their own platform and enters their own rates.                                                                                   |
| Rounding            | "Suggested price" rounds by currency: for 2-decimal currencies, nearest .00, .50, or .99 ending; for currencies with large units (JPY, IDR, VND), nearest 10, 50, 100, or 1,000. Default chosen per currency; changeable.                           |
| Starter data        | Starter ingredients and packaging are generic and translated; regional packs can be added later without app changes.                                                                                                                                |
| Backup              | Backup file stores currency, unit system, and tax settings, so a restore on another phone or in another country works.                                                                                                                              |
| Distribution        | Google Play in all countries, localized store listing and screenshots per launch language, a privacy policy stating that no data leaves the device.                                                                                                 |
| Legal wording       | A short note in Settings: "Costs are estimates to help you price. They are not tax or accounting advice."                                                                                                                                           |

Changing currency later does not convert existing prices (the app has no exchange rate). It warns the user and keeps the numbers as they are.

## 7. Out of scope (v1)

Cloud sync and accounts, inventory and stock, POS integration, sales analytics (menu engineering), break-even calculator, receipt photo scanning, AI features, multi-branch, iOS.

## 8. Later (v1.x, after validation)

Menu engineering (stars, plowhorses, puzzles, dogs) from sales counts, break-even calculator, recipe scaling, ingredient price trend chart, paid tier for cloud sync and PDF branding.

## 9. Non-functional requirements

- Works fully offline; cold start under 2 seconds on a low-end Android (2 GB RAM).
- Handles 500 ingredients and 200 recipes with no visible lag.
- Entered prices stored as integers (smallest currency unit); derived costs computed with exact decimal math; no floating-point rounding errors.
- Data never leaves the device unless the user exports it.
- Accessible: 48dp touch targets, 16sp minimum body text, contrast AA, TalkBack labels.
- Global from day one: any currency, metric and US units, 5 launch languages, and right-to-left-ready layouts (see section 6A).

## 10. Risks and mitigations

| Risk                                | Mitigation                                                              |
| ----------------------------------- | ----------------------------------------------------------------------- |
| Data entry feels like work          | Onboarding flow, templates, favourites, unit conversions                |
| Lost phone means lost data          | Backup prompt after first recipe and weekly reminder                    |
| Owners misread two kinds of "waste" | Separate labels with short help text                                    |
| Wrong math destroys trust           | Pure-function cost engine with unit tests against hand-calculated cases |
| Feature creep                       | Anything outside section 5 needs a written reason                       |

## 11. Milestones

1. **M1 Foundation (week 1-2):** project setup, theme tokens, DB schema, cost engine with tests.
2. **M2 Ingredients and Settings (week 3):** library, conversions, channels.
3. **M3 Recipes (week 4-5):** builder, sub-recipes, packaging, cycle check.
4. **M4 Dashboard and What-If (week 6):** margin list, slider, suggested price, impact screen.
5. **M5 Safety, polish, and localization (week 7-8):** backup/restore, PDF export, onboarding, templates, translations for 5 launch languages, currency and unit tests, pseudo-locale and RTL checks.
6. **M6 Beta (week 9-10):** 10 real food businesses across at least 3 countries and 3 languages, fix top 5 friction points, Play Store internal testing with localized listings.

## 12. Open questions

- Final 5 launch languages after checking where beta testers are (proposed: English, Spanish, Portuguese-BR, Indonesian, Filipino)?
- Who translates and reviews each language (paid translators, community, or both)?
- Is labor/overhead on by default or hidden under "Advanced"? (Recommendation: hidden.)
