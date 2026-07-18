# Changelog

Notable changes to Paldeck are documented here.

## Unreleased

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
