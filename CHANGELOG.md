# Changelog

Notable changes to Paldeck are documented here.

## Unreleased

## v1.10.2 - 2026-08-16

- Updated Paldeck's package and release metadata to v1.10.2.
- Rebuilt breeding from current game tables and native rules, including gender-dependent Katress/Wixen combinations, fixed-combination precedence, extracted rank/priority/eligibility metadata, breeding-item rank bonuses, probability-sorted mutation outcomes, same-species mutation metadata, pair-specific titles, and contextual mutation navigation with return controls from every breeding-result view.
- Validated every positive Ancient Relic recycler loot row against its final catalog item and added regression coverage distinguishing relic-awarded Disposable Implant: Eternal Engine from Arena-exclusive Implant: Infinite Stamina.
- Required all local game-data extraction snapshots to be regenerated and build-ID verified whenever the installed Palworld build changes.
- Corrected Pal Partner Skill titles against the installed v1.0.3 English data while retaining grammatically corrected descriptions and a readable Astralym ability placeholder.
- Prefixed Pal names with Alpha, Rampaging, World Tree, and other recorded variants throughout View Dropping Pals results while leaving normal drops unprefixed.
- Centralized map-generation presentation and naming policy in validated JSON, consolidated the duplicate cluster style into special, and enlarged Ancient Ruin pins across affected item maps.

## v1.10.1 - 2026-08-12

- Updated Paldeck's package and release metadata to v1.10.1.

- Synchronized the item catalog, availability manifest, journal text, recipes, technology levels, item-master rank and weight fields, World Tree Holy Water drops and reward sources—including the runtime-adjusted 30 Holy Water per Teafant Spring—and Moon Lord rewards with installed Palworld v1.0.3 build 24575825; restored Dark Skill Fruit: Psycho Gravity search visibility and added focused regression coverage.
- Preserved exact loot-pool probabilities when installed-game synchronization reapplies curated acquisition maps, preventing source-chance data from being discarded during future game-data refreshes.
- Replaced the blanket patch-note update requirement with an evidence-based release audit policy that excludes intermediate, reverted, duplicate, and non-user-facing changes.
- Changed manual patch-note broadcast summaries to condense successful deliveries while retaining every skipped and failed result across Discord-safe follow-up messages.
- Replaced unsolicited update-failure owner DMs with clearly titled, permission-gated ephemeral manager reminders, limited to three per server per 24-hour window with at least 15 minutes between reminders.

## v1.10.0 - 2026-08-11

- Updated Paldeck's package and release metadata to v1.10.0.
- Distinguished non-Pal boss rewards from searchable Pal drops so Legendary Meowmere names Moon Lord directly and does not expose an empty dropping-Pal result.
- Decoded level-up move progressions for all 299 visible Pals from installed build 24467282, added repeatable synchronization and validation, and introduced owner-bound Learned Moves and breeding-result navigation back to the originating Pal card.
- Decomposed oversized item-card, breeding, synchronization, validation, and smoke-test workflows into focused modules; added repository-wide formatting and complexity checks plus maintainability guidance for readable identifiers and data structures.
- Replaced hash-derived acquisition, merchant-map, item-map, and icon identifiers with descriptive names and explicit variant suffixes; map deduplication now confirms byte equality without cryptographic hashes.
- Centralized Discord interaction dispatch and separated the administrative ban workflow into explicit user, server-owner, and guild-removal paths.
- Renamed Source Details to Source Chances, bounded probability pages, removed redundant single-page pagination labels, and omitted the unsupported inferred loot-region map.
- Centralized curated Pal habitats across map generation and audits; corrected Eidrolon to include its World Tree Alpha and Skymarch dungeon encounters and outlined single-point Ancient Ruin item markers.
- Simplified Bounty Officer and Arena Merchant location responses by removing merchant-name repetition while retaining their maps and item thumbnails.
- Restored direct `/item name:<name>` lookup, added mutually exclusive `/item source:<source>` browsing, normalized schematic rarity selection, and converted item, merchant, Pal-drop, breeding, and related-item controls to owner-bound replace-in-place navigation.
- Preserved all 8,529 decoded nonzero item-loot associations with quantities and probabilities, restored missing direct sources, and rebuilt item maps with complete legends, exact chest and Oil Rig markers, shared-map variants, and safe obsolete-asset pruning. Broad salvage, ground Ancient Relics, player-built Fishing Ponds, and ordinary Supply Drops remain intentionally unpinned.
- Removed indirect Treasure Map acquisition markers from all 245 affected reward-item maps; Treasure Map cards retain acquisition locations while reward cards map only direct physical sources.
- Added validated Normal first-clear rewards for eight Key Spheres and nine Hard-mode schematic drop associations, including exact quantities, chances, World Tree and tower maps, and standardized boss markers.
- Excluded the optional `tools/` workspace and removed the repository-owned C#/.NET decoder; installed-game refreshes now accept external decoded tables through `--tables` or `PALWORLD_TABLE_EXPORT` while retaining cached snapshot audits.

