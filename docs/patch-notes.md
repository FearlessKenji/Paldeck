# Paldeck Patch Notes

These notes are written for server owners and moderators. They include changes
that affect setup, day-to-day use, or visible bot behavior. For the full
developer history, see [CHANGELOG.md](https://github.com/FearlessKenji/Paldeck/blob/main/CHANGELOG.md).

## Unreleased

- Direct messages sent to Paldeck can be routed to a privately configured support inbox with sender and owned-server context.
- Configuring an updates channel warns immediately when Paldeck cannot view it or send messages there. If a later update cannot be delivered, the server owner receives one direct warning until the channel configuration changes or succeeds.
- `/help` describes `/item` as looking up one item by name.
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
