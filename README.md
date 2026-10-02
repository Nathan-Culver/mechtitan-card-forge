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
- Artwork upload, crop positioning, frame themes, and typography controls
- Local set library with search, faction filtering, duplication, and multi-select
- CSV, TSV, XLSX, XLS, and JSON bulk import
- Individual or full-set JSON save/load
- PNG, JPEG, and SVG export at 600 or 1,200 DPI; raster exports include physical-resolution metadata for print workflows
- Local autosave in the browser; no account or server required

## Publish on GitHub Pages

1. Put these files at the root of a GitHub repository.
2. In **Settings → Pages**, choose **Deploy from a branch**.
3. Select the `main` branch and `/ (root)` folder.

The app is fully static. Spreadsheet `.xlsx` support loads SheetJS from jsDelivr; CSV, TSV, JSON, editing, and export continue to work without it.

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
- `{0}` through `{20}` — Resource-cost symbol

Asset letters are case-sensitive so `{T}` means the Tactics Asset, while lowercase `{t}` means Tap.
- `assets/speed-xs.svg` through `assets/speed-xf.svg` — the five moving Speed indicators
- `assets/stat-housing-left.svg` and `assets/stat-housing-right.svg` — frame-integrated bottom stat housings
- `assets/attack-pill.svg` and `assets/defense-pill.svg` — inset combat-stat gauges
- `assets/rarity-bolt-v2.png` — silver bolt-head rarity dots

## Spreadsheet columns

Use `mechtitan-card-template.csv` as the starting point. Supported columns include:

`name`, `construction`, `operation`, `assetL`, `assetP`, `assetS`, `assetT`, `assetU`, `loadout`, `traits`, `rules`, `flavor`, `speed`, `attack`, `armor`, `structure`, `cycle`, `staticKeywordBP`, `staticAbilityBP`, `operationalKeywordBP`, `operationalAbilityBP`, `battlefieldProjection`, `expectedOperations`, `rarity`, `faction`, `artist`, `setCode`, `collector`, and `theme`.

## Unit balance model

The editor uses the current three-part Unit model:

- Static Power = `1.5 × Armor + 0.4 × Structure + static keywords + static abilities`
- Operational Power = `Attack + Speed + operational keywords + operational abilities`; only this subtotal receives the Operation multiplier
- Economic Power = `0 / 0.5 / 1 / 1.5` for Cycle None / 1 / 2 / 3
- Total Power = Static Power + adjusted Operational Power + Economic Power
- Suggested Construction = `ceil((Total Power - 2) / 2)`
- Lifetime cost = actual Construction + Operation × expected uses

Battlefield Projection and economy warnings are diagnostics only. Rarity and Asset requirements remain outside the numeric Total Power formula.

Speed contributes `−1 / −0.5 / 0 / +0.5 / +1` for XS / S / M / F / XF. Operation multipliers are `1.35 / 1.15 / 1 / 0.88 / 0.78 / 0.70` for Operation 0–5. The editor reports cost variance as actual Construction minus suggested Construction, using the attached model's aggressive, baseline, conservative, and below-baseline testing flags.