## v1.9.2 - 2026-08-04

- Updated Paldeck's package and release metadata to v1.9.2.
- Restored Effigies to `/item` lookup by routing search through the centralized availability policy instead of treating the installed table's legality flag as a blanket ordinary-item exclusion; added autocomplete regression coverage.
- Added repeatable physical-source map assignment for 67 previously unmapped items across Enemy Camps, Oil Rigs, regional dungeons, fishing spots, World Tree junk/chests, and Sakurajima chests, with exact pool-to-marker joins and shared generated maps.
- Standardized item Sources alphabetically by acquisition method, with progression order for chest, Treasure Map, and Ancient Relic tiers and descending probability only within comparable methods; standardized Pal drop tables by descending chance with alphabetical tie-breaking.
- Moved acquisition maps for every mapped item card into a titleless image-only embed sharing the card's rarity accent, while leaving Pal habitat cards unchanged.
- Added a matching inline zero-width field after Sell Price so both item-summary rows consistently occupy two visible columns plus one blank Discord field.
- Moved Pal Reverser's Enemy Camp map into a titleless image-only embed with the same rarity accent as its card, allowing the information and map embeds to size independently without changing other items.
- Added the missing Enemy Camp source map to Pal Reverser while keeping its broad salvage and Ancient Relic pathways unpinned and its merchant maps separate.
- Added calculated per-recycling quantities and probabilities to Ancient Relic Recycler sources by combining the three independently rolled reward slots decoded for each relic tier.
- Removed the low-value Maximum Stack field and retained Category, Weight, Buy Price, and Sell Price as distinct fields; an inline zero-width spacer keeps the price fields together without the excessive gap caused by a full-width spacer.
- Separated combined dungeon, regional, and Wildlife Sanctuary chest labels into player-facing pathways, using the installed Forest/Volcano/Desert mapping for No. 1/2/3 Wildlife Sanctuaries; normalized dungeon qualifiers, raid levels, Treasure Map rarities, location counts, special-shop quantities, Tower clears, and Arrogant Pal Critic sources across the full card catalog.
- Standardized qualified acquisition wording as `Source (location or subtype): probability`, including relic rewards such as `Ancient Relic Recycler (Glistening Ancient Relic)`, instead of joining qualifiers with spaces or dashes.
- Condensed regional item acquisition into one player-facing line per source method, replaced internal dungeon, Oil Rig, relic-recycler, and captured-cage pool labels with readable categories, and added full-catalog validation against exposed identifiers and duplicate source lines.

## v1.9.1 - 2026-08-04

