#!/usr/bin/env node

// Extracts authoritative installed-game tables into a build-keyed cache and compares them without rewriting cards.
/* eslint-disable max-statements-per-line -- concise command-line guards keep failure paths readable. */
const childProcess = require(`node:child_process`);
const fs = require(`node:fs`);
const os = require(`node:os`);
const path = require(`node:path`);
const { resolvedItemData } = require(`../utils/itemData.js`);
const palData = require(`../data/palData.json`);
const palBreeding = require(`../data/palBreeding.json`);
const { compareGameBreeding, compareGameItemData, compareGamePalAvailability } = require(`../utils/gameDataAudit.js`);
const { steamBuildId } = require(`../utils/itemAvailabilityAudit.js`);

const ROOT = path.resolve(__dirname, `..`);

function optionValue(name) {
	const index = process.argv.indexOf(name);
	return index >= 0 ? process.argv[index + 1] : null;
}

function firstExisting(paths) {
	return paths.filter(Boolean).map(candidate => path.resolve(candidate)).find(candidate => fs.existsSync(candidate));
}

function configuration() {
	const steamManifest = firstExisting([
		optionValue(`--steam-manifest`), process.env.PALWORLD_STEAM_MANIFEST,
		String.raw`B:\SteamLibrary\steamapps\appmanifest_1623730.acf`,
		String.raw`C:\Program Files (x86)\Steam\steamapps\appmanifest_1623730.acf`,
	]);
	if (!steamManifest) {throw new Error(`Palworld Steam manifest not found.`);}
	const buildId = steamBuildId(fs.readFileSync(steamManifest, `utf8`));
	const steamApps = path.dirname(steamManifest);
	const pakDirectory = firstExisting([
		optionValue(`--pak-directory`), process.env.PALWORLD_PAK_DIRECTORY,
		path.join(steamApps, `common`, `Palworld`, `Pal`, `Content`, `Paks`),
	]);
	const mapping = firstExisting([
		optionValue(`--usmap`), process.env.PALWORLD_USMAP,
		path.join(process.env.LOCALAPPDATA || os.tmpdir(), `Paldeck`, `game-audit`, `Mappings102.usmap`),
	]);
	if (!pakDirectory) {throw new Error(`Palworld pak directory not found; pass --pak-directory.`);}
	if (!mapping) {throw new Error(`Palworld mapping not found; pass --usmap or set PALWORLD_USMAP.`);}
	return { buildId, mapping, pakDirectory, steamManifest };
}

function extractSnapshot(config, target) {
	const rawTarget = `${target}.tables.tmp`;
	const project = path.join(ROOT, `tools`, `palworld-game-data-extractor`, `PalworldGameDataExtractor.csproj`);
	const result = childProcess.spawnSync(`dotnet`, [
		`run`, `--project`, project, `--configuration`, `Release`, `--`, config.pakDirectory, config.mapping, rawTarget,
	], { encoding: `utf8`, stdio: [`ignore`, `pipe`, `pipe`] });
	if (result.status !== 0) {
		throw new Error(`Game-table extraction failed.\n${result.stdout}${result.stderr}`);
	}
	const snapshot = {
		schemaVersion: 2,
		buildId: config.buildId,
		extractedAt: new Date().toISOString(),
		mapping: path.basename(config.mapping),
		tables: JSON.parse(fs.readFileSync(rawTarget, `utf8`)),
	};
	fs.mkdirSync(path.dirname(target), { recursive: true });
	fs.writeFileSync(target, `${JSON.stringify(snapshot)}\n`);
	fs.rmSync(rawTarget, { force: true });
	return snapshot;
}

function loadSnapshot(config) {
	const supplied = optionValue(`--snapshot`);
	const target = supplied ?
		path.resolve(supplied) :
		path.join(
			process.env.LOCALAPPDATA || os.tmpdir(), `Paldeck`, `game-audit`, `snapshots`, `items-${config.buildId}.json`,
		);
	if (!process.argv.includes(`--refresh`) && fs.existsSync(target)) {
		const snapshot = JSON.parse(fs.readFileSync(target, `utf8`));
		if (String(snapshot.buildId) === String(config.buildId)) {return { snapshot, target, cached: true };}
	}
	if (supplied) {throw new Error(`Supplied snapshot is absent or does not match installed build ${config.buildId}.`);}
	return { snapshot: extractSnapshot(config, target), target, cached: false };
}

function printRows(title, rows, limit, formatter) {
	console.log(`\n${title}: ${rows.length}`);
	for (const row of rows.slice(0, limit)) {console.log(`- ${formatter(row)}`);}
	if (rows.length > limit) {console.log(`... ${rows.length - limit} more`);}
}

