# Paldeck v1.2.0

Released: 2026-07-10

## Highlights

- Updated Paldeck data for the Palworld 1.0 roster refresh.
- Added 73 newly discovered Pals to `palData.json` with safe placeholder profile fields.
- Added exact breeding pair results for all 299 current breeding Pals.
- Added repeatable PalDB audit/update tooling for future Palworld data changes.

## Paldeck Data

- Expanded `palData.json` from 226 to 299 Pals.
- Filled missing new-Pal profile fields with `Unknown. Too new.`.
- Filled missing food values with `Unknown/10`.
- Added `rarity: 0` for new placeholder entries and display it as `Unknown`.
- Reordered `palData.json` by Pal number, with unknown-number entries kept at the end.
- Made the top-level `Colors` palette the source of truth for embed colors instead of per-Pal `color` fields.
- Added missing palette entries for new element combinations and unknown elements.
- Added local unknown thumbnail fallback at `data/pals/pal-unknown.png`.
- Localized Ophydia's available Fandom thumbnail at `data/pals/pal-175-ophydia.png`.

## Breeding

- Expanded `palBreeding.json` to 299 current breeding Pals.
- Added 44,850 generated `PairResults` from PalDB child-result data.
- Updated `/breed` to prefer exact known pair results over stale rank-based fallback logic.
- Adjusted `/breed` output so exact pair-cache results do not display old rank explanations.

## Commands

- `/paldeck` now treats rarity `0` as `Unknown`.
- `/paldeck search` now supports `Unknown` as a rarity filter.

## Tooling

- Added read-only Palworld data audits:
  - `npm run audit:palworld-data`
  - `npm run audit:palworld-breeding-results`
- Added PalDB-backed update scripts:
  - `npm run update:palworld-data`
  - `npm run update:palworld-breeding-results`
  - `npm run add:missing-paldata`
- Update scripts default to dry-run mode; use the matching `:write` scripts to apply changes.

## Validation

- Pal data validation passes with palette-backed colors.
- Lint passes.
- PalDB audit reports no missing local Paldeck or breeding rows.
