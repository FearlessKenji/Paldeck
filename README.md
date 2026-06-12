# Paldeck

Paldeck is an unofficial Discord companion bot for Palworld. It lets Discord users search pal information by name, number, element, work suitability, rarity, and drops.

Paldeck is not affiliated with, endorsed by, or sponsored by Discord, Pocketpair, Palworld, Fandom, Top.gg, or any other third-party service.

## Features

- Search the paldeck by pal name or paldeck number
- Search by element, work suitability, rarity, and drops
- Autocomplete for supported pal names, suitabilities, and drops
- Embed responses with pal details, drops, work suitability, partner skill, images, and reference links
- `/suggest` command for bot feedback
- `/vote` command for the Top.gg voting link
- Owner-only ban and unban commands for users or servers
- Local SQLite storage for joined servers, ban records, bot channels, and other operational data

## Commands

### Global Commands

| Command | Description |
| --- | --- |
| `/paldeck name` | Look up a pal by name. |
| `/paldeck number` | Look up a pal by paldeck number. |
| `/paldeck search` | Search pals by element, suitability, rarity, and/or drops. |
| `/help` | Show command usage help. |
| `/suggest` | Send a feature suggestion to the configured suggestions channel. |
| `/vote` | Return the Top.gg voting link for Paldeck. |

### Guild Commands

| Command | Description |
| --- | --- |
| `/ban user` | Owner-only command to restrict a Discord user from Paldeck. |
| `/ban server` | Owner-only command to restrict a Discord server and related owner records. |
| `/unban user` | Owner-only command to remove a user restriction. |
| `/unban server` | Owner-only command to remove a server restriction. |

The guild commands are also guarded by the `botOwner` value in `config.json`.

## Requirements

- Node.js compatible with `discord.js` v14
- A Discord application and bot token
- A Discord server for testing guild commands

## Setup

Install dependencies:

```powershell
npm install
```

Create a local config file:

```powershell
Copy-Item blank_config.json config.json
```

Create a local environment file:

```powershell
Copy-Item blank.env .env
```

Fill in `.env`:

```text
token=your Discord bot token
clientId=your Discord application/client ID
```

Fill in `config.json`:

```json
{
  "botOwner": "your Discord user ID",
  "guildId": "your test or owner-command guild ID",
  "count": 1
}
```

Environment fields:

- `token`: Discord bot token.
- `clientId`: Discord application ID.

Config fields:

- `botOwner`: Discord user ID allowed to run owner-only controls.
- `guildId`: Guild used when deploying guild commands.
- `count`: Suggestion counter used by `/suggest`.

`.env` and `config.json` are ignored by Git. Do not commit bot tokens or private IDs you do not want public.

## Database

Paldeck uses SQLite through Sequelize. Initialize the database before first run:

```powershell
node database/dbInit.js
```

To rebuild the database from scratch:

```powershell
node database/dbInit.js --force
```

The SQLite database file is generated at `database/database.sqlite` and is ignored by Git.

## Deploy Discord Commands

Deploy global commands:

```powershell
node deploy-global-commands.js
```

Deploy guild commands:

```powershell
node deploy-guild-commands.js
```

Global command updates can take time to appear in Discord. Guild command updates usually appear much faster and are better for testing.

To clear registered commands:

```powershell
node delete-all-commands.js
```

## Run

Start the bot:

```powershell
node index.js
```

Paldeck creates logs in `logs/console.log` when needed. The `logs` directory and log files are ignored by Git.

## Project Structure

```text
commands/
  globalCommands/    Public slash commands
  guildCommands/     Owner/admin slash commands
database/
  models/            Sequelize models
  dbInit.js          SQLite initialization
  dbObjects.js       Database model exports
events/              Discord event handlers
modules/             Shared helpers
docs/                GitHub Pages legal pages
palData.json         Palworld data used by /paldeck
```

## GitHub Pages

The `docs` folder contains the public legal pages for GitHub Pages:

- [Privacy Policy](docs/privacy-policy.md)
- [Terms of Service](docs/terms-of-service.md)

If GitHub Pages is configured to publish from `/docs`, these Markdown files are built as public `.html` pages.

## Privacy and Data

Paldeck stores only the data needed to operate the bot, such as server IDs, server names, owner IDs/usernames, ban records, channel records, suggestion text, and operational logs. See the [Privacy Policy](docs/privacy-policy.md) for details.

## Contributing Notes

Command modules should export both `data` and `execute`. Autocomplete commands should also export `autocomplete`.

When adding commands, place them under the correct scope:

- `commands/globalCommands/...` for public global commands
- `commands/guildCommands/...` for owner or guild-scoped commands

After adding or changing slash commands, rerun the relevant deploy script.

## License

Paldeck is licensed under the GNU General Public License version 3. See [LICENSE](LICENSE).

Copyright (C) 2026 FearlessKenji
