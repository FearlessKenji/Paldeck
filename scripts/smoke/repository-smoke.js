const { Buffer } = require(`node:buffer`);
const os = require(`node:os`);
const { assert, fs, listFiles, path, readJson, relative, requireFresh, resolveProject, runGit, serializeDiscordPayload } = require(`./shared.js`);

async function validateHtmlTextHelpers() {
	const { decodeHtml, stripTags } = requireFresh(`scripts`, `lib`, `html-text.js`);
	const { parseItemCards, parseItemDetails } = requireFresh(`scripts`, `lib`, `paldb-items.js`);
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
	const cardFixture = [
		`<div class="col"><div class="card itemPopup"><div class="hover_banner banner_rarity2">`,
		`<a class="itemname" data-hover="/cache/en/item" href="Actual_Item">Actual Item</a>`,
		`<span class="me-auto">Weapon</span><span class="hover_text_rarity2">Rare</span></div>`,
		`<div class="hover_bg_rarity2"></div><div class="recipes">`,
		`<a class="itemname" data-hover="?s=Items%2FCopperIngot" href="Ingot">Ingot</a></div>`,
	].join(``);
	const [parsedCard] = parseItemCards(cardFixture, { category: `Weapon`, slug: `Weapon` });
	assert(
		parsedCard.name === `Actual Item` && parsedCard.code === `` && parsedCard.hoverPath === `/cache/en/item`,
		`Item-card parsing should retain cached header identity without borrowing a recipe ingredient code.`,
	);

	const { compareData } = requireFresh(`scripts`, `lib`, `paldb-data.js`);
	const palDiff = compareData(
		[{ breedingId: `test`, element: ``, name: `Test Pal`, number: `001`, suitability: `` }],
		{ Pals: [{ breeding: { id: `test` }, element: `Water`, name: `Test Pal`, number: `001`, suitability: `Watering 1` }] },
		{},
	);
	assert(
		palDiff.changedPals.length === 0 && palDiff.coverageGaps[0].fields.length === 2,
		`Blank upstream Pal fields should be reported as coverage gaps rather than data changes.`,
	);
	const updaterSource = fs.readFileSync(resolveProject(`scripts`, `update-palworld-items.js`), `utf8`);
	assert(
		updaterSource.includes(`String(item.code || \`\`).toLowerCase()`),
		`Item refreshes should match cached PalDB codes case-insensitively and preserve stable local identities.`,
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

function validateMutationCandidateRankBoundaries() {
	const pals = requireFresh(`data`, `palData.json`).Pals;
	const {
		eligibleMutationChildren,
		mutationCandidateRankRanges,
		nearestMutationCandidate,
	} = requireFresh(`utils`, `palMutations.js`);
	const candidates = eligibleMutationChildren(pals);
	const ranges = [...mutationCandidateRankRanges(candidates)];

	// Cover every native integer target rank, including all midpoint and priority tie boundaries.
	for (let targetRank = 0; targetRank <= 5000; targetRank += 1) {
		const expected = nearestMutationCandidate(candidates, targetRank)?.name;
		const actual = ranges.find(([, range]) => targetRank >= range.minimum && targetRank <= range.maximum)?.[0];
		assert(actual === expected, `Mutation candidate range mismatch at target rank ${targetRank}: expected ${expected}, received ${actual}.`);
	}
}

function validateItemSourceQuantities() {
	const { sourceText } = requireFresh(`utils`, `itemCards.js`);
	const { resolvedItemData } = requireFresh(`utils`, `itemData.js`);
	const itemData = resolvedItemData(requireFresh(`data`, `itemData.json`));

	for (const item of itemData.Items) {
		const note = item.acquisition?.note || ``;
		const sourceLines = sourceText(item.acquisition, item.merchantLocations, item.droppedBy).split(`\n`).filter(Boolean);
		for (const sourceLine of sourceLines) {
			if (note.includes(sourceLine)) {
				continue;
			}
			assert(sourceLine.includes(`×`), `${item.name}: source line does not show its acquired quantity: ${sourceLine}`);
		}
	}
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

function validateBroadcastSummary(announceCommand) {
	const broadcastSummary = announceCommand.summarizeResults([
		...Array.from({ length: 12 }, (_, index) => ({ guildId: `sent-${index}`, message: `Sent.`, ok: true, skipped: false })),
		{ guildId: `skipped-guild`, guildName: `Skipped Server`, message: `No updates channel is configured.`, ok: true, skipped: true },
		{ guildId: `failed-guild`, guildName: `Failed Server`, message: `Missing Send Messages permission.`, ok: false, skipped: false },
		{ guildId: `long-failure`, guildName: `Long Failure Server`, message: `x`.repeat(2000), ok: false, skipped: false },
	]);
	const completeBroadcastSummary = broadcastSummary.join(`\n`);

	assert(broadcastSummary.every(message => message.length <= 1900), `Broadcast result summaries should stay within Discord's safe message length.`);
	assert(completeBroadcastSummary.includes(`Sent: 12`), `Broadcast result summaries should condense successful deliveries into the sent total.`);
	assert(completeBroadcastSummary.includes(`skipped-guild`) && completeBroadcastSummary.includes(`failed-guild`) && completeBroadcastSummary.includes(`long-failure`),
		`Broadcast result summaries should include every skipped and failed result.`);
	assert(completeBroadcastSummary.includes(`Skipped Server (skipped-guild): skipped.`),
		`Broadcast result summaries should identify exceptional deliveries by server name and ID.`);
	assert(!completeBroadcastSummary.includes(`more result`), `Broadcast result summaries should never replace results with an overflow count.`);
}

async function validateManagerAnnouncementWarnings(announcements, guildId, PermissionFlagsBits) {
	let managerWarnings = 0;
	const managerInteraction = {
		deferred: true,
		followUp: async payload => {
			assert(payload.flags === 64 && payload.content.startsWith(`**Paldeck updates need attention**`), `Manager warning should be ephemeral and immediately identifiable.`);
			assert(payload.content.includes(`**Missing permissions:** Send Messages`), `Manager warning should name missing permissions.`);
			managerWarnings += 1;
		},
		guildId,
		isChatInputCommand: () => true,
		memberPermissions: { has: permission => permission === PermissionFlagsBits.ManageGuild },
	};
	const warningStart = new Date(`2026-08-11T12:00:00.000Z`);
	await announcements.sendAnnouncementWarningToManager(managerInteraction, warningStart);
	await announcements.sendAnnouncementWarningToManager(managerInteraction, new Date(warningStart.getTime() + 5 * 60 * 1000));
	await announcements.sendAnnouncementWarningToManager(managerInteraction, new Date(warningStart.getTime() + 15 * 60 * 1000));
	await announcements.sendAnnouncementWarningToManager(managerInteraction, new Date(warningStart.getTime() + 30 * 60 * 1000));
	await announcements.sendAnnouncementWarningToManager(managerInteraction, new Date(warningStart.getTime() + 45 * 60 * 1000));
	assert(managerWarnings === 3, `Manager warnings should allow three messages with a minimum interval before the 24-hour cooldown.`);
	await announcements.sendAnnouncementWarningToManager(managerInteraction, new Date(warningStart.getTime() + 24 * 60 * 60 * 1000));
	assert(managerWarnings === 4, `Manager warning budget should refresh after 24 hours.`);
}

async function validateAnnouncementHelpers() {
	const announcements = requireFresh(`utils`, `announcements.js`);
	const announceCommand = requireFresh(`commands`, `globalCommands`, `admin`, `announce.js`);
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
	validateBroadcastSummary(announceCommand);

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
	const owner = {
		id: `888888888888888888`,
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

	assert(!firstFailure.message.includes(`server owner was notified`), `Failed announcement delivery should not directly message the server owner.`);
	assert(firstFailure.guildName === `Smoke Guild`, `Failed announcement delivery should retain the server name.`);
	await validateManagerAnnouncementWarnings(announcements, guildId, PermissionFlagsBits);
	await JoinedServers.destroy({ where: { guild_id: guildId } });
}

function validateMapDeduplicationSafety() {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), `paldeck-deduplication-`));
	const itemDataPath = path.join(directory, `itemData.json`);
	const first = path.join(directory, `first.png`);
	const duplicate = path.join(directory, `duplicate.png`);
	const sameSizeButDifferent = path.join(directory, `different.png`);
	const originalItemDataPath = process.env.PALDECK_ITEM_DATA_PATH;
	try {
		fs.writeFileSync(first, Buffer.from(`first payload`));
		fs.writeFileSync(duplicate, Buffer.from(`first payload`));
		fs.writeFileSync(sameSizeButDifferent, Buffer.from(`other payload`));
		fs.writeFileSync(itemDataPath, JSON.stringify({ maps: [relative(first), relative(duplicate), relative(sameSizeButDifferent)] }));
		process.env.PALDECK_ITEM_DATA_PATH = itemDataPath;
		const { deduplicate } = requireFresh(`scripts`, `optimize-item-maps.js`);
		assert(deduplicate([first, duplicate, sameSizeButDifferent]) === 1, `Only byte-identical maps should be deduplicated.`);
		assert(fs.existsSync(first) && !fs.existsSync(duplicate) && fs.existsSync(sameSizeButDifferent),
			`Same-size maps with different bytes must remain separate.`);

		fs.writeFileSync(duplicate, Buffer.from(`first payload`));
		process.env.PALDECK_ITEM_DATA_PATH = path.join(directory, `missing`, `itemData.json`);
		const failingOptimizer = requireFresh(`scripts`, `optimize-item-maps.js`);
		let failedBeforeDeletion = false;
		try {
			failingOptimizer.deduplicate([first, duplicate]);
		} catch (_error) {
			failedBeforeDeletion = true;
		}
		assert(failedBeforeDeletion && fs.existsSync(first) && fs.existsSync(duplicate),
			`Map files must remain untouched when item-data rewriting fails.`);
	} finally {
		if (originalItemDataPath === undefined) {
			delete process.env.PALDECK_ITEM_DATA_PATH;
		} else {
			process.env.PALDECK_ITEM_DATA_PATH = originalItemDataPath;
		}
		fs.rmSync(directory, { recursive: true, force: true });
	}
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

	assert(joinedServerColumns.paldeck_announcement_channel_id, `JoinedServers is missing paldeck_announcement_channel_id.`);
	assert(joinedServerColumns.paldeck_announcement_last_id, `JoinedServers is missing paldeck_announcement_last_id.`);
	assert(joinedServerColumns.paldeck_announcement_warning_key, `JoinedServers is missing paldeck_announcement_warning_key.`);
	assert(joinedServerColumns.paldeck_announcement_warning_count, `JoinedServers is missing paldeck_announcement_warning_count.`);
	assert(joinedServerColumns.paldeck_announcement_warning_window_started_at, `JoinedServers is missing paldeck_announcement_warning_window_started_at.`);
	assert(joinedServerColumns.paldeck_announcement_warning_last_sent_at, `JoinedServers is missing paldeck_announcement_warning_last_sent_at.`);
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

function validateGitHygiene(warn = console.warn) {
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

module.exports = {
	validateAnnouncementHelpers, validateCiWorkflow, validateConfigValueHelpers, validateDatabaseModels,
	validateDmForwarding, validateEventsLoad, validateGitHygiene, validateGithubPagesDocs,
	validateHiddenPalPlaceholdersStayHidden, validateHtmlTextHelpers, validateItemSourceQuantities,
	validateMapDeduplicationSafety, validateMutationCandidateRankBoundaries, validatePalData, validateReleaseWorkflow,
};
