# Design Document: PlateCost

Simple by rule, not by accident. The user is a busy owner, standing in a kitchen, using one hand, on a mid-range Android.

## 1. Design goals

1. A new user costs a dish in under 3 minutes without reading anything.
2. Every screen has one obvious primary action.
3. A glance at the home screen answers: "Which dishes are losing me money?"
4. Never show jargon without a plain-language partner.

## 2. Simplicity rules (hard limits)

- **4 tabs only:** Margins, Recipes, Ingredients, Settings.
- **One primary button per screen**, bottom of the screen within thumb reach.
- **Max 3 taps** from any tab to add an ingredient, add a dish, or change a price.
- **No more than 5 fields visible** on a form at once. Advanced options sit behind one "More options" row.
- **Progressive disclosure:** labor, overhead, conversions, and price history are hidden until asked for.
- **No modals stacked on modals.** One bottom sheet at a time, max.
- **No settings the user must set before they can start.** Every default is sensible.
- **Nothing is deleted without undo** (snackbar "Deleted. Undo").

## 3. Information architecture

```
Margins (home)      Recipes            Ingredients         Settings
 └ dish detail       └ recipe editor     └ ingredient edit    └ Channels and fees
    └ What-if price     └ add item sheet     └ conversions     └ Target and waste
 └ Impact list                               └ price history
                                            └ Packaging switch
                                                                └ Language, currency
```

First launch: one "Your setup" screen with language, currency, and units, all pre-filled from the device so most users just tap Continue. Then onboarding, then Margins. Wireframes in this document use "$" as an example; the real app always shows the user's own currency.

## 4. Key screens

### 4.1 Margins (home)

```
┌─────────────────────────────┐
│ Margins          [Delivery ▾]│  channel switch: Dine-in | Delivery
│ Target margin  65%           │
│ ──────────○────────          │  slider
│ 3 of 12 dishes below target  │  plain summary
│─────────────────────────────│
│ Chicken Rice          ▼ 38% │  red: icon + label "Low"
│ $149 · cost $71 · +$56/plate│
│─────────────────────────────│
│ Iced Latte            ● 61% │  amber "Close"
│ $120 · cost $35 · +$73/plate│
│─────────────────────────────│
│ Banana Bread          ▲ 72% │  green "Good"
│                              │
│ [ + Add dish ]               │
└─────────────────────────────┘
```

- Worst margins first. Tap a row to open the dish.
- Empty state: "No dishes yet. Add your first one. It takes about 3 minutes." with the primary button.

### 4.2 Recipe editor

- Top: name, portions, selling price.
- Middle: list of food items (ingredient and sub-recipe) with quantity and line cost.
- Dishes have a separate **Packaging** section below the food-item list, with a secondary "Add packaging" action. Keep "Add item" as the screen's one primary button.
- Each packaging line shows its item, quantity per portion, and channel scope chips: All channels or selected channels. Do not show this section for sub-recipes.
- Sticky summary bar shows **Food cost** and **Packaging cost** separately, plus **Cost per plate** and **Profit per plate** for the selected channel.
- Primary button: **Add item**, opening a bottom sheet with search plus recent and favourite items first.
- "More options" row: labor, overhead, notes.

### 4.3 What-if price

```
Selling price        $149
──────────○────────────
Food cost            $55
Packaging            $16   (Delivery)
Delivery fee         $45   (30%)
Profit per plate     $33
Margin               22%  ▼ Low

[ Suggest price for 65% ]   → $249
[ Use this price ]
```

- Show the packaging cost that applies to the selected channel. Dine-in and Delivery may have different costs and suggested prices.
- Slider range: selected-channel cost to 3x cost. Steps in friendly increments.
- If the target is impossible: "Delivery fees are too high to reach 65% on this channel."

### 4.4 Ingredient form

Fields: Name, Buy by (kg / L / piece), Quantity bought, Price paid, Usable % (with helper "After trimming, peeling, bones").
Live line under the form: "Costs $0.18 per usable gram."
Advanced: unit conversions, price history.

### 4.5 Packaging library

- The Ingredients tab has a two-option switch: **Ingredients | Packaging**. Do not add a fifth tab.
- Packaging form fields: name, pack price, pieces per pack, and note. Do not show yield or trimming loss.
- Show the derived, locale-formatted cost per piece (for example, "Costs 4.50 per piece").
- Packaging rows support search and favourites. Offer optional starter packaging templates the first time Packaging is opened.
- Packaging is optional during onboarding and is not part of the 3-step first-dish flow.
- Saved groups such as a Delivery bundle are deferred to v1.1 and should only be designed after beta feedback requests them.

### 4.6 Price change impact

After saving an ingredient or packaging pack price: bottom sheet reading "This changes 7 dishes. 2 are now below target." with a list and a "Review" button. Dismissible. Recalculate affected dish margins with each channel's applicable packaging.

### 4.7 Onboarding (3 steps, skippable)

1. Pick or add 3 ingredients from a starter list.
2. Build one dish by choosing those ingredients and amounts.
3. See the margin and a plain explanation of what it means.

A progress dot indicator is the only chrome. Ends on Margins with the new dish visible.

## 5. Visual language

**Tone:** calm, practical, kitchen-clean. Warm neutrals with one confident accent. No gradients, no decoration for its own sake.

### Colour tokens (Tailwind theme)

