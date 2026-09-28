# MechTitan Card Forge

A dependency-free, browser-based card editor for the MechTitan TCG. It is designed to run directly on GitHub Pages.

## Features

- Live unit-card preview inspired by the supplied prototype
- Layered, reference-matched unit frame with separate cost, cycle, stat, activation, and rarity-bolt assets
- Bolt-head rarity rail: Unique (1), Rare (2), Uncommon (3), Common (4)
- Exact 2.5 × 3.5 inch poker-card trim with 1/8 inch bleed on every edge
- Rules for every specified cost and combat stat
- Artwork upload, crop positioning, frame themes, and typography controls
- Local set library with search, faction filtering, duplication, and multi-select
- CSV, TSV, XLSX, XLS, and JSON bulk import
- Individual or full-set JSON save/load
- PNG, JPEG, and SVG export at 600 or 1,200 DPI
- Local autosave in the browser; no account or server required

## Publish on GitHub Pages

1. Put these files at the root of a GitHub repository.
2. In **Settings → Pages**, choose **Deploy from a branch**.
3. Select the `main` branch and `/ (root)` folder.

The app is fully static. Spreadsheet `.xlsx` support loads SheetJS from jsDelivr; CSV, TSV, JSON, editing, and export continue to work without it.

## Spreadsheet columns

Use `mechtitan-card-template.csv` as the starting point. Supported columns include:

`name`, `construction`, `operation`, `assetL`, `assetP`, `assetS`, `assetT`, `assetU`, `loadout`, `traits`, `rules`, `flavor`, `speed`, `attack`, `armor`, `structure`, `cycle`, `rarity`, `faction`, `artist`, `setCode`, `collector`, and `theme`.
