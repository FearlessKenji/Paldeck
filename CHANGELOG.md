# Changelog

Notable changes to Paldeck are documented here.

## Unreleased

## v1.9.0 - 2026-08-02

- Derived Sunreach and World Tree treasure-chest Sources and map panels from each item's verified loot pools, correcting 67 incomplete item presentations and preventing future regional-chest omissions without duplicating per-item data.
- Assigned deterministic filenames to derived regional-chest map layouts and added collision validation so one item's generated panels cannot overwrite an unrelated shared map.
- Normalized 8,532 item loot associations into a readable pool-indexed catalog inside `itemData.json`, preserving resolved card behavior while avoiding tens of thousands of repeated object lines and unstable acquisition-preset churn.

- Audited Pal habitat maps against the current game-derived distribution and fixed-encounter tables, restricted fixed pins to Alpha Pal encounters, and added a repeatable Pal location audit that excludes caged and incident Pal sources.

- Added game-derived loot-pool synchronization and validation for every obtainable item association, excluding zero-percent and test pools while preserving curated map-density decisions, and removed an invalid Desert elemental-chest source from Training Manual (M).
- Corrected Ancient Sphere acquisition mapping to include all 76 eligible Sunreach and 38 World Tree treasure chests alongside its World Tree fishing and junk sources, backed by the World Tree treasure-spawner asset and a reusable fixed-location set.
- Added 64 individually searchable journal collectible cards with their corresponding PNG artwork and single-location maps, plus Palpagos Journals and World Tree Journals collection cards, validation, a reproducible journal sync script, updater preservation for locally curated records, and exact installed-game note-texture asset provenance for every thumbnail.

## v1.8.0 - 2026-08-01

