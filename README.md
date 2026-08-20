# Paldeck
Paldeck is an unofficial Discord companion bot for Palworld. It lets Discord users search pal information by name, number, element, work suitability, rarity, and drops.
Paldeck is not affiliated with, endorsed by, or sponsored by Discord, Pocketpair, Palworld, Fandom, Top.gg, or any other third-party service.

## How does it work?
Paldeck uses Discord slash commands and autocomplete interactions through `discord.js`. Pal data is stored locally in `data/palData.json`, so pal lookups do not require a live Palworld API. When a user runs `/paldeck`, the bot searches that local data and replies with a Discord embed containing matching pal details, images, drops, work suitability, partner skill, and reference links.

The bot uses SQLite through Sequelize for local operational data such as joined servers, server owners, ban records, bot channel records, and suggestion-related state. Bot secrets are loaded from `.env`; non-secret local settings are kept in `config/config.json`.

## Features
- Pal lookup by name or paldeck number
- Pal search by element, work suitability, rarity, and drops
- Autocomplete for supported pal names, suitabilities, and drops
- Discord embeds with pal details, images, and reference links
- `/suggest` command for feature ideas and feedback
- `/vote` command for the Top.gg voting link
- Owner-only user and server restriction controls
- Local SQLite storage for bot operation
- GitHub Pages-ready privacy policy and terms

## Commands

### Global Commands
| Command | Description |
| --- | --- |
| `/paldeck name` | Look up a pal by name. |
| `/paldeck number` | Look up a pal by paldeck number. |
| `/paldeck search` | Search pals by element, suitability, rarity, drops, and/or farmed materials. |
| `/item name:<name> rarity:<rarity>` | Look up an item; rarity selects the exact schematic or equipment variant. |
| `/item source:<source>` | Browse deduplicated, paginated items from a normalized source such as Gold Chests, Towers, or Fishing. |
| `/breed` | Calculate breeding children, parent pairs, and partner options. |
| `/help` | Show Paldeck command usage help. |
| `/suggest` | Send a feature suggestion to the configured suggestions channel. Do not submit sensitive data. |

### Guild Commands
| Command | Description |
| --- | --- |
| `/ban user` | Owner-only command to restrict a Discord user from Paldeck. |
| `/ban server` | Owner-only command to restrict a Discord server and related owner records. |
| `/unban user` | Owner-only command to remove a user restriction. |
| `/unban server` | Owner-only command to remove a server restriction. |
| `/dm-forward channel` | Owner-only command to configure the private channel that receives direct messages sent to Paldeck. |
| `/dm-forward clear` | Owner-only command to disable direct-message forwarding. |
| `/dm-forward status` | Owner-only command to show the configured direct-message inbox. |

Global command updates can take time to appear in Discord. Guild commands are deployed only to the server matched by `guildId` in `config/config.json`, and usually appear much faster for testing.

## Requirements
- Node.js compatible with `discord.js` v14
- A Discord application and bot token
- A Discord server for testing guild commands

## Installation
First you will have to download or clone the project.

```console
$ git clone https://github.com/FearlessKenji/Paldeck
```

## Dependencies
Install the required node packages outlined in `package.json` with:

```console
$ npm install
```

## Edit .env
Copy `blank.env` to `.env` and fill in the required fields.

```powershell
$ Copy-Item blank.env .env
```

