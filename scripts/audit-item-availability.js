// Checks the reviewed availability snapshot and, when present, its installed Palworld build provenance.
const fs = require(`node:fs`);
const path = require(`node:path`);
const availabilityManifest = require(`../data/itemAvailability.json`);
const { resolvedItemData } = require(`../utils/itemData.js`);
const { findAvailabilityManifestProblems, steamBuildId } = require(`../utils/itemAvailabilityAudit.js`);

function optionValue(name) {
	const index = process.argv.indexOf(name);
	return index >= 0 ? process.argv[index + 1] : null;
}

function candidateSteamManifests() {
	return [
		optionValue(`--steam-manifest`),
		process.env.PALWORLD_STEAM_MANIFEST,
		`B:\\SteamLibrary\\steamapps\\appmanifest_1623730.acf`,
		`C:\\Program Files (x86)\\Steam\\steamapps\\appmanifest_1623730.acf`,
	].filter(Boolean).map(candidate => path.resolve(candidate));
}

const problems = findAvailabilityManifestProblems(resolvedItemData(), availabilityManifest);
const steamManifestPath = candidateSteamManifests().find(candidate => fs.existsSync(candidate));

if (steamManifestPath) {
	const installedBuildId = steamBuildId(fs.readFileSync(steamManifestPath, `utf8`));
	if (!installedBuildId) {
		problems.push(`Could not read a build ID from ${steamManifestPath}.`);
	} else if (installedBuildId !== availabilityManifest.game.buildId) {
		problems.push(`Installed Palworld build ${installedBuildId} does not match reviewed build ${availabilityManifest.game.buildId}; regenerate the availability audit.`);
	}
} else if (process.argv.includes(`--require-installed-game`)) {
	problems.push(`No Palworld Steam app manifest was found; pass --steam-manifest or set PALWORLD_STEAM_MANIFEST.`);
}

if (problems.length) {
	console.error(`Found ${problems.length} item availability issue(s):`);
	for (const problem of problems) {
		console.error(`- ${problem}`);
	}
	process.exitCode = 1;
} else {
	const buildMessage = steamManifestPath ? ` and installed build ${availabilityManifest.game.buildId}` : ``;
	console.log(`Item availability snapshot passed for ${availabilityManifest.items.length} audited definitions${buildMessage}.`);
}
