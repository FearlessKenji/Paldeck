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
| `/paldeck search` | Search pals by element, suitability, rarity, and/or drops. |
| `/help` | Show Paldeck command usage help. |
| `/suggest` | Send a feature suggestion to the configured suggestions channel. Do not submit sensitive data. |
| `/vote` | Return the Top.gg voting link for Paldeck. |

### Guild Commands
| Command | Description |
| --- | --- |
| `/ban user` | Owner-only command to restrict a Discord user from Paldeck. |
| `/ban server` | Owner-only command to restrict a Discord server and related owner records. |
| `/unban user` | Owner-only command to remove a user restriction. |
| `/unban server` | Owner-only command to remove a server restriction. |

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

The bot replies with matching pal information in Discord embeds. Search results are paginated in batches of 25 with previous and next buttons. Search pagination sessions expire after about 15 minutes. If no match is found, it replies with a private "Nothing found" message.

## Suggestions and voting
Use `/suggest` to send a feature idea or feedback message. Suggestions are posted to the suggestions channel configured in the SQLite database and numbered from saved suggestion records.
Use `/vote` to get the Paldeck Top.gg voting link.

Do not submit private, confidential, or sensitive information through `/suggest`.

## Owner controls
The `/ban` and `/unban` commands are intended for the bot owner. They are guarded by the `botOwner` value in `config/config.json`.
Owner controls can restrict or unrestrict users and servers. Server restrictions may store server IDs, server names, owner IDs, and owner usernames so the bot can prevent abuse and avoid rejoining restricted servers.

## GitHub Pages
The `docs` folder contains the public legal pages for GitHub Pages:

- [Privacy Policy](docs/privacy-policy.md)
- [Terms of Service](docs/terms-of-service.md)

## License
Paldeck is licensed under the GNU General Public License version 3. See [LICENSE](LICENSE).

Copyright (C) 2026 FearlessKenji
