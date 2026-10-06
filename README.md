# MechTitan Card Forge

A dependency-free, browser-based card editor for the MechTitan TCG. It is designed to run directly on GitHub Pages.

## Features

- Reference-calibrated layered rendering that remains active while names, costs, text, and stats are edited
- Separate frame, construction, operation, asset-cost, Cycle, Tap, speed, attack, defense, and rarity-bolt assets
- Responsive 0–5 Asset Cost frame variants; unused header space is reclaimed by centered Tags and Types/Subtypes rows
- Five Speed assets with a moving orange range and inverted black marker for XS, S, M, F, and XF
- Bolt-head rarity rail: Unique (1), Rare (2), Uncommon (3), Common (4)
- Exact 2.5 × 3.5 inch poker-card trim with 1/8 inch bleed on every edge
- Rules for every specified cost and combat stat
- Live comprehensive Unit balance model with separate Static, Operational, and Economic Power; suggested Construction; cost variance; Battlefield Projection diagnostics; and configurable lifetime cost
- Compact Power Rating summary with an on-demand BP breakdown
- Safe rich-text rendering for card names, rules, and flavor text using standard inline HTML tags, inline CSS, and existing Markdown
- Independent horizontal and vertical positioning controls for card names, rules text, flavor text, Construction, Operation, and Cycle, with optional same-frame propagation, plus adjustable paragraph spacing
- Artwork upload, crop positioning, frame themes, and typography controls
- Multiple named card sets and decks with descriptions, cover cards, drag ordering, project-level statistics, and balance summaries
- Self-contained public/unlisted and passphrase-encrypted private links for individual cards or complete projects, plus link import
- Standard, tall-text, extended-art, horizontal, split/Combine, flip, double-faced, composite-half, and advanced custom-layer frames
- Conditional Unit fields and shared data retention while switching compatible templates
- Visual rules-text toolbar for Tap, Resources, Assets, bold, italic, color, size, and alignment; token and HTML entry remain supported
- Local library with search, faction filtering, Shift-range selection, duplication, multi-select, reusable style presets, and card/project revision history with compare and restore
- Sticky card-library search, filter, selection, duplicate, and delete controls while scrolling through a set
- Automatic saving when opening another card, plus adjacent single-card and multi-card duplication
- CSV, TSV, XLSX, XLS, and JSON bulk import
- Individual or full-set JSON save/load
- PNG, JPEG, and SVG export at 600 or 1,200 DPI; raster exports include physical-resolution metadata for print workflows
- Self-contained multi-card PDF print sheets with Letter/A4 sizing, gutters, crop marks, orientation, and duplex back pages
- Tabletop Simulator sheets, TCG-Arena lists, printable deck-list PDFs, and a versioned MechTitan-native JSON deck format
- Local autosave in the browser; no account or server required

## Publish on GitHub Pages

1. Put these files at the root of a GitHub repository.
2. In **Settings → Pages**, choose **Deploy from a branch**.
3. Select the `main` branch and `/ (root)` folder.

The app is fully static. Spreadsheet `.xlsx` support loads SheetJS from jsDelivr; CSV, TSV, JSON, editing, sharing, PDF generation, and all other exports continue to work without it. Share links carry their project data in the URL, so artwork-heavy links can become too large for some messaging services; use a project JSON export in that case.

Print exports use a 2.5 × 3.5 inch trim plus 0.125 inch bleed on every side. This produces 1650 × 2250 pixels at 600 DPI or 3300 × 4500 pixels at 1,200 DPI. PNG exports include a `pHYs` resolution chunk and JPEG exports include JFIF density metadata.

## Card component assets

The editable renderer keeps each variable card component separate. The most important files are:

- `assets/unit-frame-v2.png` — base unit frame
- `assets/header-assets-0.svg` through `assets/header-assets-5.svg` — responsive Asset Cost/header frame variants
- `assets/construction-ring.svg` and `assets/operation-disc.svg` — top-left costs
- `assets/asset-cost-pill.svg` — Logistics, Politics, Strategics, Tactics, and Support costs
- `assets/cycle-reference-ring.png` and `assets/cycle-ring.svg` — Cycle symbol
- `assets/tap-icon.svg` — Tap/activation symbol used in rules text

