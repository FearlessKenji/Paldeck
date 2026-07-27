# Changelog

Notable changes to Paldeck are documented here.

## Unreleased

## v1.7.0 - 2026-07-27

- Initialized and cleaned up smoke-test search storage so search-backed interaction tests pass in fresh CI checkouts.

- Removed the unused `/vote` command and its Top.gg voting link.
- Updated `tar`, ESLint, and the ESLint JavaScript configuration package to patched releases so the dependency audit passes.
- Added the Ko-fi page and `/suggest` command to the `/help` embed's support section.
- Replaced the plain-text `/help` response with a structured gold embed.
- Added owner-bound `Back to Pal` navigation throughout item panels originating from `/paldeck name`, and expanded `/help` with Pal, item, drop-navigation, search, and breeding guidance.
- Suppressed item Effect fields when their content duplicates the item description.
- Kept user-facing patch notes focused on visible bot behavior, removed development and storage details, and described unreleased `/item` functionality as a new feature rather than an already-live change.
- Added category-aware item details: ranged weapons now show their Ammo Type and magazine size, while medicines and accessories show a dedicated Effect field instead of generic stats.
- Added structured PalDB item properties to `itemData.json` for weapon classes, magazine sizes, passive effects, and item-type-aware embed rendering.
- Item autocomplete now also honors the game's `bLegalInGame` flag when excluding unfinished items.
- Updated the project version to `1.7.0`.

### Added

- Added applicable combat/equipment stats and direct crafting-material requirements to item embeds.
- Added a focused `deploy:test -- <command...>` workflow that registers selected global commands as temporary guild commands alongside the normal guild command set.
- Added `/item` autocomplete lookups with public item cards and owner-bound `View Dropping Pals` results that reuse Paldeck search pagination.
- Added an owner-bound `Look Up Drops` button and searchable drop menu to individual Pal results; selected items are posted publicly as local-icon embeds.
- Enriched `itemData.json` with structured item stats and per-Pal drop quantities and probabilities from item detail pages.
- Added detail-only item update commands so the established item catalog can be enriched independently of upstream category-page changes.

### Changed

- Excluded `[WIP]` item records from `/item` autocomplete and direct lookup until their upstream descriptions are finalized.
- Aligned item embed fields in a stable three-column grid, with Category, Weight, and Maximum Stack above Buy and Sell Price.
- Simplified `/item` autocomplete to plain, unique item names and added an optional rarity choice that falls back to the basic item when unavailable.
- Removed stored PalDB URLs from item and source records; updater-only item locations now use non-link relative `detailPath` values.
- Normalized item drop sources to canonical Pal names with separate encounter `variant` and `level` metadata, omitting decorative Alpha titles.
- Added reusable string-select interaction routing and validation alongside existing command button handlers.
- Item detail lookups omit PalDB links and internal game codes while showing rarity, category, available stats, and Pal-specific drop information.

### Fixed

- Restored practical comma-separated `/paldeck search` suitability filtering by preserving completed filters during autocomplete and documenting that all listed suitabilities must match.
- Added a breeding-parent button to individual `/paldeck` results and removed the unrelated breeding-calculator link from Rarity.
- Updated `/breed` result embeds, parent-pair lists, and partner lists to show plain Pal names without Paldeck number prefixes.
- Removed breeding method and rank details from visible `/breed` result output.

## v1.6.0 - 2026-07-21

### Changed

- Added missing Ancient Civilization Core drops for raid and summoning Pal entries.
- Moved `/breed` autocomplete and breeding formula data to the shared Paldeck Pal data so breeding commands and search commands use the same Pal source.
- Replaced the exhaustive breeding `PairResults` cache with formula-based results and compact local game-file `DT_PalCombiUnique` rows.
- Omitted redundant same-species `DT_PalCombiUnique` rows so `UniqueCombinations` only contains rows that change normal breeding behavior.
- Removed the informational `FormulaMetadata` block from `palBreeding.json`.
- Removed empty `UnmappedGameUniqueCombinationRows` and `SourceOverrides` arrays from `palBreeding.json`.
- Added hidden `palData` placeholders for internal-only breeding IDs from the local game files so fixed-combination source rows stay mapped without exposing those IDs in search.
- Updated standard breeding child flags and Astralym's rank metadata so `/breed` no longer needs Astralym source overrides.
- Updated vulnerable transitive dependencies so `npm audit --audit-level=moderate` passes.
- Hardened PalDB HTML text extraction helpers so decoded tags cannot survive scraper normalization.
- Updated the project version to `1.6.0`.

