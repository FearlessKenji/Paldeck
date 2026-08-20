#!/usr/bin/env node

// Exercises command loading, rendered responses, data invariants, integrations, and repository hygiene.
const fs = require(`node:fs`);
const os = require(`node:os`);
const path = require(`node:path`);
const { compareGameItemData, compareGamePalAvailability } = require(`../utils/gameDataAudit.js`);
const { curatedPalHabitats } = require(`../utils/curatedPalHabitats.js`);
const { legendLabel } = require(`./lib/maps/item-map-rendering.js`);
const { validateItemLookupAndDroppingPals } = require(`./smoke/item-smoke.js`);
const {
	validateBreedAutocompleteUsesPalData, validateBreedResultsUsePlainNames, validateEncounterDropData,
	validateGroupedPalDrops, validatePaldeckBreedingButton, validatePaldeckDropLookup, validatePaldeckLearnedMoves,
	validatePaldeckFarmableSearch, validatePaldeckSuitabilityListAutocomplete,
} = require(`./smoke/pal-command-smoke.js`);
const {
	validateAnnouncementHelpers, validateCiWorkflow, validateConfigValueHelpers, validateDatabaseModels,
	validateDmForwarding, validateEventsLoad, validateGitHygiene, validateGithubPagesDocs,
	validateHiddenPalPlaceholdersStayHidden, validateHtmlTextHelpers, validateMapDeduplicationSafety,
	validatePalData, validateReleaseWorkflow,
} = require(`./smoke/repository-smoke.js`);

const projectRoot = path.resolve(__dirname, `..`);
process.chdir(projectRoot);

const results = {
	failed: 0,
	passed: 0,
	warned: 0,
};

let createdSmokeConfig = false;
let smokeDatabasePath = null;
let sequelizeToClose = null;

function resolveProject(...parts) {
	return path.join(projectRoot, ...parts);
}

function relative(filePath) {
	return path.relative(projectRoot, filePath).replace(/\\/gu, `/`);
}

function readJson(...parts) {
	return JSON.parse(fs.readFileSync(resolveProject(...parts), `utf8`));
}

function requireFresh(...parts) {
	const filePath = resolveProject(...parts);
	const resolvedPath = require.resolve(filePath);
	delete require.cache[resolvedPath];
	return require(resolvedPath);
}