function printReport(report, source, cached) {
	const limit = Number(optionValue(`--limit`) ?? 25);
	const extraction = report.extraction || {};
	console.log(`Installed-game item audit for Palworld build ${report.summary.buildId}`);
	console.log(`Snapshot: ${source} (${cached ? `cached` : `new`})`);
	console.log(`Catalog items: ${report.summary.catalogItems}`);
	console.log(`Decoded game item rows: ${report.summary.gameItemRows}`);
	console.log(`Decoded game recipe rows: ${report.summary.gameRecipeRows}`);
	console.log(`Recipe items matched: ${report.summary.matchedRecipeItems}`);
	console.log(`Items missing game-backed local recipes: ${report.summary.missingLocalRecipeItems}`);
	console.log(`Items with mismatched local recipes: ${report.summary.mismatchedLocalRecipeItems}`);
	console.log(`Item legality mismatches: ${report.summary.legalityMismatches}`);
	console.log(`Local canonical-ID casing mismatches: ${report.summary.localIdCasingMismatches}`);
	console.log(`Game cross-table ID casing mismatches: ${report.summary.gameReferenceCasingMismatches}`);
	console.log(`Malformed game recipe rows: ${report.summary.malformedGameRecipes}`);
	console.log(`Items referenced by acquisition-related tables: ${report.summary.acquisitionEvidenceItems}`);
	console.log(`Unavailable decoded tables: ${report.summary.unavailableTables.join(`, `) || `none`}`);
	console.log(`Mounted assets inspected: ${extraction.mountedAssets ?? `unknown`}`);
	console.log(`DataTable candidates/decoded: ${extraction.candidateTables ?? `unknown`}/${extraction.decodedTables ?? `unknown`}`);
	console.log(`Decoded DataTable rows: ${extraction.decodedRows ?? `unknown`}`);
	console.log(`Failed table candidates: ${extraction.failedCandidates ?? `unknown`}`);
	console.log(`Shop product groups/items: ${report.summary.shopProductGroups}/${report.summary.shopProductItems}`);
	console.log(`Randomized shop pools/items: ${report.summary.shopLotteryPools}/${report.summary.randomizedShopItems}`);
	console.log(`Shop currency definitions: ${report.summary.shopCurrencies}`);
	console.log(`Breeding unique rows (game/meaningful/local): ${report.breeding.gameRows}/${report.breeding.meaningfulRows}/${report.breeding.localRows}`);
	console.log(`Breeding mismatches: ${report.breeding.mismatches.length + report.breeding.extraLocalRows.length}`);
	printRows(`Missing local recipes`, report.missingLocalRecipes, limit, row => row.name);
	printRows(`Mismatched local recipes`, report.mismatchedLocalRecipes, limit, row => row.name);
	printRows(`Legality mismatches`, report.legalityMismatches, limit, row => `${row.name}: local ${row.local}, game ${row.game}`);
	printRows(`Local canonical-ID casing mismatches`, report.localIdCasingMismatches, limit, row => `${row.name}: ${row.local} -> ${row.game}`);
	printRows(`Game cross-table ID casing mismatches`, report.gameReferenceCasingMismatches, limit, row => `${row.table}: ${row.reference} -> ${row.canonical}`);
	printRows(`Malformed game recipe rows`, report.malformedGameRecipes, limit, row =>
		`${row.row}: ${row.malformedMaterials.map(value => `Material${value.slot}=None ×${value.quantity}`).join(`, `)}`,
	);
	printRows(`Game-only recipe products`, report.gameOnlyRecipeProducts, limit, value => value);
	printRows(`Game shop items without local acquisition coverage`, report.missingLocalShopItems, limit, value => value);
	printRows(`Local merchant items absent from game shop tables`, report.localShopItemsMissingGameEvidence, limit, value => value);
	console.log(`\nAudit limitations:`);
	for (const limitation of report.unsupported) {console.log(`- ${limitation}`);}
}

try {
	const config = configuration();
	const loaded = loadSnapshot(config);
	const report = compareGameItemData(resolvedItemData(), loaded.snapshot);
	report.palAvailability = compareGamePalAvailability(palData, loaded.snapshot);
	report.breeding = compareGameBreeding(palData, palBreeding, loaded.snapshot);
	report.summary.palsWithAvailabilityEvidence = report.palAvailability.filter(row => row.classifications.length).length;
	if (process.argv.includes(`--json`)) {
		console.log(JSON.stringify({ snapshot: loaded.target, cached: loaded.cached, ...report }, null, 2));
	} else {
		printReport(report, loaded.target, loaded.cached);
		console.log(`Pals with classified availability evidence: ${report.summary.palsWithAvailabilityEvidence}/${report.palAvailability.length}`);
	}
	if (process.argv.includes(`--fail-on-drift`) &&
		(report.missingLocalRecipes.length || report.mismatchedLocalRecipes.length || report.legalityMismatches.length ||
			report.breeding.mismatches.length || report.breeding.extraLocalRows.length)) {
		process.exitCode = 1;
	}
} catch (error) {
	console.error(error.message || error);
	process.exitCode = 1;
}
