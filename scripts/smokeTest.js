#!/usr/bin/env node

const childProcess = require(`node:child_process`);
const fs = require(`node:fs`);
const path = require(`node:path`);

const projectRoot = path.resolve(__dirname, `..`);
process.chdir(projectRoot);

const results = {
	failed: 0,
	passed: 0,
	warned: 0,
};

let createdSmokeConfig = false;
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
		`utils/announcements.js`,
		`utils/configValues.js`,
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
	const { loadCommandFiles } = requireFresh(`utils`, `commandLoader.js`);
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

		for (const optionalHandler of [`autocomplete`, `handleButton`]) {
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
}

function validateEventsLoad() {
	const eventFiles = listFiles(resolveProject(`events`), filePath => filePath.endsWith(`.js`));
	const eventNames = new Set();

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
	}
}

function validateAnnouncementHelpers() {
	const announcements = requireFresh(`utils`, `announcements.js`);
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
	assert(messages[0].startsWith(`# Paldeck v9.8.7`), `Patch-note formatter should prefix messages with Paldeck.`);
	assert(announcements.normalizeAnnouncementId({ id: 123456789n }) === `123456789`, `Announcement ID normalization did not handle bigint IDs.`);
	assert(announcements.splitAnnouncementText(`a`.repeat(3900)).every(chunk => chunk.length <= 1900), `Announcement splitter exceeded Discord-safe chunk size.`);

	const realLatest = announcements.getLatestPatchNotes();
	const pkg = readJson(`package.json`);

	assert(realLatest?.id === `v${pkg.version}`, `docs/patch-notes.md should contain a latest v${pkg.version} release section.`);
}

function validateDatabaseModels() {
	const dbObjects = requireFresh(`database`, `dbObjects.js`);
	const joinedServerColumns = dbObjects.JoinedServers.rawAttributes;

	sequelizeToClose = dbObjects.sequelize;
	assert(joinedServerColumns.paldeck_announcement_channel_id, `JoinedServers is missing paldeck_announcement_channel_id.`);
	assert(joinedServerColumns.paldeck_announcement_last_id, `JoinedServers is missing paldeck_announcement_last_id.`);
}

function validatePalData() {
	const palFile = requireFresh(`data`, `palData.json`);
	const breedingFile = requireFresh(`data`, `palBreeding.json`);
	const { findPalColorProblems } = requireFresh(`utils`, `palColors.js`);
	const colors = palFile.Colors?.[0] || {};
	const colorProblems = findPalColorProblems(palFile.Pals, colors);

	assert(Array.isArray(palFile.Pals) && palFile.Pals.length > 0, `palData.json has no Pals.`);
	assert(Array.isArray(breedingFile.Pals) && breedingFile.Pals.length > 0, `palBreeding.json has no Pals.`);
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

	await test(`package metadata and lockfile are consistent`, validatePackageMetadata);
	await test(`required project files exist`, validateRequiredProjectFiles);
	await test(`commands load and serialize for Discord deployment`, validateCommandsLoad);
	await test(`events load with valid handlers`, validateEventsLoad);
	await test(`announcement helpers parse and format patch notes`, validateAnnouncementHelpers);
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

main().catch(error => {
	console.error(`[fail] smoke test crashed`);
	console.error(error);
	process.exitCode = 1;
});
