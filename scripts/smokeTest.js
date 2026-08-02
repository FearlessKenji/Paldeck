#!/usr/bin/env node

// Exercises command loading, rendered responses, data invariants, integrations, and repository hygiene.
const childProcess = require(`node:child_process`);
const fs = require(`node:fs`);
const os = require(`node:os`);
const path = require(`node:path`);
const { UNAVAILABLE_ITEM_IDS, needsAvailabilityReview, shouldHideItem } = require(`../utils/itemVisibility.js`);

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

function listFiles(directory, predicate = () => true) {
	if (!fs.existsSync(directory)) {
		return [];
	}

	const files = [];

	for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
		const fullPath = path.join(directory, entry.name);

		if (entry.isDirectory()) {
			files.push(...listFiles(fullPath, predicate));
		} else if (predicate(fullPath)) {
			files.push(fullPath);
		}
	}

	return files;
}

function runGit(args) {
	return childProcess.spawnSync(`git`, args, {
		cwd: projectRoot,
		encoding: `utf8`,
	});
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

async function validatePaldeckFarmableSearch() {
	const paldeck = requireFresh(`commands`, `globalCommands`, `utility`, `paldeck.js`);
	const searchCommand = paldeck.data.toJSON().options.find(option => option.name === `search`);
	const farmableOption = searchCommand?.options?.find(option => option.name === `farmable`);
	let autocompleteChoices = [];

	assert(farmableOption, `/paldeck search is missing the farmable option.`);
	assert(farmableOption.autocomplete === true, `/paldeck search farmable should use autocomplete.`);

	await paldeck.autocomplete({
		options: {
			getFocused: () => ({ name: `farmable`, value: `oil` }),
		},
		respond: choices => {
			autocompleteChoices = choices;
		},
	});

	assert(autocompleteChoices.some(choice => choice.value === `High Quality Pal Oil`), `Farmable autocomplete did not include High Quality Pal Oil.`);
	assert(
		autocompleteChoices.every(choice => !choice.name.startsWith(`Yes - `) && !choice.value.startsWith(`Yes - `)),
		`Farmable autocomplete should not include the Yes - prefix.`,
	);
}

async function validatePaldeckSuitabilityListAutocomplete() {
	const paldeck = requireFresh(`commands`, `globalCommands`, `utility`, `paldeck.js`);
	const searchCommand = paldeck.data.toJSON().options.find(option => option.name === `search`);
	const suitabilityOption = searchCommand?.options?.find(option => option.name === `suitability`);
	let autocompleteChoices = [];

	assert(suitabilityOption, `/paldeck search is missing the suitability option.`);
	assert(
		suitabilityOption.description.toLowerCase().includes(`comma-separated`),
		`/paldeck search should explain that suitability accepts a comma-separated list.`,
	);

	await paldeck.autocomplete({
		options: {
			getFocused: () => ({ name: `suitability`, value: `Mining 2, hand` }),
		},
		respond: choices => {
			autocompleteChoices = choices;
		},
	});

	assert(
		autocompleteChoices.some(choice =>
			choice.name === `Mining 2, Handiwork 1` &&
			choice.value === `Mining 2, Handiwork 1`,
		),
		`Suitability autocomplete should preserve completed filters in both the displayed and submitted choice.`,
	);
	assert(
		autocompleteChoices.every(choice =>
			choice.name.startsWith(`Mining 2, `) &&
			choice.value.startsWith(`Mining 2, `),
		),
		`Suitability autocomplete dropped a completed filter from a choice label or value.`,
	);
	assert(
		autocompleteChoices.every(choice => !choice.value.slice(`Mining 2, `.length).startsWith(`Mining`)),
		`Suitability autocomplete should not suggest a suitability that is already selected.`,
	);
}

async function validateBreedAutocompleteUsesPalData() {
	const breed = requireFresh(`commands`, `globalCommands`, `utility`, `breed.js`);
	let autocompleteChoices = [];

	await breed.autocomplete({
		options: {
			getFocused: () => ({ name: `parent1`, value: `xeno` }),
		},
		respond: choices => {
			autocompleteChoices = choices;
		},
	});

	assert(autocompleteChoices.some(choice => choice.value === `Xenovader`), `Breed parent autocomplete did not include Xenovader from palData.`);
	assert(autocompleteChoices.some(choice => choice.name === `Xenovader`), `Breed parent autocomplete should display plain Pal names.`);
	assert(
		autocompleteChoices.every(choice => !/\bTechnology\s+\d+\b/i.test(choice.name)),
		`Breed parent autocomplete should not expose Technology unlock text.`,
	);
}

function serializeDiscordPayload(payload) {
	return JSON.stringify(payload, (key, value) => {
		if (value && typeof value.toJSON === `function`) {
			return value.toJSON();
		}

		return value;
	});
}

async function runBreedCommand(breed, subcommand, values) {
	let replyPayload = null;

	await breed.execute({
		options: {
			getString: name => values[name],
			getSubcommand: () => subcommand,
		},
		reply: payload => {
			replyPayload = payload;
		},
		user: {
			id: `smoke-test-user`,
		},
	});

	return replyPayload;
}

async function validateBreedResultsUsePlainNames() {
	const breed = requireFresh(`commands`, `globalCommands`, `utility`, `breed.js`);
	const numberPrefixedPalPattern = /#\d{1,3}[A-Z]?\s+[A-Za-z]/;
	const formulaDetailLabels = [
		`Child Rank`,
		`Gender-specific known result`,
		`Method`,
		`Parent Ranks`,
		`Same species`,
		`Source override`,
		`Standard rank`,
		`Target rank`,
		`Unique combination`,
	];
	const resultPayload = await runBreedCommand(breed, `result`, {
		parent1: `Lamball`,
		parent2: `Lamball`,
	});
	const uniqueResultPayload = await runBreedCommand(breed, `result`, {
		parent1: `Relaxaurus`,
		parent2: `Sparkit`,
	});
	const parentsPayload = await runBreedCommand(breed, `parents`, {
		child: `Lamball`,
	});
	const uniqueParentsPayload = await runBreedCommand(breed, `parents`, {
		child: `Relaxaurus Lux`,
	});
	const partnerPayload = await runBreedCommand(breed, `partner`, {
		child: `Lamball`,
		parent: `Lamball`,
	});
	const uniquePartnerPayload = await runBreedCommand(breed, `partner`, {
		child: `Relaxaurus Lux`,
		parent: `Relaxaurus`,
	});
	const serializedOutput = [
		serializeDiscordPayload(resultPayload),
		serializeDiscordPayload(uniqueResultPayload),
		serializeDiscordPayload(parentsPayload),
		serializeDiscordPayload(uniqueParentsPayload),
		serializeDiscordPayload(partnerPayload),
		serializeDiscordPayload(uniquePartnerPayload),
	].join(`\n`);

	assert(resultPayload?.embeds?.length, `/breed result did not produce an embed.`);
	assert(uniqueResultPayload?.embeds?.length, `/breed result did not produce a unique-combination embed.`);
	assert(parentsPayload?.embeds?.length, `/breed parents did not produce an embed.`);
	assert(uniqueParentsPayload?.embeds?.length, `/breed parents did not produce a unique-combination embed.`);
	assert(partnerPayload?.embeds?.length, `/breed partner did not produce an embed.`);
	assert(uniquePartnerPayload?.embeds?.length, `/breed partner did not produce a unique-combination embed.`);
	assert(serializedOutput.includes(`Lamball`), `/breed command smoke output should include the test Pal name.`);
	assert(!numberPrefixedPalPattern.test(serializedOutput), `/breed results should show plain Pal names without number prefixes.`);
	for (const label of formulaDetailLabels) {
		assert(!serializedOutput.includes(label), `/breed results should not show formula detail label: ${label}.`);
	}
}

async function validatePaldeckBreedingButton() {
	const paldeck = requireFresh(`commands`, `globalCommands`, `utility`, `paldeck.js`);
	const breed = requireFresh(`commands`, `globalCommands`, `utility`, `breed.js`);
	let paldeckPayload = null;
	let breedingPayload = null;

	await paldeck.execute({
		options: {
			getString: () => `Lamball`,
			getSubcommand: () => `name`,
		},
		reply: payload => {
			paldeckPayload = payload;
		},
		deferReply: () => undefined,
		editReply: payload => {
			paldeckPayload = payload;
		},
		user: {
			id: `smoke-test-user`,
		},
	});

	const serializedPaldeck = serializeDiscordPayload(paldeckPayload);
	const buttonCustomId = paldeckPayload?.components?.[0]?.components?.[0]?.data?.custom_id;

	assert(buttonCustomId === `breed:parents:Lamball`, `/paldeck should include a breeding-parent button for the displayed Pal.`);
	assert(serializedPaldeck.includes(`Breeding Parents`), `/paldeck breeding-parent button should have a clear label.`);
	assert(!serializedPaldeck.includes(`palworld.gg/breeding-calculator`), `/paldeck rarity should not link to an external breeding calculator.`);
	assert(serializedPaldeck.includes(`palworld.fandom.com/wiki/Lamball`), `/paldeck Pal name should retain its Fandom wiki link.`);
	assert(serializedPaldeck.includes(`Wool ×1–3: 100%`), `/paldeck should show structured drop quantities and probabilities with colons.`);

	await breed.handleButton({
		customId: buttonCustomId,
		reply: payload => {
			breedingPayload = payload;
		},
		user: {
			id: `smoke-test-user`,
		},
	});

	const serializedBreeding = serializeDiscordPayload(breedingPayload);

	assert(breedingPayload?.embeds?.length, `/paldeck breeding-parent button did not produce an embed.`);
	assert(serializedBreeding.includes(`Parent pairs that produce Lamball.`), `/paldeck breeding-parent button returned the wrong child results.`);
}

async function validateGroupedPalDrops() {
	const paldeck = requireFresh(`commands`, `globalCommands`, `utility`, `paldeck.js`);
	const render = async name => {
		let payload;
		await paldeck.execute({
			options: { getString: () => name, getSubcommand: () => `name` },
			reply: value => { payload = value; },
			deferReply: () => undefined,
			editReply: value => { payload = value; },
			user: { id: `grouped-drop-owner` },
		});
		return serializeDiscordPayload(payload);
	};
	const dandilord = await render(`Dandilord`);
	const bellanoir = await render(`Bellanoir`);
	const bellanoirLibero = await render(`Bellanoir Libero`);
	const blazamutRyu = await render(`Blazamut Ryu`);
	const xenolord = await render(`Xenolord`);
	const hartalis = await render(`Hartalis`);
	const lamball = await render(`Lamball`);

	assert(lamball.includes(`Pal Drops — Alpha`), `Lamball should identify its Alpha drop table.`);
	assert(
		lamball.match(/Wool ×1–3: 100%/g)?.length === 2 &&
		lamball.match(/Lamball Mutton ×1: 100%/g)?.length === 2,
		`Lamball's Alpha table should repeat its inherited normal drops.`,
	);
	assert(lamball.includes(`Ancient Civilization Parts ×1–2: 100%`) && lamball.includes(`Precious Pelt ×1–2: 100%`), `Lamball's Alpha table should include its Alpha-only drops.`);
	assert(dandilord.includes(`Pal Drops — Normal`) && dandilord.includes(`Pal Drops — World Tree: Lvl 70`), `Dandilord should separate normal and World Tree Pal drops.`);
	assert(dandilord.includes(`Ancient Civilization Core ×1: 100%`), `Dandilord should show its butcherable Ancient Civilization Core drop.`);
	assert(
		dandilord.includes(`Pal Drops — Story Boss: Lvl 78`) &&
		dandilord.includes(`Dandilord's Petal ×1: 100%`),
		`Dandilord should combine its boss rows and show its progression drop once.`,
	);
	assert(dandilord.match(/Dandilord's Petal/g)?.length === 1, `Dandilord's Petal should not be duplicated outside the Boss group.`);
	assert(
		dandilord.includes(`Decayed Ancient Relic ×1–10: 10%`) &&
		dandilord.includes(`Dormant Ancient Relic ×1–5: 5%`),
		`Detailed Pal cards should keep Ancient Relic tiers separate when their drop rates differ.`,
	);
	assert(!dandilord.includes(`• Ancient Relics`), `Detailed Pal cards should not flatten percentage-bearing Ancient Relic rows.`);
	assert(bellanoir.includes(`Pal Drops — Normal`) && bellanoir.includes(`Dark Fragment ×2–3: 100%`), `Bellanoir should retain its normal captured-Pal drops.`);
	assert(bellanoir.includes(`Pal Drops — Alpha`), `Bellanoir should keep its Alpha drops separate from Summoning Altar rewards.`);
	assert(bellanoir.includes(`Pal Drops — Summoning Altar: Lvl 35`), `Bellanoir should separate Summoning Altar rewards.`);
	assert(bellanoir.includes(`Huge Dark Egg (Bellanoir) ×1: 100%`), `Bellanoir's Raid Boss rewards should include its guaranteed egg.`);
	assert(bellanoir.includes(`Ancient Civilization Core ×1–3: 100%`), `Bellanoir should use its complete current Summoning Altar table.`);
	assert(
		bellanoirLibero.includes(`Pal Drops — Summoning Altar: Lvl 45`) &&
		bellanoirLibero.includes(`Pal Drops — Summoning Altar: Lvl 80 (Ultra)`),
		`Bellanoir Libero should show both its base and Ultra Summoning Altar tables.`,
	);
	assert(bellanoirLibero.includes(`Witch's Crown ×1: 100%`), `Bellanoir Libero's Ultra table should include Witch's Crown.`);
	for (const [name, card, egg, ultraReward] of [
		[`Blazamut Ryu`, blazamutRyu, `Huge Dragon Egg (Blazamut Ryu)`, `Horns of Supremacy`],
		[`Xenolord`, xenolord, `Huge Dark Egg (Xenolord)`, `Xenolord's head`],
		[`Hartalis`, hartalis, `Huge Common Egg (Hartalis)`, `Crown of Salvation`],
	]) {
		assert(
			card.includes(`Pal Drops — Summoning Altar`) && card.includes(`Pal Drops — Summoning Altar: Lvl 80 (Ultra)`),
			`${name} should show both its base and Ultra Summoning Altar tables.`,
		);
		assert(card.includes(`${egg} ×1: 100%`), `${name}'s Summoning Altar tables should include its guaranteed egg.`);
		assert(card.includes(`${ultraReward} ×1: 100%`), `${name}'s Ultra table should include ${ultraReward}.`);
	}
}

function validateEncounterDropData() {
	const encounterFile = requireFresh(`data`, `palEncounterData.json`);
	const palFile = requireFresh(`data`, `palData.json`);
	const visibleNames = new Set(palFile.Pals.filter(pal => !pal.hidden).map(pal => pal.name));
	const keys = new Set();
	const affectedPals = new Set();

	for (const encounter of encounterFile.Encounters) {
		const key = `${encounter.pal}\0${encounter.source}\0${encounter.level}\0${encounter.variant || ``}`;
		assert(visibleNames.has(encounter.pal), `Encounter drops reference unknown Pal ${encounter.pal}.`);
		assert(!keys.has(key), `Encounter drops contain duplicate source ${key}.`);
		assert(encounter.source === `Summoning Altar`, `${encounter.pal} has an unsupported encounter source.`);
		assert(Number.isInteger(encounter.level) && encounter.level > 0, `${encounter.pal} encounter is missing a valid level.`);
		assert(encounter.drops.length > 0, `${encounter.pal} encounter has no drops.`);
		assert(encounter.drops.every(drop => drop.item && drop.quantity && drop.probability), `${encounter.pal} encounter has an incomplete drop row.`);
		assert(encounter.drops.some(drop => / Egg \(/.test(drop.item) && drop.probability === `100%`), `${encounter.pal} encounter is missing its guaranteed egg.`);
		keys.add(key);
		affectedPals.add(encounter.pal);
	}

	assert(affectedPals.size === 5, `Expected five Pal lookups with Summoning Altar reward tables.`);
}

async function validatePaldeckDropLookup() {
	const paldeck = requireFresh(`commands`, `globalCommands`, `utility`, `paldeck.js`);
	const itemCommand = requireFresh(`commands`, `globalCommands`, `utility`, `item.js`);
	let paldeckPayload = null;
	let menuPayload = null;
	let itemPayload = null;
	let unauthorizedPayload = null;
	let restoredPalPayload = null;
	let droppingPalsPayload = null;

	await paldeck.execute({
		options: {
			getString: () => `Lamball`,
			getSubcommand: () => `name`,
		},
		reply: payload => {
			paldeckPayload = payload;
		},
		deferReply: () => undefined,
		editReply: payload => {
			paldeckPayload = payload;
		},
		user: { id: `drop-owner` },
	});

	const dropButton = paldeckPayload.components[0].components.find(component => component.data.label === `Look Up Drops`);

	assert(dropButton, `Lamball's Pal lookup should include a Look Up Drops button.`);
	await paldeck.handleButton({
		customId: dropButton.data.custom_id,
		message: { components: paldeckPayload.components },
		update: payload => {
			menuPayload = payload;
		},
		user: { id: `drop-owner` },
	});

	const menu = menuPayload?.components?.[1]?.components?.[0];
	const menuData = menu?.toJSON?.() || menu?.data;
	const menuBackButton = menuPayload?.components?.[2]?.components?.[0];

	assert(menuData?.options?.some(option => option.label === `Wool`), `Lamball's drop menu should include Wool.`);
	assert(menuBackButton?.data?.label === `Back to Pal`, `The Pal drop menu should include Back to Pal navigation.`);
	await paldeck.handleSelectMenu({
		customId: menuData.custom_id,
		reply: payload => {
			itemPayload = payload;
		},
		user: { id: `drop-owner` },
		values: [`wool`],
	});

	const serializedItem = serializeDiscordPayload(itemPayload);

	assert(itemPayload?.embeds?.length, `Selecting Wool should send an item embed.`);
	assert(!itemPayload.flags, `Successful drop item lookups should be public.`);
	assert(serializedItem.includes(`Drop Chance: **100%**`), `Wool should show its Lamball drop chance.`);
	assert(serializedItem.includes(`Quantity: **1–3**`), `Wool should show its Lamball drop quantity.`);
	assert(!serializedItem.includes(`Items/Wool`) && !serializedItem.includes(`paldb.cc`), `Item embeds should hide internal codes and PalDB links.`);
	const itemBackButton = itemPayload.components[0].components.find(component => component.data.label === `Back to Pal`);
	const droppingPalsButton = itemPayload.components[0].components.find(component => component.data.label === `View Dropping Pals`);

	assert(itemBackButton, `Items opened from a Pal should retain Back to Pal navigation.`);
	await itemCommand.handleButton({
		customId: droppingPalsButton.data.custom_id,
		reply: payload => {
			droppingPalsPayload = payload;
		},
		user: { id: `drop-owner` },
	});
	assert(
		serializeDiscordPayload(droppingPalsPayload).includes(`Back to Pal`),
		`Dropping-Pal results should retain Back to Pal when reached from a Pal lookup.`,
	);
	await paldeck.handleButton({
		customId: itemBackButton.data.custom_id,
		update: payload => {
			restoredPalPayload = payload;
		},
		user: { id: `drop-owner` },
	});
	assert(serializeDiscordPayload(restoredPalPayload).includes(`Lamball`), `Back to Pal should restore the originating Pal card.`);

	await paldeck.handleSelectMenu({
		customId: menuData.custom_id,
		reply: payload => {
			unauthorizedPayload = payload;
		},
		user: { id: `someone-else` },
		values: [`wool`],
	});

	assert(unauthorizedPayload?.content === `I'm not your button, pal!`, `Unauthorized drop controls should use the requested response.`);
}

async function validateItemLookupAndDroppingPals() {
	const itemCommand = requireFresh(`commands`, `globalCommands`, `utility`, `item.js`);
	const paldeck = requireFresh(`commands`, `globalCommands`, `utility`, `paldeck.js`);
	const { resolvedItemData } = requireFresh(`utils`, `itemData.js`);
	const itemData = resolvedItemData();
	let choices = [];
	let itemPayload = null;
	let resultsPayload = null;
	let unauthorizedPayload = null;

	await itemCommand.autocomplete({
		options: { getFocused: () => `wool` },
		respond: payload => {
			choices = payload;
		},
	});
	assert(choices.some(choice => choice.name === `Wool` && choice.value === `Wool`), `/item autocomplete should show only the plain Wool name.`);
	assert(choices.every(choice => !choice.name.includes(` — `)), `/item autocomplete should not show rarity or category labels.`);

	await itemCommand.autocomplete({
		options: { getFocused: () => `ballistic` },
		respond: payload => {
			choices = payload;
		},
	});
	assert(!choices.some(choice => choice.name === `Ballistic Shield`), `/item autocomplete should hide WIP items.`);

	await itemCommand.autocomplete({
		options: { getFocused: () => `ultra slab fragment` },
		respond: payload => {
			choices = payload;
		},
	});
	assert(!choices.some(choice => /\(Ultra\) Slab Fragment$/i.test(choice.name)), `/item autocomplete should hide unused Ultra slab fragment definitions.`);

	await itemCommand.autocomplete({
		options: { getFocused: () => `journals` },
		respond: payload => {
			choices = payload;
		},
	});
	assert(
		[`Palpagos Journals`, `World Tree Journals`].every(name => choices.some(choice => choice.name === name)),
		`/item autocomplete should expose both curated journal collections.`,
	);
	await itemCommand.autocomplete({
		options: { getFocused: () => `bjorn seligsson` },
		respond: payload => {choices = payload;},
	});
	assert(choices.some(choice => choice.name === `Bjorn Seligsson's Diary - 1`), `/item autocomplete should expose individual journals.`);

	await itemCommand.execute({
		options: { getString: name => name === `name` ? `Wool` : `Legendary` },
		reply: payload => {
			itemPayload = payload;
		},
		deferReply: () => undefined,
		editReply: payload => {
			itemPayload = payload;
		},
		user: { id: `item-owner` },
	});

	const serializedItem = serializeDiscordPayload(itemPayload);
	const dropButton = itemPayload?.components?.[0]?.components?.[0];

	assert(serializedItem.includes(`Wool`), `/item should send the selected item embed.`);
	assert(serializedItem.includes(`Rarity: Common`), `/item should fall back to basic Wool when the requested rarity does not exist.`);
	assert(!serializedItem.includes(`Dropped By`), `/item should not list dropping Pals in the item embed.`);
	assert(dropButton?.data?.label === `View Dropping Pals`, `Droppable items should include a View Dropping Pals button.`);
	assert(!serializedItem.includes(`Back to Pal`), `Direct /item lookups should not include Back to Pal navigation.`);

	await itemCommand.handleButton({
		customId: dropButton.data.custom_id,
		reply: payload => {
			resultsPayload = payload;
		},
		user: { id: `item-owner` },
	});

	const serializedResults = serializeDiscordPayload(resultsPayload);

	assert(resultsPayload?.embeds?.length, `View Dropping Pals should send a Paldeck search embed.`);
	assert(serializedResults.includes(`Lamball`), `Wool's dropping-Pal results should include Lamball.`);
	assert(/Drops:\s+Wool/.test(serializedResults), `Dropping-Pal results should identify the selected item filter.`);

	await itemCommand.handleButton({
		customId: dropButton.data.custom_id,
		reply: payload => {
			unauthorizedPayload = payload;
		},
		user: { id: `someone-else` },
	});
	assert(unauthorizedPayload?.content === `I'm not your button, pal!`, `Unauthorized item controls should use the requested response.`);

	const merchantItem = itemData.Items.find(item => item.name === `Ground Skill Fruit: Sand Tornado` && item.merchantLocations);
	const merchantItemResponse = paldeck.buildItemResponse(merchantItem, null, `item-owner`);
	const merchantButton = merchantItemResponse.components[0].components.find(component => component.data.label === `Merchant Locations`);
	let merchantPayload = null;
	assert(merchantButton, `Items sold by fixed merchants should include a Merchant Locations button.`);
	await itemCommand.handleButton({
		customId: merchantButton.data.custom_id,
		reply: payload => {
			merchantPayload = payload;
		},
		user: { id: `item-owner` },
	});
	assert(merchantPayload?.flags === undefined, `Merchant-location responses should remain visible in the channel.`);
	assert(serializeDiscordPayload(merchantPayload).includes(`Duneshelter Merchant`), `Merchant-location responses should name the applicable fixed merchant.`);
	assert(merchantPayload.files.length === 2, `Merchant-location responses should attach the item thumbnail and merchant map.`);

	const dogCoin = itemData.Items.find(item => item.name === `Dog Coin`);
	const dogCoinResponseWithButtons = paldeck.buildItemResponse(dogCoin, null, `item-owner`);
	const medalMerchantButton = dogCoinResponseWithButtons.components[0].components.find(component => component.data.label === `Medal Merchants`);
	let medalMerchantPayload = null;
	assert(medalMerchantButton, `Dog Coin should include a Medal Merchants button.`);
	await itemCommand.handleButton({
		customId: medalMerchantButton.data.custom_id,
		reply: payload => { medalMerchantPayload = payload; },
		user: { id: `item-owner` },
	});
	assert(medalMerchantPayload?.flags === undefined, `Medal Merchant locations should remain visible in the channel.`);
	assert(
		serializeDiscordPayload(medalMerchantPayload).includes(`Desolate Church`) && medalMerchantPayload.files.length === 2,
		`Medal Merchant responses should name fixed locations and attach the item thumbnail and map.`,
	);
	assert(dogCoin.recipes.length === 0, `Medal Merchant purchases must not appear as Dog Coin crafting recipes.`);

	const assaultRifle = itemData.Items.find(item => item.name === `Assault Rifle` && item.rarity === `Common`);
	const attackPendant = itemData.Items.find(item => item.name === `Attack Pendant`);
	const memoryWipingMedicine = itemData.Items.find(item => item.name === `Memory Wiping Medicine`);
	const bellanoirFragment = itemData.Items.find(item => item.name === `Bellanoir's Slab Fragment`);
	const serializedRifle = serializeDiscordPayload(paldeck.buildItemResponse(assaultRifle, null, `item-owner`));
	const accessoryResponse = paldeck.buildItemResponse(attackPendant, null, `item-owner`);
	const serializedAccessory = serializeDiscordPayload(accessoryResponse);
	const serializedMedicine = serializeDiscordPayload(paldeck.buildItemResponse(memoryWipingMedicine, null, `item-owner`));
	const ancientWeapon = itemData.Items.find(item => item.name === `Mechanical Bow` && item.rarity === `Common`);
	const ancientIngot = itemData.Items.find(item => item.name === `Paloxite Ingot`);
	const ancientFood = itemData.Items.find(item => item.name === `Special Cake`);
	const serializedAncientWeapon = serializeDiscordPayload(paldeck.buildItemResponse(ancientWeapon, null, `item-owner`));
	const serializedAncientIngot = serializeDiscordPayload(paldeck.buildItemResponse(ancientIngot, null, `item-owner`));
	const serializedAncientFood = serializeDiscordPayload(paldeck.buildItemResponse(ancientFood, null, `item-owner`));
	const accessoryEffect = accessoryResponse.embeds[0].toJSON().fields.find(field => field.name === `Accessory Effect:`);
	const fragmentResponse = paldeck.buildItemResponse(bellanoirFragment, null, `item-owner`);
	const serializedFragment = serializeDiscordPayload(fragmentResponse);
	const serializedSlab = serializeDiscordPayload(paldeck.buildItemResponse(itemData.Items.find(item => item.name === `Xenolord Slab`), null, `item-owner`));
	const ominousEggResponse = paldeck.buildItemResponse(itemData.Items.find(item => item.name === `Ominous Egg`), null, `item-owner`);
	const peachResponse = paldeck.buildItemResponse(itemData.Items.find(item => item.name === `Kinship Peach`), null, `item-owner`);
	const treasureMapResponse = paldeck.buildItemResponse(itemData.Items.find(item => item.name === `Treasure Map`), null, `item-owner`);
	const ruinSchematicResponse = paldeck.buildItemResponse(itemData.Items.find(item => item.name === `Pelt Armor Schematic 3`), null, `item-owner`);
	const ancientBoneResponse = paldeck.buildItemResponse(itemData.Items.find(item => item.name === `Ancient Bone`), null, `item-owner`);
	const ancientBarkResponse = paldeck.buildItemResponse(itemData.Items.find(item => item.name === `Ancient Bark`), null, `item-owner`);
	const ancientLavaResponse = paldeck.buildItemResponse(itemData.Items.find(item => item.name === `Ancient Lava`), null, `item-owner`);
	const dogCoinResponse = paldeck.buildItemResponse(itemData.Items.find(item => item.name === `Dog Coin`), null, `item-owner`);
	const singleSalvageResponse = paldeck.buildItemResponse(
		itemData.Items.find(item => item.name === `Beginner Fishing Rod (Gumoss) Schematic`),
		null,
		`item-owner`,
	);
	const ancientSphereResponse = paldeck.buildItemResponse(itemData.Items.find(item => item.name === `Ancient Sphere`), null, `item-owner`);
	const solSphereResponse = paldeck.buildItemResponse(itemData.Items.find(item => item.name === `Sol Sphere`), null, `item-owner`);
	const coalResponse = paldeck.buildItemResponse(itemData.Items.find(item => item.name === `Coal`), null, `item-owner`);
	const effigyResponse = paldeck.buildItemResponse(itemData.Items.find(item => item.name === `Lifmunk Effigy`), null, `item-owner`);
	const bountyResponse = paldeck.buildItemResponse(itemData.Items.find(item => item.name === `Successful Bounty Token`), null, `item-owner`);
	const keySphereResponse = paldeck.buildItemResponse(itemData.Items.find(item => item.name === `Key Sphere of Envy`), null, `item-owner`);
	const skillFruitResponse = paldeck.buildItemResponse(itemData.Items.find(item => item.name === `Ground Skill Fruit: Sand Tornado`), null, `item-owner`);
	const relicResponse = paldeck.buildItemResponse(itemData.Items.find(item => item.name === `Glistening Ancient Relic`), null, `item-owner`);
	const journalResponses = [`Palpagos Journals`, `World Tree Journals`]
		.map(name => paldeck.buildItemResponse(itemData.Items.find(item => item.name === name), null, `item-owner`));
	const individualJournalResponses = [`Bjorn Seligsson's Diary - 1`, `Ancient Recorder`]
		.map(name => paldeck.buildItemResponse(itemData.Items.find(item => item.name === name), null, `item-owner`));
	const serializedOminousEgg = serializeDiscordPayload(ominousEggResponse);
	const serializedPeach = serializeDiscordPayload(peachResponse);
	const serializedTreasureMap = serializeDiscordPayload(treasureMapResponse);
	const serializedRuinSchematic = serializeDiscordPayload(ruinSchematicResponse);
	const serializedAncientBone = serializeDiscordPayload(ancientBoneResponse);
	const serializedAncientBark = serializeDiscordPayload(ancientBarkResponse);
	const serializedAncientLava = serializeDiscordPayload(ancientLavaResponse);
	const serializedDogCoin = serializeDiscordPayload(dogCoinResponse);
	const serializedSingleSalvage = serializeDiscordPayload(singleSalvageResponse);
	const serializedAncientSphere = serializeDiscordPayload(ancientSphereResponse);
	const serializedSolSphere = serializeDiscordPayload(solSphereResponse);
	const slabItems = itemData.Items.filter(item => /\bSlab(?: Fragment)?$/i.test(item.name));
	const obtainableSlabItems = slabItems.filter(item => !/\(Ultra\) Slab Fragment$/i.test(item.name));
	const unusedUltraFragments = slabItems.filter(item => /\(Ultra\) Slab Fragment$/i.test(item.name));

	assert(serializedRifle.includes(`Ammo Type:`) && serializedRifle.includes(`Assault Rifle Ammo`), `Applicable weapons should show their ammo type.`);
	assert(serializedRifle.includes(`Magazine Size`) && serializedRifle.includes(`20`), `Applicable weapons should show magazine size in Stats.`);
	assert(serializedRifle.includes(`Workbench:`) && serializedRifle.includes(`Weapon Assembly Line`), `Crafted items should show only their minimum compatible workbench.`);
	assert(!serializedRifle.includes(`Rank Max`) && !serializedRifle.includes(`Compatible Workbenches`), `Workbench fields should omit derivation details and alternate stations.`);
	assert(accessoryEffect?.value === `Attack Up Lv. 3`, `Accessories should show their localized effect in the dedicated field.`);
	assert(!serializedAccessory.includes(`Stats:`), `Accessory Effect should replace the generic Stats field.`);
	assert(!serializedMedicine.includes(`Medicine Effect:`), `Medicine Effect should be omitted when it duplicates the description.`);
	assert(serializedAncientWeapon.includes(`Workbench:`) && serializedAncientWeapon.includes(`Ancient Workbench`), `Rank-ten recipes should use the Ancient Workbench.`);
	assert(serializedAncientIngot.includes(`Workbench:`) && serializedAncientIngot.includes(`Ancient Furnace`), `Rank-seven ingot recipes should use the Ancient Furnace.`);
	assert(serializedAncientFood.includes(`Workbench:`) && serializedAncientFood.includes(`Ancient Kitchen`), `Rank-five cooked-food recipes should use the Ancient Kitchen.`);
	assert(obtainableSlabItems.length === 14 && obtainableSlabItems.every(item => item.acquisition), `All 14 obtainable slabs and fragments should embed acquisition data.`);
	assert(
		unusedUltraFragments.length === 4 &&
		unusedUltraFragments.every(item => item.searchable === false && !item.acquisition),
		`Unused Ultra fragment definitions should remain hidden and have no acquisition data.`,
	);
	assert(serializedFragment.includes(`Sources:`) && serializedFragment.includes(`Treasure Chests`), `Slab fragments should render their treasure-chest sources.`);
	assert(!serializedFragment.includes(`Source —`), `Item acquisition field names should not repeat Source with an em dash.`);
	assert(serializedSlab.includes(`Workbench:`) && serializedSlab.includes(`Primitive Workbench`), `Rank-one general recipes should show Primitive Workbench.`);
	assert(serializedFragment.includes(`Forest Dungeon or Sanctuary ×1: 50%`), `Slab source entries should render quantity and colon-separated probability.`);
	assert(
		fragmentResponse.embeds[0].toJSON().image?.url === `attachment://${path.basename(bellanoirFragment.acquisition.map)}`,
		`Mapped slab items should use the acquisition map as the embed image.`,
	);
	assert(fragmentResponse.files.length === 2, `Mapped slab items should attach both the item thumbnail and acquisition map.`);
	const fixedLocationCases = [
		[`Ominous Egg`, serializedOminousEgg, `30 World Tree egg spawns`],
		[`Kinship Peach`, serializedPeach, `22 Palpagos locations`],
		[`Treasure Map`, serializedTreasureMap, `42 Palpagos locations`],
		[`Ancient Bone`, serializedAncientBone, `10 Palpagos locations`],
		[`Ancient Bark`, serializedAncientBark, `10 Palpagos locations`],
		[`Ancient Lava`, serializedAncientLava, `10 Palpagos locations`],
	];
	for (const [name, payload, expected] of fixedLocationCases) {
		assert(payload.includes(expected), `${name} should show its verified fixed-location count.`);
	}
	assert(serializedRuinSchematic.includes(`Sources:`) && serializedRuinSchematic.includes(`Ancient Ruin`), `Ancient Ruin schematics should show their fixed source.`);
	const sourceSummaryCases = [
		[`Dog Coin`, serializedDogCoin, [`Sources:`, `Junk`, `Salvage`, `Elemental Chests`, `Oil Rigs`, `Expeditions`], [`Salvage Rank`]],
		[`Single-source salvage item`, serializedSingleSalvage, [`Sources:`, `Salvage`], [`Salvage Rank`]],
		[`Ancient Sphere`, serializedAncientSphere, [`Sources:`, `Fishing`, `Junk`, `Treasure Chests`, `Expeditions`, `Ground Spawns`], [`World Tree Fishing:`]],
	];
	for (const [name, payload, included, excluded] of sourceSummaryCases) {
		assert(included.every(value => payload.includes(value)) && excluded.every(value => !payload.includes(value)), `${name} should use canonical player-facing source names.`);
	}
	assert(ancientSphereResponse.files.length === 2, `Ancient Sphere should attach its combined Sunreach and World Tree source map.`);
	assert(
		serializedSolSphere.includes(`Sources:`) &&
		serializedSolSphere.includes(`Junk`) &&
		serializedSolSphere.includes(`Supply Drops`) &&
		serializedSolSphere.includes(`Treasure Chests`) &&
		solSphereResponse.files.length === 2,
		`Sol Sphere should include its Sky Island loot sources and map.`,
	);
	assert(serializeDiscordPayload(coalResponse).includes(`553 Palpagos locations`), `Coal should combine normal resource nodes and clusters.`);
	for (const [index, response] of journalResponses.entries()) {
		const payload = serializeDiscordPayload(response);
		const expectedLocation = index ? `9 World Tree locations` : `55 Palpagos locations`;
		assert(
			payload.includes(`Category:`) && payload.includes(`Collectible`) &&
			payload.includes(`Sources:`) && payload.includes(expectedLocation) &&
			(payload.match(/N\/A/gu) || []).length >= 4 && response.files.length === 2,
			`${index ? `World Tree` : `Palpagos`} Journals should use the standard item card with N/A fields and a map.`,
		);
	}
	const journalEntries = itemData.Items.filter(item => item.journalEntry);
	const regionalChestRules = [
		[`SkyIsland_Treasure`, `palpagos`, `76 Sunreach chest locations`, marker => marker.href === `SkyIsland_Treasure`],
		[`WorldTree_Treasure`, `worldtree`, `38 World Tree chest locations`, marker => marker.locationSet === `worldTreeTreasureChests`],
	];
	for (const item of itemData.Items) {
		for (const [pool, map, location, matchesMarker] of regionalChestRules) {
			if (!item.acquisition?.lootPools?.some(entry => entry.pool === pool)) {
				continue;
			}
			const treasure = item.acquisition.sources?.find(source => source.type === `Treasure`);
			const panels = item.acquisition.mapSources?.maps || (item.acquisition.mapSources?.map ? [item.acquisition.mapSources] : []);
			assert(treasure?.entries.some(entry => entry.location === location), `${item.name} should derive its ${pool} source.`);
			assert(!item.acquisition.map || panels.some(panel => panel.map === map && panel.markers?.some(matchesMarker)), `${item.name} should derive its ${pool} map markers.`);
		}
	}
	assert(
		journalEntries.length === 64 &&
		journalEntries.filter(item => item.journalEntry.region === `palpagos`).length === 55 &&
		journalEntries.filter(item => item.journalEntry.region === `worldtree`).length === 9,
		`All 64 individual journals should remain searchable with the expected regional split.`,
	);
	for (const [index, response] of individualJournalResponses.entries()) {
		const payload = serializeDiscordPayload(response);
		const expectedItem = itemData.Items.find(item => item.name === (index ? `Ancient Recorder` : `Bjorn Seligsson's Diary - 1`));
		assert(
			payload.includes(`Category:`) && payload.includes(`Collectible`) && payload.includes(`Sources:`) &&
			payload.includes(index ? `World Tree location` : `Palpagos location`) &&
			(payload.match(/N\/A/gu) || []).length >= 4 && response.files.length === 2 &&
			response.embeds[0].toJSON().thumbnail?.url === `attachment://${path.basename(expectedItem.iconUrl)}`,
			`${index ? `World Tree` : `Palpagos`} individual journal should use the standard item card and single-location map.`,
		);
	}
	const serializedEffigy = serializeDiscordPayload(effigyResponse);
	const serializedBounty = serializeDiscordPayload(bountyResponse);
	const serializedRelic = serializeDiscordPayload(relicResponse);
	const mappedStandardSpheres = [
		`Pal Sphere`, `Mega Sphere`, `Giga Sphere`, `Hyper Sphere`, `Ultra Sphere`, `Legendary Sphere`, `Ultimate Sphere`,
	].map(name => itemData.Items.find(item => item.name === name));
	assert(
		mappedStandardSpheres.every(item => item?.acquisition?.map && item.acquisition.sources?.length),
		`Every standard regional Sphere should include verified acquisition sources and a map.`,
	);
	for (const sphere of mappedStandardSpheres) {
		const markerTypes = sphere.acquisition.mapSources.markers.map(marker => marker.type);
		assert(
			!markerTypes.some(type => type === `Supply` || /^Salvage Rank/u.test(type)),
			`${sphere.name} should list Supply Drops and Salvage textually without mapping them.`,
		);
	}
	assert(
		serializedEffigy.includes(`Sources:`) &&
		serializedEffigy.includes(`140 Palpagos locations`) &&
		serializedEffigy.includes(`15 World Tree locations`) &&
		!serializedEffigy.includes(`Effigy Locations`),
		`Cross-map Effigy cards should describe both map panels without a redundant Effigy Locations label.`,
	);
	assert(
		serializedBounty.includes(`33 fixed targets`) && serializedBounty.includes(`Elder`),
		`Bounty Tokens should map fixed targets and disclose the unpinned Elder source.`,
	);
	assert(serializeDiscordPayload(keySphereResponse).includes(`Tower of the Rayne Syndicate — first clear only`), `Key Spheres should identify their one-time tower source.`);
	assert(serializeDiscordPayload(skillFruitResponse).includes(`not guaranteed`), `Skill Fruit cards should disclose that regional tree drops are possible rather than guaranteed.`);
	assert(
		serializedRelic.includes(`Sources:`) && serializedRelic.includes(`Fishing`) && serializedRelic.includes(`Junk`),
		`World Tree pool items should summarize verified fishing and junk sources.`,
	);
	const mappedResponses = [
		ominousEggResponse, peachResponse, treasureMapResponse, ruinSchematicResponse, ancientBoneResponse,
		ancientBarkResponse, ancientLavaResponse, coalResponse, effigyResponse, bountyResponse,
		keySphereResponse, skillFruitResponse, relicResponse, ...journalResponses, ...individualJournalResponses,
	];
	for (const response of mappedResponses) {
		assert(response.files.length === 2 && response.embeds[0].toJSON().image?.url?.startsWith(`attachment://`), `Limited-location item cards should attach an item thumbnail and map.`);
	}

	const searchableItems = itemData.Items.filter(item =>
		item.searchable !== false && item.properties?.bLegalInGame !== 0 && !/^\s*\[WIP\]/i.test(item.description || ``),
	);
	assert(searchableItems.every(item => String(item.description || ``).trim()), `Every searchable item should have a user-facing description.`);
	assert(itemData.Items.every(item => !String(item.description || ``).includes(`|`)), `Item descriptions should not expose upstream pipe delimiters.`);
	assert(
		itemData.Items.filter(item => /^[a-z]{2}[_ ]text$/iu.test(String(item.description || ``).trim())).every(item => item.searchable === false),
		`Placeholder localization records such as Silicon should remain hidden from lookup.`,
	);
	assert(UNAVAILABLE_ITEM_IDS.size === 16, `The unavailable-item registry should cover all 16 audited definitions.`);
	assert(
		itemData.Items.filter(shouldHideItem).every(item => item.searchable === false),
		`Unreleased, superseded, WIP, and unresolved item definitions should remain hidden from lookup.`,
	);
	assert(
		!itemData.Items.some(needsAvailabilityReview),
		`A hidden item with finished localization and a real acquisition signal should require implementation review.`,
	);

	const cardsRequiringConsistencyChecks = searchableItems.filter(item =>
		item.acquisition || (item.recipes || []).length > 1,
	);
	for (const item of cardsRequiringConsistencyChecks) {
		const response = paldeck.buildItemResponse(item, null, `consistency-owner`);
		const fields = response.embeds[0].toJSON().fields || [];
		const leadingFields = fields.slice(0, 6).map(field => field.name);

		assert(
			JSON.stringify(leadingFields.slice(0, 5)) === JSON.stringify([
				`Category:`, `Weight:`, `Maximum Stack:`, `Buy Price:`, `Sell Price:`,
			]) && [`Ammo Type:`, `\u200b`].includes(leadingFields[5]),
			`${item.name}: item summary fields should use the canonical six-cell order.`,
		);

		if (item.acquisition) {
			assert(
				fields.filter(field => field.name === `Sources:`).length === 1 &&
				!fields.some(field => field.name === `Source:` || field.name.includes(`Source —`)),
				`${item.name}: acquisition data should render in exactly one Sources field.`,
			);
		}

		if ((item.recipes || []).length > 1) {
			assert(
				fields.some(field => field.name === `Crafting Recipes:`),
				`${item.name}: alternate recipes should render in a Crafting Recipes field.`,
			);
		}
	}
}

function validateHtmlTextHelpers() {
	const { decodeHtml, stripTags } = requireFresh(`scripts`, `lib`, `html-text.js`);
	const { parseItemDetails } = requireFresh(`scripts`, `lib`, `paldb-items.js`);
	const encodedTagText = stripTags(`&lt;script&gt;alert(1)&lt;/script&gt;Relaxaurus`);
	const doubleEncodedTagText = stripTags(`&amp;lt;script&amp;gt;Relaxaurus&amp;lt;/script&amp;gt;`);
	const nestedTagText = stripTags(`<scr<script>ipt>alert(1)</script>`);

	assert(decodeHtml(`A&amp;B &quot;x&quot; &#039;y&#039; &lt;z&gt;`) === `A&B "x" 'y' <z>`, `HTML entity decoding changed unexpectedly.`);
	assert(decodeHtml(`&amp;lt;script&amp;gt;`) === `&lt;script&gt;`, `HTML entity decoding should not double-unescape encoded tags.`);
	assert(stripTags(`<span>Relaxaurus</span>`) === `Relaxaurus`, `HTML text extraction should preserve normal tag contents.`);
	assert(!/[<>]/.test(encodedTagText), `Encoded HTML tags should not survive text extraction as angle brackets.`);
	assert(!/[<>]/.test(doubleEncodedTagText), `Double-encoded HTML tags should not become angle brackets during text extraction.`);
	assert(!/[<>]/.test(nestedTagText), `Nested or malformed HTML tags should not leave angle brackets behind.`);
	const recipeFixture = [
		`<h5>Production</h5><table><tr><td><a class="itemname">Ore</a><small class="itemQuantity">2</small>`,
		`<td><a class="itemname" data-hover="?s=Items/Ingot">Ingot</a><td>Primitive Workbench</table>`,
		`<h5>Medal_Shop_1 Wandering Merchant /37</h5><table><tr><td><a class="itemname">Shop Reward</a><small class="itemQuantity">1</small>`,
		`<td><a class="itemname" data-hover="?s=Items/Ingot">Ingot</a><td></table>`,
	].join(``);
	const parsedRecipes = parseItemDetails(recipeFixture, `Items/Ingot`).recipes;
	assert(
		parsedRecipes.length === 1 && parsedRecipes[0].ingredients[0].name === `Ore`,
		`Recipe parsing should include production tables while excluding merchant exchange tables.`,
	);
}

async function validateHiddenPalPlaceholdersStayHidden() {
	const breed = requireFresh(`commands`, `globalCommands`, `utility`, `breed.js`);
	const paldeck = requireFresh(`commands`, `globalCommands`, `utility`, `paldeck.js`);
	const palFile = requireFresh(`data`, `palData.json`);
	const breedingFile = requireFresh(`data`, `palBreeding.json`);
	const { createBreedingCalculator } = requireFresh(`utils`, `palBreeding.js`);
	const hiddenPlaceholders = palFile.Pals.filter(pal => pal.hidden && pal.placeholder);
	let paldeckChoices = [];
	let breedChoices = [];

	assert(hiddenPlaceholders.length === 7, `palData.json should include seven hidden internal placeholders.`);
	assert(
		hiddenPlaceholders.every(pal => !pal.breeding.canBeParent && !pal.breeding.canBeChild),
		`Hidden placeholders should not be selectable breeding parents or children.`,
	);
	assert(
		!Object.hasOwn(breedingFile, `UnmappedGameUniqueCombinationRows`),
		`palBreeding.json should not include an empty unmapped fixed-combination row bucket.`,
	);
	assert(!Array.isArray(breedingFile.SameSpeciesCombinations), `palBreeding.json should omit source-only same-species rows.`);

	await paldeck.autocomplete({
		options: {
			getFocused: () => ({ name: `name`, value: `PinkKangaroo` }),
		},
		respond: choices => {
			paldeckChoices = choices;
		},
	});

	await breed.autocomplete({
		options: {
			getFocused: () => ({ name: `parent1`, value: `PinkKangaroo` }),
		},
		respond: choices => {
			breedChoices = choices;
		},
	});

	const calculator = createBreedingCalculator(palFile, breedingFile);

	assert(!paldeckChoices.some(choice => choice.value === `PinkKangaroo`), `Hidden placeholders should not appear in /paldeck autocomplete.`);
	assert(!breedChoices.some(choice => choice.value === `PinkKangaroo`), `Hidden placeholders should not appear in /breed autocomplete.`);
	assert(calculator.calculateChild(`PinkKangaroo`, `PinkKangaroo`) === null, `Hidden placeholders should not be accepted as direct breeding inputs.`);
}

async function validateEventsLoad() {
	const eventFiles = listFiles(resolveProject(`events`), filePath => filePath.endsWith(`.js`));
	const eventNames = new Set();
	let interactionEvent = null;

	assert(eventFiles.length > 0, `No event files were found.`);

	for (const filePath of eventFiles) {
		const event = requireFresh(relative(filePath));

		assert(event.name, `${relative(filePath)} is missing event name.`);
		assert(typeof event.execute === `function`, `${relative(filePath)} is missing execute().`);
		assert(event.execute.constructor.name === `AsyncFunction`, `${relative(filePath)} execute() should be async.`);

		if (event.once !== undefined) {
			assert(typeof event.once === `boolean`, `${relative(filePath)} once should be a boolean when provided.`);
		}

		assert(!eventNames.has(event.name), `Duplicate event handler name: ${event.name}.`);
		eventNames.add(event.name);
		if (relative(filePath) === `events/eventsInteractionCreate.js`) {
			interactionEvent = event;
		}
	}

	const unknownInteraction = Object.assign(new Error(`Unknown interaction`), { code: 10062 });
	await interactionEvent.execute({
		client: {
			commands: new Map([[`item`, {
				autocomplete: async () => {
					throw unknownInteraction;
				},
			}]]),
		},
		commandName: `item`,
		createdTimestamp: Date.now(),
		isAutocomplete: () => true,
		isButton: () => false,
		isChatInputCommand: () => false,
		isStringSelectMenu: () => false,
	});
}

async function validateAnnouncementHelpers() {
	const announcements = requireFresh(`utils`, `announcements.js`);
	const { PermissionFlagsBits } = require(`discord.js`);
	const sample = `## Unreleased

- Draft note.

## v9.8.7 - 2026-07-13

- Released note.
`;
	const latest = announcements.parseLatestPatchNotes(sample);
	const messages = announcements.formatPatchNotesMessages(latest);

	assert(latest?.id === `v9.8.7`, `Patch-note parser should skip Unreleased sections.`);
	assert(!latest.body.includes(`Draft note`), `Patch-note parser included Unreleased content.`);
	assert(messages.length === 1, `Patch-note formatter should produce one message for the sample.`);
	assert(messages[0].startsWith(`## Paldeck v9.8.7`), `Patch-note formatter should use one product release heading.`);
	const splitMessages = announcements.formatPatchNotesMessages({
		heading: `v9.9.9 - 2026-07-27`,
		body: `### Long Notes\n\n- ${`Long patch note. `.repeat(180)}`,
	});

	assert(splitMessages.length > 1, `Long patch-note announcements should split into multiple messages.`);
	assert(!splitMessages.some(message => /_Part \d+\/\d+_/u.test(message)), `Split patch-note announcements should not add Part X/Y labels.`);
	assert(announcements.normalizeAnnouncementId({ id: 123456789n }) === `123456789`, `Announcement ID normalization did not handle bigint IDs.`);
	assert(announcements.splitAnnouncementText(`a`.repeat(3900)).every(chunk => chunk.length <= 1900), `Announcement splitter exceeded Discord-safe chunk size.`);

	const realLatest = announcements.getLatestPatchNotes();
	const expectedLatestPatchNoteId = `v${readJson(`package.json`).version}`;

	assert(
		realLatest?.id === expectedLatestPatchNoteId,
		`docs/patch-notes.md should contain a latest ${expectedLatestPatchNoteId} release section.`,
	);

	const guildMember = {};
	const accessGuild = { members: { me: guildMember } };
	const channelWithViewOnly = {
		isTextBased: () => true,
		permissionsFor: () => ({ has: permission => permission === PermissionFlagsBits.ViewChannel }),
		send: () => null,
	};
	const access = await announcements.checkAnnouncementChannelAccess(accessGuild, channelWithViewOnly);

	assert(access.message === `Paldeck cannot send messages in the configured updates channel.`, `Announcement setup should identify a missing Send Messages permission.`);

	const { JoinedServers } = require(resolveProject(`database`, `dbObjects.js`));
	const guildId = `999999999999999999`;
	let ownerDms = 0;
	const owner = {
		id: `888888888888888888`,
		send: async () => {
			ownerDms += 1;
		},
		user: { username: `SmokeOwner` },
	};
	const guild = {
		channels: { fetch: async () => channelWithViewOnly },
		fetchOwner: async () => owner,
		id: guildId,
		members: { me: guildMember },
		name: `Smoke Guild`,
	};
	const client = { guilds: { cache: new Map([[guildId, guild]]) } };

	await JoinedServers.create({
		guild_id: guildId,
		guild_name: guild.name,
		owner_id: owner.id,
		owner_username: owner.user.username,
		paldeck_announcement_channel_id: `777777777777777777`,
	});
	const firstFailure = await announcements.sendLatestPatchNotesToGuild(client, guildId, { force: true });
	await announcements.sendLatestPatchNotesToGuild(client, guildId, { force: true });

	assert(firstFailure.message.includes(`server owner was notified`), `Failed announcement delivery should report a successful owner notification.`);
	assert(ownerDms === 1, `The same unresolved announcement-channel failure should notify the owner only once.`);
	await JoinedServers.destroy({ where: { guild_id: guildId } });
}

async function validateDmForwarding() {
	const forwarding = requireFresh(`utils`, `dmForwarding.js`);
	const { JoinedServers } = require(resolveProject(`database`, `dbObjects.js`));
	const userId = `666666666666666666`;
	const destinationId = `555555555555555555`;
	let forwardedPayload = null;

	await JoinedServers.create({
		guild_id: `444444444444444444`,
		guild_name: `Owned Smoke Guild`,
		owner_id: userId,
		owner_username: `DmSmokeUser`,
	});
	await forwarding.saveDmForwardChannelId(destinationId);

	const forwarded = await forwarding.forwardDirectMessage({
		attachments: new Map(),
		author: { globalName: `DM Smoke User`, id: userId, username: `DmSmokeUser` },
		client: {
			channels: {
				fetch: async channelId => {
					if (channelId !== destinationId) {
						return null;
					}

					return {
						isTextBased: () => true,
						send: async payload => {
							forwardedPayload = payload;
						},
					};
				},
			},
		},
		content: `Exact DM content <@123456789012345678>`,
		createdAt: new Date(),
		id: `333333333333333333`,
		stickers: new Map(),
	});
	const serialized = serializeDiscordPayload(forwardedPayload);

	assert(forwarded, `Configured direct messages should be forwarded.`);
	assert(forwardedPayload.content === `Exact DM content <@123456789012345678>`, `Direct-message text should be forwarded verbatim.`);
	assert(forwardedPayload.allowedMentions.parse.length === 0, `Forwarded direct messages should not trigger mentions.`);
	assert(serialized.includes(`DM Smoke User`) && serialized.includes(userId), `Forwarded direct messages should identify the sender.`);
	assert(serialized.includes(`Owned Smoke Guild`) && serialized.includes(`444444444444444444`), `Forwarded direct messages should list stored servers owned by the sender.`);

	await forwarding.clearDmForwardChannelId();
	await JoinedServers.destroy({ where: { owner_id: userId } });
}

function validateDatabaseModels() {
	const dbObjects = require(resolveProject(`database`, `dbObjects.js`));
	const joinedServerColumns = dbObjects.JoinedServers.rawAttributes;

	sequelizeToClose = dbObjects.sequelize;
	assert(joinedServerColumns.paldeck_announcement_channel_id, `JoinedServers is missing paldeck_announcement_channel_id.`);
	assert(joinedServerColumns.paldeck_announcement_last_id, `JoinedServers is missing paldeck_announcement_last_id.`);
	assert(joinedServerColumns.paldeck_announcement_warning_key, `JoinedServers is missing paldeck_announcement_warning_key.`);
	assert(dbObjects.BotSettings.rawAttributes.key && dbObjects.BotSettings.rawAttributes.value, `BotSettings is missing key/value storage.`);
}

function validatePalData() {
	const palFile = requireFresh(`data`, `palData.json`);
	const breedingFile = requireFresh(`data`, `palBreeding.json`);
	const { findPalColorProblems } = requireFresh(`utils`, `palColors.js`);
	const colors = palFile.Colors?.[0] || {};
	const colorProblems = findPalColorProblems(palFile.Pals, colors);
	const palsWithBreeding = palFile.Pals.filter(pal => pal.breeding);
	const isSameSpeciesCombination = row => row.parentA === row.parentB && row.parentA === row.child;

	assert(Array.isArray(palFile.Pals) && palFile.Pals.length > 0, `palData.json has no Pals.`);
	assert(palsWithBreeding.length === palFile.Pals.length, `palData.json has Pals without breeding metadata.`);
	assert(!Array.isArray(breedingFile.PairResults), `palBreeding.json should not include the exhaustive PairResults cache.`);
	assert(!Array.isArray(breedingFile.SameSpeciesCombinations), `palBreeding.json should omit source-only same-species rows.`);
	assert(!Object.hasOwn(breedingFile, `SourceOverrides`), `palBreeding.json should omit empty SourceOverrides.`);
	assert(Array.isArray(breedingFile.UniqueCombinations) && breedingFile.UniqueCombinations.length > 0, `palBreeding.json has no UniqueCombinations.`);
	assert(breedingFile.UniqueCombinations.every(row => !isSameSpeciesCombination(row)), `UniqueCombinations should not include same-species rows.`);
	assert(breedingFile.UniqueCombinations.length < 1000, `palBreeding.json UniqueCombinations looks like an expanded pair-result cache.`);
	assert(colorProblems.length === 0, `Found ${colorProblems.length} pal color issue(s).`);
}

function validateCiWorkflow() {
	const workflow = fs.readFileSync(resolveProject(`.github`, `workflows`, `ci.yml`), `utf8`);

	assert(workflow.includes(`npm run lint`), `CI workflow does not run lint.`);
	assert(workflow.includes(`npm run smoke`), `CI workflow does not run smoke.`);
	assert(workflow.includes(`npm audit --audit-level=moderate`), `CI workflow does not run dependency audit.`);
}

function validateGithubPagesDocs() {
	const config = fs.readFileSync(resolveProject(`docs`, `_config.yml`), `utf8`);
	const index = fs.readFileSync(resolveProject(`docs`, `index.md`), `utf8`);

	assert(config.includes(`theme: jekyll-theme-midnight`), `GitHub Pages should use the Hachi Pages theme.`);
	assert(config.includes(`show_downloads: false`), `GitHub Pages should hide download links.`);
	assert(index.includes(`https://github.com/FearlessKenji/Paldeck/blob/main/CHANGELOG.md`), `Pages index should link to the GitHub changelog.`);
	assert(index.includes(`[Patch Notes](patch-notes.html)`), `Pages index should link to patch notes.`);
	assert(index.includes(`[Privacy Policy](privacy-policy.html)`), `Pages index should link to the privacy policy.`);
	assert(index.includes(`[Terms of Service](terms-of-service.html)`), `Pages index should link to the terms of service.`);
}

function validateReleaseWorkflow() {
	const workflow = fs.readFileSync(resolveProject(`.github`, `workflows`, `release.yml`), `utf8`);

	assert(workflow.includes(`name: Release Paldeck`), `Release workflow has the wrong name.`);
	assert(workflow.includes(`branches:`) && workflow.includes(`- main`), `Release workflow should watch main.`);
	assert(workflow.includes(`tags:`) && workflow.includes(`- "v*"`), `Release workflow should watch v* tags.`);
	assert(workflow.includes(`require('./package.json').version`), `Release workflow should read package.json version.`);
	assert(workflow.includes(`git tag "$RELEASE_TAG"`), `Release workflow should create missing release tags.`);
	assert(workflow.includes(`gh release create "$RELEASE_TAG"`), `Release workflow should create GitHub releases.`);
}

function validateConfigValueHelpers() {
	const {
		getConfiguredGuildIds,
		getConfiguredOwnerIds,
		isConfiguredOwner,
	} = requireFresh(`utils`, `configValues.js`);
	const config = {
		botOwners: [`111`, `222 333`],
		guildIds: [`444`, `555,666`],
	};

	assert(getConfiguredOwnerIds(config).join(`|`) === `111|222|333`, `Owner ID normalization failed.`);
	assert(getConfiguredGuildIds(config).join(`|`) === `444|555|666`, `Guild ID normalization failed.`);
	assert(isConfiguredOwner(config, `222`), `Owner lookup failed.`);
}

function validateGitHygiene() {
	const nodeModulesResult = runGit([`ls-files`, `node_modules`]);

	if (nodeModulesResult.error) {
		warn(`git is unavailable; skipped tracked generated-file checks.`);
		return;
	}

	assert(nodeModulesResult.status === 0, `git ls-files failed: ${nodeModulesResult.stderr}`);
	assert(nodeModulesResult.stdout.trim() === ``, `node_modules files are tracked by git.`);

	const configResult = runGit([`ls-files`, `config/config.json`]);

	assert(configResult.status === 0, `git ls-files failed: ${configResult.stderr}`);
	assert(configResult.stdout.trim() === ``, `config/config.json should not be tracked by git.`);
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
	await test(`Paldeck drop controls send public owned item lookups`, validatePaldeckDropLookup);
	await test(`Paldeck cards group Pal and Raid Boss drops`, validateGroupedPalDrops);
	await test(`Summoning Altar drop data covers every affected Pal lookup`, validateEncounterDropData);
	await test(`/item lookup opens Paldeck dropping-Pal results`, validateItemLookupAndDroppingPals);
	await test(`HTML text helpers decode before stripping tags`, validateHtmlTextHelpers);
	await test(`hidden Pal placeholders stay out of user-facing search`, validateHiddenPalPlaceholdersStayHidden);
	await test(`events load with valid handlers`, validateEventsLoad);
	await test(`announcement helpers parse and format patch notes`, validateAnnouncementHelpers);
	await test(`direct messages forward verbatim with sender and owned-server context`, validateDmForwarding);
	await test(`database models include update announcement fields`, validateDatabaseModels);
	await test(`Paldeck data files remain valid`, validatePalData);
	await test(`CI workflow includes lint, smoke, and audit jobs`, validateCiWorkflow);
	await test(`GitHub Pages docs include theme and update links`, validateGithubPagesDocs);
	await test(`release workflow creates package-version GitHub releases`, validateReleaseWorkflow);
	await test(`config ID helpers normalize owner and guild IDs`, validateConfigValueHelpers);
	await test(`git hygiene checks pass`, validateGitHygiene);

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