function assert(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

function warn(message) {
	results.warned += 1;
	console.log(`[warn] ${message}`);
}

function ensureSmokeRuntimeConfig() {
	process.env.TOKEN = process.env.TOKEN || `smoke-token`;
	process.env.clientId = process.env.clientId || `smoke-client-id`;

	const configPath = resolveProject(`config`, `config.json`);

	if (fs.existsSync(configPath)) {
		return;
	}

	const config = readJson(`config`, `blank.json`);
	config.botOwner = `111111111111111111`;
	config.guildId = `222222222222222222`;
	fs.writeFileSync(configPath, `${JSON.stringify(config, null, `\t`)}\n`);
	createdSmokeConfig = true;
}

function cleanupSmokeRuntimeConfig() {
	if (!createdSmokeConfig) {
		return;
	}

	const configPath = resolveProject(`config`, `config.json`);

	if (fs.existsSync(configPath)) {
		fs.rmSync(configPath, { force: true });
	}
}

async function initializeSmokeSearchStorage() {
	smokeDatabasePath = path.join(os.tmpdir(), `paldeck-smoke-${process.pid}.sqlite`);
	process.env.PALDECK_DATABASE_PATH = smokeDatabasePath;
	const { BotSettings, JoinedServers, SearchSessions, sequelize } = requireFresh(`database`, `dbObjects.js`);

	sequelizeToClose = sequelize;
	// Interaction tests need isolated persistence tables even in a fresh CI checkout.
	await Promise.all([BotSettings.sync(), JoinedServers.sync(), SearchSessions.sync()]);
}

function cleanupSmokeDatabase() {
	if (!smokeDatabasePath) {
		return;
	}

	for (const suffix of [``, `-shm`, `-wal`]) {
		fs.rmSync(`${smokeDatabasePath}${suffix}`, { force: true });
	}
}

async function test(name, fn) {
	try {
		await fn();
		results.passed += 1;
		console.log(`[pass] ${name}`);
	} catch (error) {
		results.failed += 1;
		console.error(`[fail] ${name}`);
		console.error(`       ${error.message}`);
	}
}

function assertLockPackage(lock, packageName) {
	const packagePath = `node_modules/${packageName}`;

	assert(lock.packages?.[packagePath], `package-lock.json is missing ${packagePath}.`);
}

function validatePackageMetadata() {
	const pkg = readJson(`package.json`);
	const lock = readJson(`package-lock.json`);
	const rootPackage = lock.packages?.[``];

	assert(pkg.name === `paldeck`, `package.json name should be paldeck.`);
	assert(pkg.version === lock.version, `package.json and package-lock.json versions do not match.`);
	assert(rootPackage?.version === pkg.version, `package-lock root package version does not match package.json.`);
	assert(pkg.scripts?.lint === `node scripts/lint.js`, `package.json is missing the lint script.`);
	assert(pkg.scripts?.smoke === `node scripts/smokeTest.js`, `package.json is missing the smoke script.`);
	assert(pkg.scripts?.[`deploy:test`] === `node deploy-test-commands.js`, `package.json is missing the test deployment script.`);
	assert(pkg.scripts?.[`start:test`] === `node start-test.js`, `package.json is missing the test startup script.`);

	for (const packageName of Object.keys(pkg.dependencies || {})) {
		assertLockPackage(lock, packageName);
	}

	for (const packageName of Object.keys(pkg.devDependencies || {})) {
		assertLockPackage(lock, packageName);
	}
}

function validateRequiredProjectFiles() {
	const requiredFiles = [
		`.github/workflows/ci.yml`,
		`.github/workflows/release.yml`,
		`CHANGELOG.md`,
		`docs/_config.yml`,
		`docs/patch-notes.md`,
		`commands/globalCommands/admin/announce.js`,
		`commands/globalCommands/utility/updates.js`,
		`deploy-test-commands.js`,
		`start-test.js`,
		`utils/announcements.js`,
		`utils/configValues.js`,
		`utils/testEnvironment.js`,
	];

	for (const filePath of requiredFiles) {
		assert(fs.existsSync(resolveProject(filePath)), `${filePath} is missing.`);
	}
}

function validateCommandOptionJson(commandName, option, pathParts = []) {
	const optionPath = [...pathParts, option.name].filter(Boolean).join(` `);

	assert(option.name, `${commandName} has an option without a name.`);
	assert(/^[\p{Ll}\p{N}_-]{1,32}$/u.test(option.name), `${commandName} option ${optionPath} has an invalid name.`);
	assert(option.description, `${commandName} option ${optionPath} is missing a description.`);
	assert(option.description.length <= 100, `${commandName} option ${optionPath} description is longer than 100 characters.`);

	if (option.choices) {
		assert(Array.isArray(option.choices), `${commandName} option ${optionPath} choices should be an array.`);
		assert(option.choices.length <= 25, `${commandName} option ${optionPath} has more than 25 choices.`);
	}

	if (option.options) {
		assert(Array.isArray(option.options), `${commandName} option ${optionPath} child options should be an array.`);
		assert(option.options.length <= 25, `${commandName} option ${optionPath} has more than 25 child options.`);

		for (const childOption of option.options) {
			validateCommandOptionJson(commandName, childOption, [...pathParts, option.name]);
		}
	}
}

function validateCommandJson(command, json) {
	assert(json.name, `${relative(command.filePath)} command JSON is missing name.`);
	assert(json.name.length <= 32, `${json.name} command name is longer than 32 characters.`);

	if (!json.type || json.type === 1) {
		assert(/^[\p{Ll}\p{N}_-]{1,32}$/u.test(json.name), `${json.name} is not a valid lowercase slash command name.`);
		assert(json.description, `${json.name} slash command is missing a description.`);
		assert(json.description.length <= 100, `${json.name} description is longer than 100 characters.`);
	}

	if (json.options) {
		assert(Array.isArray(json.options), `${json.name} options should be an array.`);
		assert(json.options.length <= 25, `${json.name} has more than 25 top-level options.`);

		for (const option of json.options) {
			validateCommandOptionJson(json.name, option);
		}
	}
}

function validateCommandsLoad() {
	const { loadCommandData, loadCommandFiles } = requireFresh(`utils`, `commandLoader.js`);
	const globalCommandsPath = resolveProject(`commands`, `globalCommands`);
	const commands = loadCommandFiles(resolveProject(`commands`), {
		warn: message => {
			throw new Error(message);
		},
	});
	const namesByScope = new Map();

	assert(commands.length > 0, `No commands were loaded.`);

	for (const commandInfo of commands) {
		const { command, filePath } = commandInfo;
		const json = command.data.toJSON();
		const scope = relative(filePath).startsWith(`commands/globalCommands/`) ? `global` : `guild`;
		const scopeKey = `${scope}:${json.name.toLowerCase()}`;

		commandInfo.filePath = filePath;
		assert(!namesByScope.has(scopeKey), `Duplicate ${scope} command name: ${json.name}.`);
		assert(command.execute.constructor.name === `AsyncFunction`, `${relative(filePath)} execute() should be async.`);

		for (const optionalHandler of [`autocomplete`, `handleButton`, `handleSelectMenu`]) {
			if (command[optionalHandler] !== undefined) {
				assert(typeof command[optionalHandler] === `function`, `${relative(filePath)} ${optionalHandler} should be a function when exported.`);
				assert(command[optionalHandler].constructor.name === `AsyncFunction`, `${relative(filePath)} ${optionalHandler} should be async.`);
			}
		}

		validateCommandJson(commandInfo, json);
		namesByScope.set(scopeKey, filePath);
	}

	assert(namesByScope.has(`global:updates`), `/updates command was not loaded.`);
	assert(namesByScope.has(`global:announce`), `/announce command was not loaded.`);

	for (const command of loadCommandData(globalCommandsPath, { serverOnly: true })) {
		assert(command.integration_types?.length === 1 && command.integration_types[0] === 0, `/${command.name} should allow only server installation.`);
		assert(command.contexts?.length === 1 && command.contexts[0] === 0, `/${command.name} should allow only server-channel use.`);
	}
}

function validateOilRigLegend() {
	assert(legendLabel(`Oilrig Treasure Goal`, `Lv. 55 Oil Rig`) === `Oil Rig`);
	assert(legendLabel(`Oilrig Treasure Goal`, `Lv. 60 Oil Rig`) === `Oil Rig`);
	assert(legendLabel(`Enemy Camp`, `Enemy Camp`) === `Enemy Camps`);
}

function validateInstalledItemAuditFixture() {
	const fixtureItems = { Items: [
		{ id: `wood`, code: `Items/Wood`, name: `Wood`, properties: {}, recipes: [] },
		{ id: `hot-milk`, code: `Items/HotMilk`, name: `Hot Milk`, properties: {}, recipes: [{ ingredients: [{ name: `Wood`, quantity: `1` }] }] },
		{ id: `axe`, code: `Items/Axe`, name: `Axe`, merchantLocations: {}, properties: { bLegalInGame: 1 }, recipes: [{ ingredients: [{ name: `Wood`, quantity: `2` }] }] },
		{ id: `pick`, code: `Items/Pick`, name: `Pick`, properties: { bLegalInGame: 1 }, recipes: [] },
	] };
	const fixture = { buildId: `1`, tables: {
		_metadata: { candidateTables: 4, decodedTables: 3, decodedRows: 12, failedCandidates: 0 },
		items: { Axe: { bLegalInGame: true }, HotMilk: {}, Pick: { bLegalInGame: false }, Wood: {} },
		recipes: {
			Axe: { Product_Id: `Axe`, Product_Count: 1, Material1_Id: `Wood`, Material1_Count: 2 },
			Pick: { Product_Id: `Pick`, Product_Count: 1, Material1_Id: `Wood`, Material1_Count: 3 },
			Hotmilk: { Product_Id: `Hotmilk`, Product_Count: 1, Material1_Id: `Wood`, Material1_Count: 1 },
		},
		shopCreate: { GroupA: { productDataArray: [{ StaticItemId: `Axe`, ProductNum: 1 }] } },
		shopLottery: { PoolA: { lotteryDataArray: [{ ShopGroupName: `GroupA`, Weight: 100 }] } },
		shopSettings: { ShopA: { CurrencyItemID: `Wood` } },
	} };
	const report = compareGameItemData(fixtureItems, fixture);
	assert(report.summary.matchedRecipeItems === 2);
	assert(report.missingLocalRecipes[0].name === `Pick`);
	assert(report.legalityMismatches[0].name === `Pick`);
	assert(report.summary.shopProductItems === 1 && report.summary.randomizedShopItems === 1);
	assert(report.extraction.decodedTables === 3 && report.extraction.decodedRows === 12);
	assert(report.shops.currencies[0].itemId === `wood`);
	assert(report.gameOnlyRecipeProducts.length === 0, `Internal item-ID casing must not create game-only recipes.`);
	assert(report.localIdCasingMismatches.length === 0);
	assert(report.gameReferenceCasingMismatches.some(row => row.reference === `Hotmilk` && row.canonical === `HotMilk`));
}

function validateInstalledPalAuditFixture() {
	const pals = { Pals: [
		{ name: `Xenogard`, breeding: { id: `whitealiendragon`, canBeChild: true } },
		{ name: `Panthalus`, breeding: { id: `kingwhale`, canBeChild: true } },
		{ name: `Mau`, breeding: { id: `bastet`, canBeChild: true } },
	] };
	const snapshot = { tables: { _decodedTables: {
		"Pal/Content/Pal/DataTable/Incident/SupplyIncident/DT_SupplyIncident_Pal_Snow02": { A: { CharacterID: `BOSS_WhiteAlienDragon` } },
		"Pal/Content/Pal/DataTable/Spawner/DT_PalWildSpawner": { A: { SpawnerName: `50_1_dungeon_grass`, Pal_1: `Bastet` } },
	} } };
	const availability = compareGamePalAvailability(pals, snapshot);
	assert(availability.find(row => row.name === `Xenogard`).classifications.includes(`Meteor Event`));
	assert(availability.find(row => row.name === `Panthalus`).classifications.includes(`NPC Encounter`));
	assert(availability.find(row => row.name === `Mau`).classifications.includes(`Dungeon`));
	assert(!availability.find(row => row.name === `Mau`).classifications.includes(`Wild Spawner`));
}

function validateCuratedEncounterPublication() {
	const pals = require(`../data/palData.json`).Pals;
	for (const name of [`Xenovader`, `Xenogard`, `Selyne`, `Silvance`, `Dandilord`, `Panthalus`, `Astralym`, `Eidrolon`]) {
		const pal = pals.find(value => value.name === name);
		assert(pal && pal.habitat !== `data/maps/unknown-habitat.png` && fs.existsSync(resolveProject(pal.habitat)));
	}
	const missingMaps = pals.filter(pal => !pal.hidden && pal.habitat === `data/maps/unknown-habitat.png`);
	assert(missingMaps.length === 5 && missingMaps.every(pal => /Summoning altar|Raid\/Egg/iu.test(pal.spawnTime)));
	const expectedFooters = {
		Astralym: `Boss`, Dandilord: `Alpha Only`, Eidrolon: `Alpha/Dungeons`, "Katress Ignis": `Dungeons/Factions`, Panthalus: `Boss`, Silvance: `Alpha Only`,
		Xenogard: `Meteorite Event`, Xenovader: `Meteorite Event/Factions`,
	};
	for (const [name, footer] of Object.entries(expectedFooters)) {
		assert(pals.find(pal => pal.name === name)?.spawnTime === footer);
	}
	assert(!pals.some(pal => /Captured Cage/iu.test(pal.spawnTime)), `Pal footers must use the broader Factions label.`);
	const curatedHabitats = curatedPalHabitats(pals);
	assert(Object.values(curatedHabitats).filter(definition => definition.supplyPools).length === 3,
		`Supply Incident map pins must be restricted to Xenovader, Xenogard, and Selyne.`);
	assert(pals.find(pal => pal.name === `Anubis`)?.worldTreeDrops?.[`80`]);
	const items = require(`../utils/itemData.js`).resolvedItemData().Items;
	const raidRewardIds = [
		`head-equip001-purple`, `head-equip041`, `head-equip044`, `head-equip046`, `yakushima-head-equip005`,
		`pal-summon-yakushima-boss002-2`, `blueprint-yakushima-boss002-relic`,
	];
	for (const id of raidRewardIds) {
		assert(items.find(item => item.id === id)?.acquisition?.sources?.some(source => source.type === `Summoning Altar`));
	}
}

async function main() {
	ensureSmokeRuntimeConfig();
	await initializeSmokeSearchStorage();

	await test(`package metadata and lockfile are consistent`, validatePackageMetadata);
	await test(`required project files exist`, validateRequiredProjectFiles);
	await test(`commands load and serialize for Discord deployment`, validateCommandsLoad);
	await test(`Paldeck farmable search autocomplete stays prefix-free`, validatePaldeckFarmableSearch);
	await test(`Paldeck suitability autocomplete supports comma-separated all-of filters`, validatePaldeckSuitabilityListAutocomplete);
	await test(`Breed autocomplete uses palData breeding metadata`, validateBreedAutocompleteUsesPalData);
	await test(`Breed results use plain Pal names`, validateBreedResultsUsePlainNames);
	await test(`Paldeck breeding button opens parent results`, validatePaldeckBreedingButton);
	await test(`Paldeck learned-moves button opens level progression`, validatePaldeckLearnedMoves);
	await test(`Paldeck drop controls send public owned item lookups`, validatePaldeckDropLookup);
	await test(`Paldeck cards group Pal and Raid Boss drops`, validateGroupedPalDrops);
	await test(`Summoning Altar drop data covers every affected Pal lookup`, validateEncounterDropData);
	await test(`/item direct lookup opens Paldeck dropping-Pal results`, validateItemLookupAndDroppingPals);
	await test(`HTML text helpers decode before stripping tags`, validateHtmlTextHelpers);
	await test(`hidden Pal placeholders stay out of user-facing search`, validateHiddenPalPlaceholdersStayHidden);
	await test(`events load with valid handlers`, validateEventsLoad);
	await test(`announcement helpers parse and format patch notes`, validateAnnouncementHelpers);
	await test(`item-map deduplication compares bytes and fails before deletion`, validateMapDeduplicationSafety);
	await test(`direct messages forward verbatim with sender and owned-server context`, validateDmForwarding);
	await test(`database models include update announcement fields`, validateDatabaseModels);
	await test(`Paldeck data files remain valid`, validatePalData);
	await test(`oil-rig map levels share one legend label`, validateOilRigLegend);
	await test(`installed-game item audit compares decoded recipes and legality`, validateInstalledItemAuditFixture);
	await test(`installed-game Pal audit classifies event and curated encounters`, validateInstalledPalAuditFixture);
	await test(`curated encounter maps and raid rewards remain published`, validateCuratedEncounterPublication);
	await test(`CI workflow includes lint, smoke, and audit jobs`, validateCiWorkflow);
	await test(`GitHub Pages docs include theme and update links`, validateGithubPagesDocs);
	await test(`release workflow creates package-version GitHub releases`, validateReleaseWorkflow);
	await test(`config ID helpers normalize owner and guild IDs`, validateConfigValueHelpers);
	await test(`git hygiene checks pass`, () => validateGitHygiene(warn));

	if (sequelizeToClose) {
		await sequelizeToClose.close().catch(() => null);
	}

	console.log(``);
	console.log(`Smoke test complete: ${results.passed} passed, ${results.warned} warning(s), ${results.failed} failed.`);

	if (results.failed) {
		process.exitCode = 1;
	}
}

process.on(`exit`, cleanupSmokeRuntimeConfig);
process.on(`exit`, cleanupSmokeDatabase);

main().catch(error => {
	console.error(`[fail] smoke test crashed`);
	console.error(error);
	process.exitCode = 1;
});