## Inline rules symbols

Rules text supports compact game symbols alongside Markdown:

- `{t}` — Tap symbol
- `{L}`, `{P}`, `{S}`, `{T}`, `{U}` — the matching colored Asset pill, with no number
- `{1, L}` through `{5, U}` — a numbered Asset-cost pill matching the card's main Asset Costs, at inline-text size
- `{0}` through `{20}` — Resource-cost symbol

Asset letters are case-sensitive so `{T}` means the Tactics Asset, while lowercase `{t}` means Tap.

Inline Asset symbols use the same embossed capsule design as Asset Cost pills. Letter-only symbols are filled completely with the Asset color; numbered symbols use the same pale value field and colored letter field as the main Asset Costs. Editor Asset values range from 1 to 5.
- `assets/speed-xs.svg` through `assets/speed-xf.svg` — the five moving Speed indicators
- `assets/stat-housing-left.svg` and `assets/stat-housing-right.svg` — frame-integrated bottom stat housings
- `assets/attack-pill.svg` and `assets/defense-pill.svg` — inset combat-stat gauges
- `assets/rarity-bolt-v2.png` — silver bolt-head rarity dots

## Spreadsheet columns

Use `mechtitan-card-template.csv` as the starting point. Supported columns include:

`name`, `cardKind`, `template`, `construction`, `operation`, `assetL`, `assetP`, `assetS`, `assetT`, `assetU`, `loadout`, `traits`, `rules`, `rulesAlign`, `paragraphSpacing`, `flavor`, `speed`, `attack`, `armor`, `structure`, `cycle`, `staticKeywordBP`, `staticAbilityBP`, `operationalKeywordBP`, `operationalAbilityBP`, `battlefieldProjection`, `expectedOperations`, `rarity`, `faction`, `artist`, `setCode`, `collector`, `theme`, `nameX`, `nameY`, `rulesX`, `rulesY`, `flavorX`, `flavorY`, `constructionX`, `constructionY`, `operationX`, `operationY`, `cycleX`, `cycleY`, `secondaryName`, `secondaryTraits`, `secondaryRules`, `secondaryFlavor`, `combineEnabled`, and `compositePairId`.

Card names, rules, and flavor text accept standard inline HTML elements and inline CSS. Text-focused styles such as color, background color, font size, font family, font weight, font style, text decoration, and letter spacing are rendered on the card. Scripts, forms, and embedded media are ignored.

## Unit balance model

The editor uses the current three-part Unit model:

- Static Power = `1.5 × Armor + 0.4 × Structure + static keywords + static abilities`
- Operational Power = `Attack + Speed + operational keywords + operational abilities`; only this subtotal receives the Operation multiplier
- Economic Power = `0 / 0.5 / 1 / 1.5` for Cycle None / 1 / 2 / 3
- Asset accessibility = `−min(1.5, total Asset requirement × 0.15 + additional Asset types × 0.25)`
- Total Power = Static Power + adjusted Operational Power + Economic Power + Asset accessibility
- Suggested Construction = `ceil((Total Power - 2) / 2)`
- Lifetime cost = actual Construction + Operation × expected uses

Battlefield Projection and economy warnings are diagnostics only. Rarity and Asset requirements remain outside the numeric Total Power formula.

For the standard Type/Subtype presentation, enter the most specific affiliation first and the broad card type last—for example `Wolf • Clan • Artillery • Mech`. The renderer places rarity first, producing `Uncommon • Wolf • Clan • Artillery • Mech`.

Speed contributes `−1 / −0.5 / 0 / +0.5 / +1` for XS / S / M / F / XF. Operation multipliers are `1.35 / 1.15 / 1 / 0.88 / 0.78 / 0.70` for Operation 0–5. The editor reports cost variance as actual Construction minus suggested Construction, using the attached model's aggressive, baseline, conservative, and below-baseline testing flags.
