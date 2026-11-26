---
name: platecost-ui-ux
description: Use when designing or building any screen or component for the PlateCost food costing app (margins dashboard, recipes, ingredients, what-if price, settings, onboarding). Enforces a simple, calm, non-generic React Native + NativeWind interface for busy food business owners in any country and blocks AI-slop design patterns.
---

# PlateCost UI/UX: Anti-Slop Skill

Read `DESIGN.md` first. This skill is the enforcement layer: what to do, what never to do, and how to check your work before calling a screen done.

## The user in one sentence

A busy café or bakery owner, one hand free, mid-range Android, who wants to know "am I making money on this dish?" in seconds.

## Non-negotiables

1. **Simple beats clever.** If a screen needs explaining, remove something.
2. **One primary action per screen**, full-width, at the bottom.
3. **4 tabs only:** Margins, Recipes, Ingredients, Settings. Never add a fifth.
4. **Max 5 visible fields per form.** Everything else goes behind "More options".
5. **Plain words.** "Profit per plate", "Usable %", "Waste buffer". No jargon without a plain partner.
6. **Status is never colour alone.** Always icon + word + colour.
7. **48dp touch targets, 16sp body text, AA contrast.**
8. **Real numbers only.** Never placeholder, rounded-for-looks, or invented data in any screen, test, or story.
9. **Built for every country.** No hard-coded currency, unit, language, date format, or reading direction. Works with long text and right-to-left layouts.

## Anti-slop: never do this

### Visual slop

- Purple-to-blue or any decorative gradients
- Glassmorphism, neumorphism, glow effects, heavy shadows
- Cards inside cards inside cards; every list item in its own floating box
- Emoji as icons or as decoration in UI text
- Stock illustrations of smiling chefs, abstract blobs, confetti
- Mixing icon sets or icon styles
- Centered everything; huge hero banners; decorative dividers
- Rainbow dashboards with more than the 3 status colours plus the brand colour
- Fake or decorative charts that carry no information

### Layout slop

- Dense dashboards with 6+ widgets on the home screen
- Hamburger menus, hidden navigation, floating action buttons competing with a primary button
- Stacked modals, confirmation dialogs for routine actions, full-screen takeover popups
- Tiny tap targets, text under 12sp, low-contrast grey on grey
- Forms with 8+ fields on one screen
- Sticky bars that cover content at 130% font size

### Copy slop

- "Unleash", "supercharge", "seamless", "empower", "revolutionise"
- Exclamation marks, celebratory toasts, "Great job!" popups
- Generic errors: "Invalid input", "Something went wrong"
- Lorem ipsum or "Item 1, Item 2" in any visible state
- Accounting jargon on first-level screens: "contribution margin", "COGS", "yield variance"

### Code slop

- Inline hex colours or magic numbers; always use Tailwind theme tokens
- One 500-line screen file; split by component and hook
- Business math inside components; math lives in `core/costing` or a feature `domain/` folder
- Floating-point money; store entered prices as integer minor units and compute derived costs with a decimal library
- Importing another feature's internals instead of its `index.ts`
- Copy-pasted components instead of `shared/ui`
- `any` types, ignored TypeScript errors, unused props
- Hard-coded currency symbols, unit names, or user-facing text in components
- `left`/`right` spacing or alignment (use start/end), or sentences built by joining string pieces
- Parsing numbers with `parseFloat` or assuming a dot decimal separator

## Do this instead

### Layout

- Screen padding 16; spacing from the 4-point scale only (4, 8, 12, 16, 24, 32).
- Lists are flat rows separated by 1px `line`, not boxed cards.
- Primary action pinned bottom, 56dp tall, full width.
- Put the most important number biggest and boldest on every row (profit per plate, then margin %).
- Left-align text. Right-align numbers, with tabular figures.

### Colour

- Use only the tokens in `DESIGN.md`: `bg`, `surface`, `ink`, `muted`, `line`, `brand`, `good`, `warn`, `bad`.
- Brand colour is for the primary button and active tab only.
- Status colours appear only on margin status, with an icon and a word.

### Typography

- System font only. Scale: Display 28, Title 20, Body 16, Label 14, Caption 12.
- Never use more than 2 font weights on one screen (regular and semibold).