- Consolidated repeated same-region acquisition panels before rendering, correcting all 14 shared Skill Fruit maps and preventing individual loot pools from producing stacked duplicate Palpagos or World Tree maps; multi-region maps retain one panel per physical region.
- Restored the dedicated `/journal` command with all 64 installed-game localized journal texts and changed every result to attach that journal's individual single-location map instead of a shared regional overview; the existing `/item` journal cards remain available.
- Reconciled the post-1.9.0 development data with the released 1.9.0 catalog, retaining all 2,509 item records, 64 journal cards, normalized loot pools, and released Pal location corrections while importing the more complete installed-game recipes, availability decisions, merchant inventories, acquisition sources, renderer behavior, and validation tooling.
- Normalized fixed merchant acquisition text and location responses to the player-facing `Wandering Merchant` and `Weapons Merchant` NPC types, suppressed redundant procedural merchant categories when a fixed merchant map is available, and regenerated merchant maps with distinct red and green pins and legends while preserving exact internal shop IDs.
- Updated Discord.js to 14.27.0 and pinned patched transitive releases of Undici 6.28.0 and brace-expansion 5.0.9, resolving the current moderate and high npm security advisories without a breaking Discord.js major upgrade.
- Decoded all current Medal, Bounty, Arena, Caravan, Dungeon, and wandering shop inventories from installed build 24467282; added exact special-currency costs, fixed-location maps for Medal Merchants, Bounty Officers, and the Arena Merchant, procedural merchant labels without invented pins, and validation that excludes test/vagrant inventories and internal table identifiers. Verified all 136 meaningful local unique breeding combinations against the installed game's 258-row table (the other 122 rows are redundant same-species pairs) and found no mismatch; a 44,255-pair PalDB comparison likewise found no resolved conflict.
- Restored compact Lamball-scale dots for ordinary Pal and item map markers while retaining emphasized Alpha and event symbols.
- Expanded installed-game extraction to decode treasure-box Blueprint defaults needed to audit key requirements against reward pools.
- Standardized map symbol sizes at 3 px for ordinary pins, 4 px for diamonds, and 5 px for emphasized Alpha, rare, boss, and special pins; added distinct Grade 1–6 chest colors.
- Increased the outline contrast of compact diamond markers so event and dungeon pins remain visible on full-world maps.
- Restricted Supply Incident/meteorite pins to Xenovader, Xenogard, and Selyne, using each Pal's game-backed eligible regional pools; shortened chest legends by removing internal grade numbers.
- Added bounded Windows PNG-write retries so full map regeneration can tolerate brief locks from local card hosting and image readers.
- Made full item-map regeneration defer and retry isolated write failures, with resumable `--from` support for interrupted batches.
- Joined item lottery `TreasureBoxGrade` values into treasure map filters so regenerated item maps use the correct chest-tier colors.
- Extended chest-tier joins to legacy `Spawn`-based marker filters used by Treasure Maps, Musket Schematic 3, and raid-slab fragments.
- Added explicit physical-marker aliases for Sakurajima, Feybreak, and Sky Island chest pools while retaining their exact installed-game lottery field IDs as map metadata.
- Replaced generic Treasure Chest source summaries with deduplicated chest-type names while leaving regional eligibility to the maps and retaining exact game lottery field IDs only as internal audit metadata; removed unmatched Treasure data from game-disabled duplicates.
- Standardized all Pal and item map legends, marker colors, shapes, and standard pin sizes through the shared renderer; regenerated the full map catalog with distinct Alpha, Meteorite Event, dungeon, chest, Oil Rig, fishing, Junk, Treasure Map, and resource-cluster presentation.
- Decoded all five installed-game Treasure Map reward pools, calculated slot-and-weight-adjusted drop probabilities, and attached gold Treasure Map source maps to all 245 corresponding item records.
- Hardened Pal map regeneration so fixed and scripted encounter maps absent from the ordinary habitat table are preserved instead of being reset to the unknown placeholder.
- Labeled Silvance and Dandilord as `Alpha Only` in Pal availability footers.
- Replaced the implementation-specific `Captured Cage` wording with the broader player-facing `Factions` label in Pal availability records and audits.
- Corrected Panthalus and Terraria pins to their named current map markers, moved Astralym to the World Tree tower map, added region markers to the dynamic Xenovader/Xenogard Meteor Event maps, standardized curated Pal pins on red, shortened special-encounter footer labels, and regenerated all mixed-type Pal maps with legends while excluding out-of-bounds blank map panels.
- Added a shared Sealed Realm of Terraria map at `(-422, -796)` for all eleven Terraria Pals, dungeon-entrance maps for Mau and Katress Ignis, and row-aware dungeon classification so dungeon pools are no longer mislabeled as generic wild spawns. Every visible non-summoned Pal now has a specific availability map.
- Added game-table-driven Pal availability classification for wild spawners, Meteor Events, captured cages, fishing, fishing ponds, dungeons, raids, and breeding-only records, with curated scripted-encounter classifications where placement lives outside ordinary DataTables.
- Corrected Xenovader and Xenogard as random Meteor Event encounters (Xenogard is Alpha in every decoded event row; Xenovader has normal and Alpha variants and also appears in Captured Cages), identified Silvance and Dandilord as World Tree Alphas, and added availability maps for both meteor encounters, both World Tree roots, Panthalus's NPC encounter, and the Zenara & Astralym tower entry.
- Systemically decoded raid-success item rewards and restored Summoning Altar sources, levels, quantities, and probabilities for seven special rewards, including the Moon Lord Statue Schematic.
- Expanded installed-game extraction from 13 curated aliases to automatic mounted-archive discovery, decoding 904 DataTables and 418,792 structured rows from build 24467282 with asset-path provenance, coverage/failure metadata, stable audit compatibility, and a read-only table/row search CLI.
- Combined schematic ingredients and station context under `Schematic Recipe (Drafting Table)`, hid all game-disabled schematic definitions, decoded installed item-lottery/shop and all five Ancient Relic recycler source families, removed the final Supply Drop map pins, and added curated Junk/chest maps for Gold Coin, Medical Supplies, Training Manual (L), and High Quality Bait while leaving broad salvage pools textual.
- Preserved complete Logging, Mining, and Pal-specific perk labels when separating item effects from descriptions, and repaired six confirmed English localization grammar errors at render time.
- Simplified acquisition-card wording to broad `Enemy Camps` and natural dungeon names, and expanded the Bellanoir, Bellanoir Libero, Blazamut Ryu, Xenolord, and Hartalis slab-fragment maps with game-backed camp and dungeon pins.
- Moved technology requirements into a dedicated `Tech Level` card field, exposed multi-craft output quantities, and rendered acquisition categories as concise inline source entries.
- Replaced schematic Treasure Map destination pins with the game-backed chest and enemy-camp sources for Treasure Map 4, pluralized the shared Oil Rigs legend, and retained legends on single-source maps.
- Expanded Musket Schematic 3's map to include its game-backed Grass supply-drop and Forest/Grass treasure-chest pools alongside the fixed Ancient Ruin.
- Corrected the Legendary Treasure Map's acquisition record and added 136 coordinate-backed pins across its sea bases, enemy camps, Dark/Sky Island chests, and Feybreak Caverns matching `TreasureMap05` loot pools; Rank 2 salvage remains textual.
- Replaced the shared destination map on Treasure Maps 1-4 with tier-specific acquisition maps containing 36 Common, 116 Uncommon, 201 Rare, and 194 Epic coordinate-backed sources, and propagated the complete Epic source set to Grenade Launcher Schematics 2-4.
- Added 233 eligible Grasslands/Forest/Desert/Volcano natural fishing spots to the Beginner Fishing Rod (Gumoss) Schematic map, treating common and rare nodes as one source class; buildable Fishing Ponds and salvage remain textual.
- Synchronized all catalog recipe rows and `bLegalInGame` flags with installed build 24467282, attached canonical ingredient codes to disambiguate duplicate localized names such as Gunpowder, removed 16 merchant claims absent from every decoded game shop group, retained reviewed visibility independently from the non-authoritative legal flag, and recorded the two malformed `None` material slots without displaying them.
- Added a build-gated installed-game item synchronizer with dry-run and explicit write modes so future recipe, legality, and unsupported merchant corrections can be reproduced from cached decoded tables.
- Added a repeatable, read-only installed-game audit that resolves current mounted asset paths; decodes build-keyed item, recipe, legality, Pal-drop, raid-reward, lottery, pickup, technology, shop, and map-object tables with a pinned CUE4Parse helper; separates fixed shop product groups, weighted shop-stock lotteries, and currency settings; joins internal identities case-insensitively while separately reporting local canonical-ID drift and inconsistent casing between game tables; compares recipes and legal flags; inventories acquisition evidence; caches snapshots outside the repository; and reports unsupported semantic coverage explicitly.
- Consolidated identically styled level-specific Oil Rig markers into a single `Oil Rig` item-map legend entry while retaining their separate location filters.
- Hardened live PalDB audits by resolving cached item-card identities without confusing nested recipe ingredients for catalog entries, preserving stable IDs across upstream code-casing differences, and separating blank upstream Pal fields into non-destructive coverage-gap reporting.
- Restored complete current loot sources for all four Grenade Launcher schematic tiers and the Beginner Fishing Rod (Gumoss) schematic, mapped their fixed enemy-camp, Oil Rig, and Treasure Map locations, and kept Supply Drop, Salvage, mission, fishing-pool, and player-built pond sources explicitly pin-free.
- Added a versioned item-availability manifest with game-build provenance, reviewed evidence exceptions, CI-safe catalog validation, and a local Steam-build audit that forces re-review after Palworld updates.
- Hid all 17 correctly localized but unimplemented legacy legendary-headwear blueprint definitions, including `Blueprint of Capppen Hat 5`, from public item lookup and protected those visibility decisions across catalog refreshes.
- Standardized every game-backed schematic combination recipe on the Drafting Table, inferred missing five-copy lower-tier recipes only for schematic families present in build 24467282, excluded equipment-upgrade rows that PalDB mixes into schematic production tables, and disclosed missing non-crafting acquisition coverage without labeling those schematics unobtainable.
- Normalized catalog-wide description punctuation, possessives, split plurals, and equipment-effect layout at both import and render time, with full searchable-catalog regression coverage.
- Moved recognized equipment bonuses such as resistances, carrying capacity, attack, defense, health, yield, and experience modifiers out of descriptions into a dedicated item-card `Perks` field.
- Restored game-declared workbench fields on schematic-unlocked equipment cards even when PalDB omits that equipment tier's recipe materials.

## v1.9.0 - 2026-08-02

- Omitted inventory-only Weight, Maximum Stack, Buy Price, Sell Price, spacer fields, and the redundant Locations source label from journal collectible cards, with rendered-card coverage for every individual and regional journal lookup.
- Corrected the shared game-coordinate transform for all 38 World Tree treasure chests and added bounds validation so treasure pins cannot drift into the map margin across item cards.
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