- TOKEN - Enter your [Discord bot token](https://discord.com/developers/applications) here.
- clientId - Copy and paste your Discord application ID. You need this to register commands.

## Edit config.json
Copy `config/blank.json` to `config/config.json` and fill in the required fields.

```powershell
$ Copy-Item config/blank.json config/config.json
```

- botOwner - Copy and paste your Discord user ID for owner-only commands.
- guildId - Copy and paste your Discord server ID for private guild-access commands.

`.env` and `config/config.json` are ignored by Git. Do not commit bot tokens or private IDs you do not want public.

## Database
Paldeck uses SQLite through Sequelize. Initialize the database before first run:

```console
$ npm run db:init
```

Normal startup also syncs the database and runs tracked migrations. When a migration needs to rebuild a table, Paldeck creates a timestamped SQLite backup next to the database file before making the change.

To rebuild the database from scratch:

```console
$ npm run db:reset
```

## Register Slash Commands
Register global commands with:
```console
$ npm run deploy:global
```

Register guild commands with:
```console
$ npm run deploy:guild
```

Temporarily register selected global commands in the configured guild for immediate testing:
```console
$ npm run deploy:test -- item
```

The test deployment retains all normal guild commands and adds only the named global commands as guild-scoped copies. It does not change global registration. Run `npm run deploy:guild` afterward to remove the temporary copies.

The global commands will be available in all servers where Paldeck is installed. The guild commands will only be available in the server whose ID matches `guildId` in `config/config.json`.

To clear registered commands:
```console
$ npm run commands:clear
```

## Run the bot
After you update `.env`, `config/config.json`, and initialize the database, start the bot from the project folder:
```console
$ npm start
```

## Logs
Paldeck writes operational logs to dated folders inside `logs/`. Each day can include `raw.log`, `structured.log`, and `crash.log`. Old log folders are archived automatically, and old archives are deleted after the configured retention period.
Logs may include startup events, server join or leave events, owner-control actions, and error details used for debugging.

## Search pals
Use `/paldeck name` to search for one pal by name.
Use `/paldeck number` to search for one pal by paldeck number.
Use `/paldeck search` to combine criteria:

- element - Filter by element type.
- suitability - Filter by work suitability, optionally including a level such as `Mining 2`.
- rarity - Filter by common, rare, epic, or legendary.
- drops - Filter by item drops.
- farmable - Filter by Ranch-produced materials.

The bot replies with matching pal information in Discord embeds. Search results are paginated in batches of 25 with previous and next buttons. Search pagination sessions expire after about 15 minutes. If no match is found, it replies with a private "Nothing found" message.

## Audit Palworld data

Refresh or audit readable item loot-source exports with `npm run items:sources:sync -- --write` or `npm run items:sources:sync`. Paldeck treats decoded local game files and their asset identities as authoritative; PalDB is used to corroborate and translate those records. Zero-percent and test pools are excluded automatically.
Palworld updates can change Paldeck numbers, work suitabilities, elements, internal breeding IDs, and available Pals. To compare the local JSON files against current PalDB data:

```console
$ npm run audit:palworld-data
```

Item availability decisions are stored in `data/itemAvailability.json` with their reviewed Palworld build and rationale. CI validates that snapshot without requiring a game installation:

```console
$ npm run validate:item-availability
```

After Palworld updates, compare the snapshot with the locally installed Steam build before accepting its availability decisions:

```console
$ npm run audit:item-availability
```

For a direct, read-only comparison of catalog recipes, legal flags, and acquisition-table references against the installed pak, run:

```console
$ npm run audit:installed-game-data
```

The audit reuses the build-keyed snapshot under `%LOCALAPPDATA%\Paldeck\game-audit\snapshots`. To refresh it, first decode the installed game's tables with an external Unreal-asset decoder, then pass that JSON export with `npm run audit:installed-game-data:refresh -- --tables <file>` or set `PALWORLD_TABLE_EXPORT`. Override Steam manifest discovery with `--steam-manifest` or `PALWORLD_STEAM_MANIFEST`. Keeping archive decoding external lets Paldeck remain a JavaScript-only project while its audit and comparison logic stays repeatable. The report distinguishes exact recipe/legality mismatches from generic acquisition references, which do not by themselves prove normal-play availability. Shop reporting separately identifies product groups, randomized weighted stock pools, and currency definitions.

Query the broad snapshot by table path or row contents without modifying it:

```powershell
$ npm run inspect:installed-game-data -- --table RaidBoss --search Blueprint_YakushimaBoss002_Relic
$ npm run inspect:installed-game-data -- --table DataTable/Character --limit 25
```

To synchronize deterministic recipe, legality, and unsupported local-merchant differences, review the dry run before writing:

```console
$ npm run sync:installed-game-items
$ npm run sync:installed-game-items:write
```

The synchronizer requires a snapshot matching the installed Steam build. It preserves reviewed visibility decisions, records canonical ingredient IDs, and ignores malformed `None` material slots while reporting them.

The local audit finds common Steam-library locations automatically. For another library, pass `--steam-manifest C:\\path\\to\\appmanifest_1623730.acf` or set `PALWORLD_STEAM_MANIFEST`. A build mismatch fails deliberately and requires the item legality and reachable recipe, loot, merchant, spawn, technology, event, and reward paths to be reviewed before updating the snapshot.

The audit is read-only. It reports added Pals, missing Pals, changed `palData.json` fields, and changed `palData.json` breeding IDs.

To apply safe updates for existing local Pals, run the updater in dry-run mode first:

```console
$ npm run update:palworld-data
```

If the report looks correct, write the updates:

```console
$ npm run update:palworld-data:write
```

The updater refreshes existing Pal numbers, elements, work suitabilities, missing `Colors` palette entries, and `breeding.id` values from PalDB. It also removes redundant per-Pal `color` overrides so embed colors come from `palData.json`'s `Colors` palette. It intentionally does not auto-add full `palData.json` profile entries for new Pals or rewrite PalCalc-owned breeding ranks and priorities; review those separately because they require richer source data than the Pal list and IV JSON expose.

To add newly discovered Pals to `palData.json` with safe placeholders, dry-run first:

```console
$ npm run add:missing-paldata
```

Then write the generated entries:

```console
$ npm run add:missing-paldata:write
```

Missing profile fields are filled as `Unknown. Too new.`, missing food is filled as `Unknown/10`, and unknown rarity uses `0`, which `/paldeck` displays as `Unknown`. If an exact Palworld Fandom page exposes a thumbnail, the generated row downloads it into `data/pals`; otherwise it uses the local `data/pals/pal-unknown.png` fallback.

To spot-check calculated breeding outcomes against PalDB's live two-parent endpoint:

```console
$ npm run audit:palworld-breeding-results
```

That command samples parent pairs by default. Use `node scripts/breeding/audit-results.js --sample 250` for a larger sample, or `npm run audit:palworld-breeding-results:full` for every local parent pair.

To audit whether PalDB exposes any breeding outcomes that still need source overrides, dry-run first:

```console
$ npm run update:palworld-breeding-results
```

The current formula model expects this override set to stay empty. Only write generated overrides after reviewing why a live source disagrees with the local game-file model:

```console
$ npm run update:palworld-breeding-results:write
```

Breeding autocomplete, ranks, priorities, `IgnoreCombi`, and native-derived standard-child flags come from `data/palData.json`. `data/palBreeding.json` keeps source notes and compact non-same-species `DT_PalCombiUnique` rows—including parent-gender requirements—decoded from the installed game. `/breed result` accepts the active breeding item's `CombiRankBonus`; every breeding-result view provides mutation outcomes with the percentage for each possible child. Optional `SourceOverrides` rows are only written when verified corrections cannot be represented by game data and native rules.

Same-species mutation-child pools are stored as readable `breeding.mutatedChildren` arrays. They apply the native parent-rank formula and resolve each target to the nearest non-boss Pal whose extracted `IgnoreCombi` flag is false. `/breed result` calculates the pool from both selected parents. Refresh the installed-game breeding flags before regenerating the pools after a game update:

```console
$ npm run sync:pal-breeding-flags:write
$ npm run sync:pal-mutations:write
$ npm run sync:pal-breeding-flags
$ npm run sync:pal-mutations
```

The coefficients, candidate flags, sampling loop, and tie resolution were traced from the installed shipping executable and Pal parameter table. `data/palBreeding.json` records the formula and the observed Aegidron, Whalaska, and Ophydia hatch checks used to validate it.

Convenience commands are also available:

```console
$ npm run audit:palworld-data:summary
$ npm run audit:palworld-data:json
$ npm run audit:palworld-data:ci
```

To pass custom options, run the script directly:

```console
$ node scripts/breeding/audit-paldb.js --limit 10
```

## Suggestions and voting
Use `/suggest` to send a feature idea or feedback message. Suggestions are posted to the suggestions channel configured in the SQLite database and numbered from saved suggestion records.
Use `/vote` to get the Paldeck Top.gg voting link.

Do not submit private, confidential, or sensitive information through `/suggest`.

## Owner controls
The `/ban` and `/unban` commands are intended for the bot owner. They are guarded by the `botOwner` value in `config/config.json`.
Owner controls can restrict or unrestrict users and servers. Server restrictions may store server IDs, server names, owner IDs, and owner usernames so the bot can prevent abuse and avoid rejoining restricted servers.

## GitHub Pages
The `docs` folder contains the public pages for GitHub Pages:

- [Changelog](CHANGELOG.md)
- [Patch Notes](docs/patch-notes.md)
- [Privacy Policy](docs/privacy-policy.md)
- [Terms of Service](docs/terms-of-service.md)

## License
Paldeck is licensed under the GNU General Public License version 3. See [LICENSE](LICENSE).

Copyright (C) 2026 FearlessKenji