### Fixed

- Removed trailing `Technology N` unlock labels from Pal partner skill descriptions and added validation to keep unlock metadata in the separate Tech field.
- Fixed several typo, wording, and import artifacts in Pal descriptions and partner skill text.
- Trimmed unreleased patch notes to user-facing changes only.
- Updated Selyne's spawn text to retain World Tree day/night timing while noting its Sakurajima meteorite-event availability.
- Updated fixed-location Alpha Pal spawn text so alpha-only entries no longer appear as normal day/night spawns.
- Added gender-specific Katress/Wixen breeding outcomes for Katress Ignis and Wixen Noct.
- Updated `/breed` autocomplete labels to show plain Pal names instead of number-prefixed labels.

## v1.5.0 - 2026-07-18

### Added

- Added a `/paldeck search` farmable material filter with autocomplete for Ranch-produced items.
- Added smoke coverage for `/paldeck search` farmable autocomplete choices.

### Changed

- Updated Pal farmable, food, and rarity values against current game data.
- Expanded Pal descriptions with full Paldeck entry text where available.
- Filled additional Pal descriptions where available, with current game summary fallbacks for Pals that still lack full entries.
- Updated Pal partner skill names and descriptions against current game data.
- Updated Pal drops and spawn times against current game data, including resolved drops for newly added Pals.
- Replaced all remaining unknown Pal thumbnails with local PNG files, including Shaolong.
- Added structured World Tree drop data and separated those conditional drops in Paldeck embeds.
- Filled remaining unknown Paldeck title prefixes from local Palworld text data.
- Replaced the final Panthalus and Astralym `Unknown. Too new.` placeholders with current game values.
- Added `None` as a searchable element value for typeless Paldeck entries.
- Updated Necromus to reuse Paladius's habitat map because their alpha encounter is paired.
- Updated the project version to `1.5.0`.

### Fixed

- Updated smoke coverage to validate the latest patch-note release against `package.json` instead of a hardcoded version.

## v1.4.0 - 2026-07-16

### Added

- Added Paldeck Updates subscriptions through `/updates channel`, `/updates clear`, and `/updates send-latest`.
- Added owner-only `/announce patch-notes` broadcasts for servers that subscribed to Paldeck Updates.
- Added user-facing patch notes in `docs/patch-notes.md`.
- Added CI coverage for lint, smoke tests, and dependency audits.
- Added a GitHub Pages theme and homepage links for the changelog and patch notes.
- Added automatic GitHub tag and release creation when `package.json` version changes on `main`.
- Added `data/itemData.json` with current item metadata for 2,443 item records.
- Added local PNG item icons in `data/items` and updated item data to avoid remote CDN icon dependencies.
- Added item update and validation tooling through `update:palworld-items`, `update:palworld-items:write`, and `validate:item-data`.

### Changed

- Updated Pal Gear tech names and unlock levels against current game data.
- Updated Pal drop and farmable item text to current item names, including `Pal Fluids` to `Aquatic Pal Fluids`.
- Updated item icon generation so future item refreshes save PNG files directly.

### Fixed

- Removed stale Pal Gear tech entries that no longer exist in the current technology list, such as Celaray gloves.
- Fixed stale or misspelled item names in Pal drops, including Katress Hair, Medium Pal Soul, High Quality Pal Oil, and Carrot Seeds.
- Fixed item data validation to reject remote, missing, or non-PNG icon paths.

## v1.3.0 - 2026-07-13

### Changed

- Updated the project version to `1.3.0`.
