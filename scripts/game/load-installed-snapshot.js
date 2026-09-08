const fs = require(`node:fs`);
const os = require(`node:os`);
const path = require(`node:path`);
const { steamBuildId } = require(`../../utils/itemAvailabilityAudit.js`);

function argument(name) {
	const index = process.argv.indexOf(name);
	return index >= 0 ? process.argv[index + 1] : null;
}

function loadInstalledSnapshot() {
	const manifest = argument(`--steam-manifest`) || process.env.PALWORLD_STEAM_MANIFEST ||
		String.raw`B:\SteamLibrary\steamapps\appmanifest_1623730.acf`;
	const buildId = steamBuildId(fs.readFileSync(manifest, `utf8`));
	// Modification time does not identify the installed build: select its exact cache key.
	const source = argument(`--snapshot`) || path.join(process.env.LOCALAPPDATA || os.tmpdir(),
		`Paldeck`, `game-audit`, `snapshots`, `items-${buildId}.json`);
	const snapshot = JSON.parse(fs.readFileSync(source, `utf8`));
	if (String(snapshot.buildId) !== buildId) {
		throw new Error(`Snapshot build ${snapshot.buildId} does not match installed build ${buildId}.`);
	}
	const rows = snapshot.tables?._decodedTables?.[`Pal/Content/Pal/DataTable/Character/DT_PalMonsterParameter`];
	if (!Object.keys(rows || {}).length) {
		throw new Error(`Installed snapshot has no decoded Pal parameter rows.`);
	}
	return snapshot;
}

module.exports = { loadInstalledSnapshot };