| Token     | Use                         | Value   |
| --------- | --------------------------- | ------- |
| `bg`      | App background              | #FAF8F5 |
| `surface` | Cards, sheets               | #FFFFFF |
| `ink`     | Primary text                | #1F1B16 |
| `muted`   | Secondary text              | #6B645B |
| `line`    | Dividers                    | #E7E2DA |
| `brand`   | Primary buttons, active tab | #1F6F5C |
| `good`    | Margin at or above target   | #1E7A3E |
| `warn`    | Within 5 points             | #B26A00 |
| `bad`     | Below target                | #C0392B |

Status colours are always paired with an icon and a word ("Good", "Close", "Low"). Colour is never the only signal.

### Typography

- One family: system font (Roboto on Android) for speed and legibility.
- Scale: Display 28 / Title 20 / Body 16 / Label 14 / Caption 12 (sp). Nothing below 12, body never below 16.
- Numbers use tabular figures so columns align.
- Money and margin values are the boldest things on a row.

### Spacing, shape, and touch

- 4-point spacing scale (4, 8, 12, 16, 24, 32). Screen padding 16.
- Radius: 12 for cards and inputs, 999 for pills.
- Minimum touch target 48dp. Primary button height 56dp, full width.
- Elevation only for bottom sheets; cards use a 1px line, not shadows.

### Iconography

- One consistent line icon set (e.g. Lucide). No emoji as icons.
- Icons always have text labels in the tab bar and primary actions.

## 6. Core components

`Button` (primary, secondary, text), `Input` (with unit suffix and helper text), `NumberStepper`, `Slider` (large thumb, shows value), `StatusPill`, `DishRow`, `ItemRow`, `BottomSheet`, `EmptyState`, `Snackbar` (with Undo), `SectionHeader`, `ChannelSwitch`.

Each component is built once in `shared/ui` and documented with all states: default, focused, error, disabled, loading.

## 7. Content and microcopy

- Say "profit per plate", with "margin %" as the secondary number.
- Say "Usable %", with helper "After trimming, peeling, bones".
- Say "Waste buffer" for global waste, helper "Spoilage and mistakes".
- Say "Pack price" and "Pieces per pack"; show cost per piece. Packaging is not affected by the waste buffer.
- Errors say what to do: "Weight and pieces can't be mixed. Add a conversion, e.g. 1 piece = 60 g." Never "Invalid input".
- Numbers: locale-aware thousands and decimals, currency symbol first.
- Keep every label under 3 words where possible. All text lives in i18n files.

## 8. States and behaviour

| State       | Behaviour                                                        |
| ----------- | ---------------------------------------------------------------- |
| Empty       | Friendly one-liner and the single next action                    |
| Loading     | Skeleton rows only if over 300 ms; otherwise nothing             |
| Error       | Inline message under the field; never lose typed data            |
| Success     | Subtle snackbar, no celebratory popups                           |
| Destructive | Undo snackbar, not a confirm dialog                              |
| Offline     | No special state. The app is always offline, so never mention it |

## 9. Interaction details

- Numeric keyboard for all number fields; selecting a field selects its text.
- Slider triggers light haptic at the target margin line.
- Pull to refresh is not needed (all local data).
- Swipe a row to delete or favourite, with a visible alternative in the overflow menu.
- Back always goes up one level; the tab bar is always visible except in onboarding.

## 10. Global design rules

- **Longer text:** every layout must survive strings 40% longer than English (German, Portuguese, Filipino). No fixed-width buttons or labels; allow two-line labels; never truncate numbers.
- **Right-to-left:** use logical spacing and alignment (start/end, not left/right). Mirror back arrows and chevrons. Numbers and currency amounts stay left-to-right inside RTL text. Test the slider direction.
- **Currency:** never hard-code a symbol. Format with the user's currency and locale. Show the full number with grouping (no "K" or "M" shortcuts), because 0-decimal currencies like JPY, IDR, and VND have large values.
- **Number entry:** the decimal pad follows the locale; accept both comma and dot; format the value only after the user leaves the field.
- **Units:** a unit sits next to every quantity. Metric or US units are chosen once in setup. Cup and spoon size appear only when the user opens conversions.
- **Icons:** use plain, culture-neutral shapes (chart, book, basket, gear). Avoid hand gestures and country-specific food pictures. Do not use flags for languages; list each language by its own name.
- **Colour meaning:** red and green do not mean the same everywhere. Status always shows an icon and a word, so the meaning never depends on colour culture.
- **Copy:** short sentences, no idioms or slang. No sentences built from joined fragments; use full translatable strings with plural forms. No text baked into images.
- **Scripts:** use the system font for each script (Latin, Devanagari, Thai, Arabic). Give lines at least 1.4 line height so tall scripts are not clipped.
- **Dates and weeks:** format with the locale; first day of the week follows the locale.

## 11. Accessibility

- Contrast at least AA on all text and status colours.
- TalkBack labels for every control; dish rows read "Chicken Rice, price 149, margin 38 percent, low".
- Supports system font scaling up to 130% without clipping.
- One-handed use: primary actions in the bottom 40% of the screen.

## 12. Design acceptance checklist

- [ ] New tester costs a dish unaided in under 3 minutes
- [ ] Each screen has exactly one primary button
- [ ] No more than 5 visible fields per form
- [ ] Status never relies on colour alone
- [ ] Every number has a unit or currency
- [ ] Channel-specific packaging appears only in the matching channel's cost and margin
- [ ] Sub-recipes cannot include packaging
- [ ] Every empty state has a next action
- [ ] Works at 130% font size on a 5.5 inch screen
- [ ] Works with 40% longer text (pseudo-locale) with nothing clipped
- [ ] Works in a right-to-left language with mirrored icons and layout
- [ ] No hard-coded currency symbol, unit, or text
- [ ] Accepts "1,5" and "1.5" in every number field
