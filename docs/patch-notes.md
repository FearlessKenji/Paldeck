# Paldeck Patch Notes

These notes are written for server owners and moderators. They include changes
that affect setup, day-to-day use, or visible bot behavior. For the full
developer history, see [CHANGELOG.md](https://github.com/FearlessKenji/Paldeck/blob/main/CHANGELOG.md).

## v1.9.1 - Unreleased

- Skill Fruit cards no longer stack several copies of the same regional map. All eligible tree pins now appear together on one Palpagos panel, with a separate World Tree panel only when applicable.
- `/journal` is available again for reading all 64 journals and notes, and each result now shows the selected journal's exact individual location map instead of the regional all-journals map.
- Merged all post-1.9.0 item, Pal, merchant, recipe, source, and map improvements into the next 1.9.1 update without removing the journal cards and expanded loot data already released in 1.9.0.
- Fixed merchant item cards now use the general NPC types **Wandering Merchant** and **Weapons Merchant** instead of settlement-specific names. Their maps retain every applicable location and distinguish the two merchant types with red and green pins, while redundant Caravan and Dungeon Merchant source lines are omitted when a fixed merchant map is available.
- Updated Discord and networking dependencies to patched releases, clearing the currently reported npm security vulnerabilities.
- Item cards now list Medal Merchants, Bounty Shops, the Arena Merchant, Caravan Merchants, Dungeon Merchants, and wandering merchants when the installed game actually sells the item. Special shops show their real currency costs, fixed merchants have location maps, randomized merchants do not receive misleading pins, and internal/test shop names remain hidden. Paldeck's meaningful unique breeding combinations also match the installed game data.
- Ordinary map pins now use the smaller Lamball-sized dots, making clustered habitats and item-source maps easier to read.
- Game-data audits can now inspect treasure-chest key requirements in addition to their reward tables.
- Map previews now use 3 px standard pins, 4 px diamonds, and 5 px emphasized pins. Treasure chests have distinct colors for all six chest grades.
- Compact dungeon and event diamonds now have a stronger white outline for visibility.
- Only Xenovader, Xenogard, and Selyne maps show supply-drop/meteorite locations. Chest legends now use concise names such as **Purple Chests** and **Silver Chests**.
- Full map refreshes now recover from brief Windows image-file locks instead of leaving a partially regenerated catalog.
- Treasure-chest item maps now color their locations by the actual eligible chest tier recorded in the game loot tables.
- Item Sources now show only each required chest type, such as **Purple Chests**. The attached map communicates eligible regions without exposing internal game identifiers.
- Every map now follows one consistent legend and pin-size system. Pal maps distinguish day/night, Alphas, Meteorite Events, dungeons, and the Sealed Realm of Terraria; item maps consistently distinguish ruins, camps, chests, Oil Rigs, fishing, Treasure Maps, Junk, and resource clusters.
- Items available from Common through Legendary Treasure Maps now list their per-opening drop chances and show where the corresponding Treasure Maps can be obtained. The old `Treasure Map 4 Sources` wording has been replaced with player-facing Treasure Map rarity information.
- Silvance and Dandilord now show `Alpha Only` on their Pal cards.
- Pal spawn footers now use **Factions** instead of **Captured Cage**.
- Special Pal cards now use short, consistent spawn footers and corrected red map pins. Panthalus and the Terraria realm use their actual named markers, Astralym uses the World Tree map, Meteor Event maps show eligible regions, and maps with multiple pin types now include legends.
- All non-summoned Pals now have availability maps. The eleven Terraria Pals share the Sealed Realm entrance at `(-422, -796)`, while Mau and Katress Ignis show their eligible dungeon entrances.
- Xenovader and Xenogard now show their random Meteor Event availability; Xenogard is identified as an Alpha encounter, while Xenovader can appear in normal or Alpha groups and through Factions. Silvance, Dandilord, Panthalus, and Astralym now have accurate encounter labels and maps.
- Seven special raid rewards now list the correct Summoning Altar boss, level, quantity, and drop chance, including the Moon Lord Statue Schematic.
- The installed-game audit now automatically decodes every discoverable DataTable across mounted game and patch archives. Maintainers can search the cached build snapshot by table path or internal identifier, and the audit reports extraction coverage and failures explicitly.
- Craftable schematics now show one clear **Schematic Recipe (Drafting Table)** field, unavailable game-disabled schematics are hidden, and missing loot/shop and Ancient Relic sources are restored. Supply Drops and broad salvage pools remain textual; Gold Coin, Medical Supplies, Training Manual (L), and High Quality Bait now map their eligible Junk and chest sources.
- Item cards no longer leave words such as `Logging`, `Mining`, or `Pal` dangling after moving bonuses into **Perks**, and six confirmed English grammar errors are corrected when displayed.
- Item cards now use the clearer **Enemy Camps** source label and names such as **Cherry Blossom Caves Dungeon**. Five slab-fragment maps also include their verified enemy-camp and dungeon entrances.
- Item cards now show Tech Level separately from Crafting Materials and list output quantities for recipes that produce multiple items.
- Source listings are concise inline entries without redundant placeholders, and schematic maps now point to verified Treasure Map chest and camp sources instead of Treasure Map destinations. Oil Rig and single-source map legends are also clearer.
- Musket Schematic 3's map now includes its Supply Drop and Treasure Chest locations in addition to the Ancient Ruin.
- The Legendary Treasure Map now lists its current loot sources and maps 136 confirmed locations across sea bases, enemy camps, Dark/Sky Island chests, and Feybreak Caverns. Salvage remains unpinned.
- Common through Epic Treasure Maps now show where each tier can drop instead of showing treasure destinations. Grenade Launcher Schematics 2-4 also include every mapped Epic Treasure Map source.
- The Beginner Fishing Rod (Gumoss) Schematic map now includes all 233 eligible natural fishing spots across Grasslands, Forest, Desert, and Volcano. Player-built Fishing Ponds remain listed without fixed pins.
- Item recipes and internal legality flags now match the installed Palworld build. Recipes retain canonical internal ingredient identities when different game items share the same displayed name, invalid mixed-in schematic recipes and unsupported merchant claims were removed, and malformed empty game ingredients are not shown on cards.
- Maintainers can now audit Paldeck directly against an installed Palworld build. The read-only audit caches decoded game tables by build, checks item recipes and legality, includes dedicated raid-success rewards, distinguishes fixed shop inventories from randomized weighted stock pools and shop currencies, joins IDs safely across inconsistent game-table capitalization while still flagging canonical-ID drift, inventories other acquisition references, and clearly identifies fields that still require specialized verification.
- Item source maps now use one **Oil Rig** legend entry instead of listing each Oil Rig level with the same marker color.
- Live data checks now distinguish missing upstream details from real card changes and safely resolve PalDB's cached item records without treating crafting ingredients as separate items.
- Grenade Launcher Schematics 1–4 and the Beginner Fishing Rod (Gumoss) Schematic now show their complete verified sources and regenerated maps. Fixed enemy camps, Oil Rigs, and Treasure Map destinations are pinned; Supply Drops and Salvage remain intentionally unpinned.
- Item availability is now checked against a reviewed, game-build-specific snapshot so Palworld updates cannot silently expose dormant or unused definitions.
- All 17 unused legendary-headwear blueprints are excluded from item lookup. Their official localized names—including **Blueprint of Capppen Hat 5**—remain unchanged in the underlying catalog.
- Every available schematic combination recipe now shows the **Drafting Table**. Cards show the five-copy lower-tier recipes present in the current game, armor upgrade materials stay out of schematic recipes, and cards without verified loot information clearly say their non-crafting source is not yet recorded.
- Item descriptions now remove stray spaces around punctuation and possessives, repair split plurals, and place equipment effects on separate lines for easier reading.
- Equipment bonuses such as elemental resistances, carrying capacity, and attack modifiers now appear under a dedicated **Perks** field instead of running into the item description.
- Equipment unlocked by schematics now shows its actual crafting station, including **Ancient Workbench** for every Lightweight Ancient Armor tier, even when its material list is unavailable.

## v1.9.0 - 2026-08-02

- Journal item cards now omit inventory fields and the generic **Locations** label that do not add useful information.
- World Tree treasure-chest pins now appear at their proper locations instead of outside the island map.
- Items obtainable from Sunreach or World Tree treasure chests now consistently include those chests in **Sources** and on applicable location maps.
- Pal habitat maps now consistently show wild distributions and fixed Alpha encounters. Caged Pal locations are not mapped.
- Item **Sources** now reflect all verified obtainable loot categories, including chests, fishing, expeditions, enemy camps, salvage, oil rigs, and ground spawns where applicable.
- **Training Manual (M)** no longer shows Desert elemental chests, where it cannot be obtained.
- **Ancient Sphere** now shows its eligible Sunreach and World Tree treasure chests in addition to its other World Tree sources.
- `/item` can now look up each journal with its in-game artwork and location map, or **Palpagos Journals** and **World Tree Journals** for regional overviews.

## v1.8.0 - 2026-08-01

- Item cards now use a consistent summary layout, combine acquisition information under **Sources**, show every applicable recipe, and identify the minimum required **Workbench** for crafted items.
- Item lookups now include maps for verified regional and limited-location sources, including Pal Spheres, slabs and slab fragments, Ominous Eggs, Ancient Ruin schematics, Treasure Maps, Kinship Peaches, resource nodes, Skill Fruit trees, fishing and chest rewards, Effigies, journals, and diaries. Supply Drops and Salvage remain listed under **Sources** without map pins.
- Items sold by known permanent merchants include a **Merchant Locations** button with the applicable merchants and a map. Dog Coin includes a dedicated **Medal Merchants** button covering all four permanent Medal Merchants.
- Obtainable slabs and slab fragments show their current acquisition sources, while Ultra slab lookups identify their Summoning Altar rewards.
- Radar Sphere, Silicon, and other unavailable, unfinished, or superseded definitions are excluded from item lookup.
- Key Sphere and legendary headwear schematic descriptions display without stray formatting characters.
- Paldeck commands now appear only in servers where Paldeck is installed, preventing Discord from offering commands in unsupported DM and user-installed contexts.

## v1.7.1 - 2026-07-29

- Pal cards now organize loot under Normal, Alpha, World Tree, Story Boss, Rampaging, or level-specific Summoning Altar headings and show quantities with drop chances. Alpha sections include the complete loot table, Ancient Relic tiers remain separate when chances differ, and five Raid Pal lookups show complete base and Ultra Summoning Altar rewards with guaranteed eggs.
- Selecting another suitability after a comma in `/paldeck search` now keeps the previously selected suitabilities in the command field.
- Direct messages sent to Paldeck can be routed to a privately configured support inbox with sender and owned-server context.
- Configuring an updates channel warns immediately when Paldeck cannot view it or send messages there. If a later update cannot be delivered, the server owner receives one direct warning until the channel configuration changes or succeeds.
- Long patch-note announcements continue naturally across messages without pagination labels.

## v1.7.0 - 2026-07-27

### Paldeck Data

- The `/help` support section includes the community Discord, Ko-fi page, and `/suggest` command.
- Item panels opened from `/paldeck name` include a persistent **Back to Pal** button, and `/help` explains the Pal and item lookup controls.
- Item cards avoid repeating an effect when it is identical to the item description.
- Added `/item` for public item lookups. Items with known Pal drop sources include an owner-only **View Dropping Pals** button that opens familiar paginated Paldeck results.
- `/item` autocomplete shows only item names. Its optional rarity choice selects a matching variant when available and otherwise shows the basic item.
- Item stats use a stable three-column embed layout, keeping Maximum Stack and both price fields aligned.
- Item lookups show Ammo Type for applicable weapons, useful performance stats, and dedicated Medicine Effect or Accessory Effect sections where appropriate.
- Applicable items show combat or equipment stats and the materials needed to craft them.
- Work-in-progress items such as Ballistic Shield stay hidden from `/item` until their data is finalized.
- Individual Pal results include an owner-only **Look Up Drops** control. Choosing a drop posts a public item embed with its local icon, rarity, stats, drop chance, and quantity.
- Other users who try to use someone else's drop controls receive a private ownership message, while successful item lookups remain visible to the channel.
- Item cards keep the same local presentation style as Pal cards and do not display PalDB links or internal item codes.
- Item drop sources use regular Pal names while preserving meaningful Alpha, Rampaging, World Tree, and level distinctions.
- `/paldeck search` suitability now accepts a comma-separated list and returns only Pals with every listed suitability; autocomplete preserves earlier selections as more are added.
- Individual `/paldeck` results now include a button to find breeding parents for the displayed Pal.
- `/breed` results now show plain Pal names without Paldeck number prefixes.
- `/breed` results no longer show internal breeding method or rank details.
- Removed the `/vote` command.

## v1.6.0 - 2026-07-21

### Paldeck Data

- Added missing Ancient Civilization Core drops for raid and summoning Pals.
- Removed stray `Technology N` text from Partner Skill descriptions when the same unlock already appears in the Tech field.
- Cleaned up typo and wording artifacts in several Pal descriptions and Partner Skill descriptions.
- Selyne now shows both World Tree day/night timing and Sakurajima meteorite-event availability.
- Alpha-only Pals such as Renjishi now show `Alpha only` instead of normal day/night spawn timing.
- `/breed` autocomplete now shows plain Pal names instead of number-prefixed labels.
- `/breed` now handles gender-specific Katress/Wixen outcomes for Katress Ignis and Wixen Noct.

## v1.5.0 - 2026-07-18

### Paldeck Data

- `/paldeck search` can now filter by farmable Ranch-produced materials.
- Updated ranch/farmable Pal entries so farmable Pals now show the item they
  can produce.
- Updated Pal food and rarity values to match the current game data.
- Expanded Pal descriptions with full Paldeck entry text where available.
- Filled more Pal descriptions where available, with current game summaries
  used for the newest Pals that still need full entries.
- Updated partner skill names and descriptions for many Paldeck entries.
- Replaced the remaining unknown Pal thumbnails with local images.
- Updated Pal drops and spawn times with the latest available game data.
- Added a separate World Tree Drops section to Paldeck entries, with Ancient
  Relics grouped together for readability.
- Filled the last missing Paldeck title prefixes from local Palworld text data.
- Updated Panthalus with its current partner skill and story-boss spawn details.
- Updated Astralym to show as typeless with its current game data instead of
  using a temporary unknown placeholder.
- Updated Necromus to show the same habitat map as Paladius for their paired
  alpha encounter.
- Typeless Pals can now be searched with the `None` element filter.

## v1.4.0 - 2026-07-16

### Paldeck Data

- Updated Pal Gear information shown in `/paldeck` so tech names and unlock
  levels match the current game data.
- Removed obsolete Tech fields for Pal Gear that no longer exists, including
  Celaray's Gloves.
- Updated Pal drop and farmable item names to current item names.
  `Pal Fluids` now appears as `Aquatic Pal Fluids`.
- Normalized a few stale item names and typos, including Katress Hair, Medium
  Pal Soul, High Quality Pal Oil, and Carrot Seeds.
- Added local item icon data for future item-related displays, reducing
  reliance on external image URLs.

### Paldeck Updates

- Server admins can subscribe a channel to Paldeck Updates with
  `/updates channel`.
- Server admins can unsubscribe with `/updates clear`.
- Server admins can send the latest local patch notes to their configured
  channel with `/updates send-latest`.

## v1.3.0 - 2026-07-13

### Paldeck

- Rebuilt habitat maps using the latest available map data.
- Added updated World Tree location coverage where available.
- Replaced old/stale habitat images across the Paldeck with freshly generated maps.
- Added combined habitat maps for Pals that appear in multiple regions.
- Added day/night habitat coloring:
  - Red: appears during both day and night
  - Orange: day-only
  - Purple: night-only
- Improved handling for unavailable habitat data so Pals without confirmed map data use the unknown habitat image instead of an empty map.
- Added local thumbnails for Clovee, Amione, and Panthalus.
- Corrected Relaxaurus Lux work suitabilities to Generating Electricity 4 and Transporting 3.
- Updated the app version to 1.3.0.