- Condensed the 1.8.0 user-facing patch notes to net shipped behavior and removed transient-development details.
- Regenerated Lunaris, Relaxaurus, and Yakumo Effigy maps with standard-size iridescent-pink markers derived from their shared statue palette, and changed Herbil Effigy markers from green to amber to match its statue.
- Removed the redundant `Effigy Locations` source-type label from Effigy item cards while retaining their per-map location totals.
- Hid 16 additional unavailable, superseded, WIP, or unresolved item definitions from lookup; centralized update-aware visibility rules now fail validation when a hidden item gains finished acquisition data or a hidden Pal placeholder gains released Pal metadata.
- Replaced all Python map generation, shared rendering, preset, and PNG optimization utilities with JavaScript and Sharp; added npm commands for item maps, slab maps, map optimization, and item-data compaction so repository tooling uses one runtime.
- Added isolated output/data overrides and focused map selection to every destructive maintenance command so release checks can exercise complete rendering, optimization, and compaction paths without touching curated assets.
- Restored the item-map generator's explicit write-data pathway through the shared JavaScript resolver and compactor, preserving curated acquisition and merchant records during regeneration.
- Allowed map maintenance commands to accept positional arguments as well as named options so focused npm workflows remain reliable under Windows PowerShell and npm 10.
- Added concise module documentation to every changed JavaScript source file, with targeted comments for preset compaction, card-renderer boundaries, map legends, safe PNG replacement, deduplication ordering, and raw-reference validation.
- Interned acquisition records shared by at least two items and all fixed-merchant records as reusable presets inside `itemData.json`, while keeping unique acquisition records inline for readability; added transparent runtime and updater resolution, extracted item-card rendering from the Paldeck command, consolidated merchant-card rendering, and converted repeated card assertions to table-driven coverage.
- Replaced opaque acquisition and merchant preset hashes with deterministic IDs containing their map scope, source types, or merchant group plus a short uniqueness hash, and added validation to preserve the readable format during future regeneration.
- Centralized map fetching, coordinate conversion, marker primitives, legend behavior, and lossless PNG output in shared Python utilities; added a repeatable PNG optimizer and replaced four byte-identical item maps with shared assets without introducing WebP output.
- Restricted recipe imports to actual Production and Crafting Materials tables so Medal Merchant and other exchange rows no longer appear as reversed recipes on Dog Coin, Battle Ticket, or Successful Bounty Token. Dog Coin now has a public `Medal Merchants` button showing all four fixed merchants and their map, and other merchant-location responses are public as well.
- Re-evaluated every item against verified regional loot pools: all standard Pal Spheres and other eligible items now receive readable maps, Junk is included below the density limit with high-contrast magenta markers, Supply Drops and Salvage remain textual sources, dense regional chest pools use compact brown or gold markers, and resource clusters again use larger bordered markers.
- Normalized pipe-delimited Key Sphere and legendary headwear schematic descriptions, hid Silicon and other records with placeholder localization text, and added updater and validator safeguards for both cases.
- Prevented expired Discord interactions from triggering recursive error replies and ignored expected 10062 errors from superseded autocomplete requests; item and Paldeck commands continue using immediate responses so hosting delays remain visible without deferred reply behavior.
- Standardized item cards on fixed summary rows, one `Sources` field for every acquisition record, merged acquisition notes, and complete alternate-recipe rendering; unlocalized records without descriptions are now hidden from lookup.
- Added isolated test workflows using the dedicated `testTOKEN` and `testID`: `deploy:test` registers the complete command set to the configured test guild by default and still accepts command names for focused deployments, while `start:test` starts the test bot without redeploying commands.
- Expanded item-card maps with 11 fixed resource types, larger bordered resource-cluster pins, individually colored location-based Effigies, 33 fixed bounty targets, all 8 one-time Key Sphere tower rewards, 89 pool-verified Skill Fruit records, 48 verified World Tree fishing/junk rewards, and all 486 verified regional loot-pool records. Ordinary locations use the established red Pal-location pins and single-marker maps omit redundant legends. Normal eggs, Mimog Effigies, generic Pal/boss drops, loose ground-item spawns, and unverifiable locations remain intentionally unmapped.
- Simplified item acquisition field names by removing the repeated `Source` prefix and em dash, and removed redundant `Fixed` wording from location and resource headings.
- Condensed items with multiple regional loot sources into a single `Sources` field using player-facing names such as Junk, Salvage, and Elemental Chests; legends identify whichever verified regional source types are actually mapped.
- Distinguished regional chest maps with brown regular Treasure Chest pins and gold Elemental Chest pins.
- Distinguished common and Rare Fishing Spots with blue and brighter cyan pins, moved legends to the bottom-right of World Tree maps, and standardized every multi-source item on one `Sources` field while preserving detailed source entries where applicable.
- Added owner-only Merchant Locations buttons to 92 fixed-merchant item records (76 distinct names); the private response names applicable merchants and attaches a pool-filtered map, while base-visitor-only merchants do not receive fabricated pins.
- Added item-card acquisition maps for all 30 possible Ominous Egg spawns, 106 individually matched Ancient Ruin schematics, 42 Treasure Map destinations, 22 Kinship Peach locations, and 10 nodes each for Ancient Bone, Ancient Bark, and Ancient Lava, plus standalone Palpagos and World Tree journal maps.
- Derived each crafted item's minimum compatible production station from its item type and internal recipe rank, including Ancient Workbench, Ancient Furnace, and Ancient Kitchen recipes, and added only that result to item embeds under a Workbench field; non-recipe producers such as Ancient Farm and Ancient Relic Recycler remain acquisition sources rather than workbenches.
- Embedded structured acquisition data directly into all 14 obtainable slab and slab-fragment item records, including Raid Boss, dungeon chest, expedition, enemy-camp, and Pal Critic sources; crafting remains represented exclusively by item recipes, and four unused Ultra fragment definitions are hidden from item lookup.
- Added reproducible acquisition maps with coordinate-correct red ancient-ruin/fixed-chest pins and orange eligible-dungeon entrance pins, and updated item cards to attach these maps as full-width images while retaining the item icon thumbnail.
- Extended item-data validation and rendered-card smoke coverage to require embedded slab acquisition records, valid local map assets, source rendering, dual image attachments, and exclusion of unused Ultra fragment definitions.
- Restricted globally deployed commands to guild installation and guild context so Discord does not expose Paldeck commands in unsupported DM or user-install contexts.

## v1.7.1 - 2026-07-29

- Grouped Pal card loot under Normal, Alpha, World Tree, Story Boss, Rampaging, and level-specific Summoning Altar headings, with quantities and colon-separated drop chances; Alpha sections include inherited normal loot, exact Ancient Relic tiers remain visible when probabilities differ, and five Raid Pal lookups now show complete base and Ultra Summoning Altar reward tables with guaranteed eggs.
- Renamed and formally validated the encounter-specific Pal data source, and expanded rendered-card coverage across all five Raid Pal lookups.
- Updated the project version to `1.7.1`.
- Fixed comma-separated `/paldeck search` suitability autocomplete labels so selecting another suitability retains the full combined list in Discord's command field.
- Added owner-only `/dm-forward` guild commands and direct-message event handling that forwards exact DM text, attachments, sender identity, and stored owned-server context to a configured private channel.
- Added persistent bot setting storage for the DM forwarding destination and enabled direct-message gateway events with partial DM channels.
- Updated the privacy policy and command documentation for direct-message forwarding, and removed the obsolete `/vote` entry from the README.
- Added permission-specific `/updates channel` warnings and once-per-configuration owner DMs when patch notes cannot reach a configured channel, backed by persisted warning state and a schema migration.
- Changed `/help` to describe `/item` as looking up one item by name.
- Removed `Part X/Y` suffixes from split patch-note announcements and standardized their Discord release heading.

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