### Motion

- Only functional motion: bottom sheet slide, snackbar, slider value change.
- Under 200ms, ease-out. No bouncing, no parallax, no animated backgrounds.
- Respect the system "reduce motion" setting.

### States (every screen must define all five)

Empty (one sentence + the next action), loading (skeleton only if over 300ms), error (inline, keep typed data), success (quiet snackbar), destructive (Undo snackbar).

### Copy

- Verbs for buttons: "Add dish", "Save price", "Use this price".
- Errors say what to do next: "Pieces and grams can't be mixed. Add a conversion, e.g. 1 piece = 60 g."
- Currency symbol first, locale-aware separators, always show units next to quantities.

## Global rules (every screen)

- **Currency:** format with the user's currency and locale through `Intl`. Show full numbers with grouping, never "K" or "M". Never write a symbol in a string.
- **Units:** show a unit next to every quantity. Respect the user's chosen unit system (metric or US).
- **Numbers in:** use the shared `parseDecimal`. Accept "1,5" and "1.5". Never use `parseFloat` on user input.
- **Text length:** design for 40% longer strings. No fixed-width labels or buttons. Never truncate a number.
- **Direction:** use start/end (`ms-`, `me-`, `ps-`, `pe-`) instead of left/right. Mirror directional icons. Keep amounts left-to-right.
- **Words:** full sentences with plural forms in translation files. No idioms, no slang, no text inside images.
- **Icons and colour:** culture-neutral icons, no flags for languages. Status always has an icon and a word because colour meanings differ by culture.
- **Scripts:** system font, line height at least 1.4, check tall scripts (Thai, Devanagari, Arabic).

## Implementation rules (React Native + NativeWind + feature folders)

- Colours, spacing, and radii come from `tailwind.config.js` theme extensions mapped to the tokens above. No arbitrary values like `bg-[#123456]`.
- Build or reuse components in `src/shared/ui`: `Button`, `Input`, `Slider`, `StatusPill`, `DishRow`, `ItemRow`, `BottomSheet`, `EmptyState`, `Snackbar`, `SectionHeader`, `ChannelSwitch`.
- Feature screens live in `src/features/<feature>/screens`; route files in `app/` only re-export them.
- Use FlashList for lists over 20 rows; never nest vertical lists in vertical ScrollViews.
- All user-facing strings go through i18n; no hard-coded text in components.
- Numeric inputs use the numeric keyboard and select-all on focus.
- Add `accessibilityLabel` and `accessibilityRole` to every pressable and composite row.
- Test every screen at 130% font scale and a 5.5 inch viewport.

## Pre-ship checklist (run before calling any screen done)

**Simplicity**

- [ ] Exactly one primary button, full width, bottom-anchored
- [ ] 5 or fewer visible fields; the rest behind "More options"
- [ ] A first-time user can tell what to do in 5 seconds without reading help

**Honesty**

- [ ] No placeholder, fake, or decorative data anywhere
- [ ] Every number shows currency or unit
- [ ] Math comes from the cost engine, not duplicated in the component

**Visual**

- [ ] Only theme tokens used; no gradients, shadows beyond sheets, or emoji icons
- [ ] Status shows icon + word + colour
- [ ] Right-aligned numbers with tabular figures
- [ ] Looks calm: lots of whitespace, no box-in-box

**Usability**

- [ ] 48dp minimum targets; thumb-reachable primary action
- [ ] All five states designed (empty, loading, error, success, destructive-with-undo)
- [ ] Readable at 130% font scale; AA contrast
- [ ] TalkBack reads each row as a full sentence

**Global**

- [ ] No hard-coded currency symbol, unit, or text
- [ ] Checked with pseudo-locale (long text) and one right-to-left language
- [ ] Number fields accept both "," and "." as decimal separator
- [ ] Layout uses start/end, not left/right

**Code**

- [ ] No inline colours or magic numbers
- [ ] No business logic in the component
- [ ] Strings in i18n; types strict; no `any`

If any box is unchecked, the screen is not done.

## Review prompt (use when auditing existing UI)

For each screen answer: What is the one thing the user does here? Is it the most prominent element? What can be removed without losing that? Which element looks like it came from a generic template? Fix that last one first.
