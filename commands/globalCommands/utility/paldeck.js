/* eslint-disable max-lines -- Pal lookup, search pagination, and interaction restoration share one command state boundary. */
const {
	ActionRowBuilder,
	AttachmentBuilder,
	ButtonBuilder,
	ButtonStyle,
	EmbedBuilder,
	MessageFlags,
	SlashCommandBuilder,
} = require(`discord.js`);
const crypto = require(`node:crypto`);
const path = require(`node:path`);
const { createItemCards } = require(`../../../utils/itemCards.js`);
const { Op } = require(`sequelize`);
const { SearchSessions } = require(`../../../database/dbObjects.js`);
const palFile = require(`../../../data/palData.json`);
const { resolvedItemData } = require(`../../../utils/itemData.js`);
const { createItemVariantIndex } = require(`../../../utils/itemVariants.js`);
const { getPalColor } = require(`../../../utils/palColors.js`);
const { replaceInteractionMessage } = require(`../../../utils/interactionNavigation.js`);
const { buildLearnedMovesButton, showLearnedMoves } = require(`../../../utils/palMoves.js`);
const {
	autocompleteDropValues,
	buildBackToPalButton,
	buildDropSelect,
	distinctPalDrops,
	farmableValues,
	findItemByDropName,
	palDropFields,
	searchableDropValues,
	splitValues,
	uniqueSorted,
} = require(`../../../utils/palDrops.js`);

const PALS = palFile.Pals.filter(pal => !pal.hidden);
const PAL_COLORS = palFile.Colors?.[0] || {};
const PROJECT_ROOT = path.resolve(__dirname, `..`, `..`, `..`);
const RESULTS_PER_PAGE = 25;
const SEARCH_TTL_MS = 15 * 60 * 1000;
const searchCache = new Map();
const itemFile = resolvedItemData();
const ITEMS_BY_ID = new Map(itemFile.Items.map(item => [item.id, item]));
const UNAUTHORIZED_CONTROL_MESSAGE = `I'm not your button, pal!`;

const ELEMENT_CHOICES = [
	{ name: `Neutral`, value: `Neutral` },
	{ name: `Fire`, value: `Fire` },
	{ name: `Water`, value: `Water` },
	{ name: `Grass`, value: `Grass` },
	{ name: `Electric`, value: `Electric` },
	{ name: `Ice`, value: `Ice` },
	{ name: `Ground`, value: `Ground` },
	{ name: `Dark`, value: `Dark` },
	{ name: `Dragon`, value: `Dragon` },
	{ name: `None`, value: `None` },
];

const RARITY_CHOICES = [
	{ name: `Unknown`, value: `Unknown` },
	{ name: `Common`, value: `Common` },
	{ name: `Rare`, value: `Rare` },
	{ name: `Epic`, value: `Epic` },
	{ name: `Legendary`, value: `Legendary` },
];

const palByNumber = number => PALS.find(pal => normalizeNumber(pal.number) === normalizeNumber(number));

const AUTOCOMPLETE_CHOICES = {
	name: uniqueSorted(PALS.map(pal => pal.name)),
	suitability: uniqueSorted(PALS.flatMap(pal => splitValues(pal.suitability))),
	drops: uniqueSorted(PALS.flatMap(autocompleteDropValues)),
	farmable: uniqueSorted(PALS.flatMap(farmableValues)),
};

const normalizeText = value => String(value || ``).trim().toLowerCase();

function autocompleteChoices(optionName, input) {
	const choices = AUTOCOMPLETE_CHOICES[optionName] || [];

	if (optionName !== `suitability`) {
		return choices
			.filter(choice => normalizeText(choice).includes(normalizeText(input)))
			.slice(0, 25)
			.map(choice => ({ name: choice, value: choice }));
	}

	// Preserve completed suitability filters while autocomplete replaces only the active segment.
	const segments = String(input || ``).split(`,`);
	const activeInput = segments.pop().trim();
	const completed = segments.map(segment => segment.trim()).filter(Boolean);
	const completedNames = new Set(completed.map(entry => parseSuitability(entry).name));

	return choices
		.filter(choice =>
			normalizeText(choice).includes(normalizeText(activeInput)) &&
			!completedNames.has(parseSuitability(choice).name),
		)
		.map(choice => {
			const value = [...completed, choice].join(`, `);
			// Discord displays the choice name after selection, so keep it identical to the stored value.
			return { name: value, value };
		})
		.filter(choice => choice.value.length <= 100)
		.slice(0, 25);
}

function normalizeNumber(value) {
	const trimmed = String(value || ``).trim();
	const match = trimmed.match(/^(\d+)([a-z])?$/i);

	if (!match) {
		return trimmed.toLowerCase();
	}

	return `${match[1].padStart(3, `0`)}${(match[2] || ``).toLowerCase()}`;
}

function getRarity(pal) {
	if (!Number.isFinite(pal.rarity) || pal.rarity <= 0) {
		return `Unknown`;
	}

	if (pal.rarity <= 4) {
		return `Common`;
	}

	if (pal.rarity <= 7) {
		return `Rare`;
	}

	if (pal.rarity <= 10) {
		return `Epic`;
	}

	return `Legendary`;
}

function isRemoteImage(value) {
	return /^https?:\/\//i.test(String(value || ``));
}

function resolveLocalImage(imagePath) {
	const localPath = String(imagePath || ``).trim();

	if (!localPath || isRemoteImage(localPath)) {
		return { url: localPath, files: [] };
	}

	const filePath = path.resolve(PROJECT_ROOT, localPath);
	const relativePath = path.relative(PROJECT_ROOT, filePath);

	if (relativePath.startsWith(`..`) || path.isAbsolute(relativePath)) {
		return { url: localPath, files: [] };
	}

	const name = path.basename(filePath);

	return {
		url: `attachment://${name}`,
		files: [new AttachmentBuilder(filePath, { name })],
	};
}

const {
	buildItemResponse,
	buildMerchantResponse,
	buildMedalMerchantResponse,
	buildBountyMerchantResponse,
	buildArenaMerchantResponse,
	buildSourceDetailsResponse,
} = createItemCards({ normalizeText, relatedItem: createItemVariantIndex(itemFile.Items).counterpart, resolveLocalImage });

function parseSuitability(entry) {
	const match = String(entry || ``).trim().match(/^(.*?)(?:\s+(\d+))?$/);

	if (!match) {
		return { name: ``, level: `` };
	}

	return {
		name: normalizeText(match[1]),
		level: match[2] || ``,
	};
}

function matchesSuitabilities(input, value) {
	const required = splitValues(input).map(parseSuitability).filter(entry => entry.name);
	const available = splitValues(value).map(parseSuitability);

	if (!required.length) {
		return true;
	}

	return required.every(requiredEntry =>
		available.some(availableEntry =>
			availableEntry.name.includes(requiredEntry.name) &&
			(!requiredEntry.level || availableEntry.level === requiredEntry.level),
		),
	);
}

function matchesList(input, value) {
	const required = splitValues(input).map(normalizeText);
	const available = (Array.isArray(value) ? value : splitValues(value)).map(normalizeText);

	if (!required.length) {
		return true;
	}

	return required.every(requiredEntry =>
		available.some(availableEntry => availableEntry.includes(requiredEntry)),
	);
}

function buildPalEmbed(pal, thumbnailUrl = pal.thumbnail, habitatUrl = pal.habitat) {
	const rarity = getRarity(pal);
	const wiki = encodeURIComponent(pal.name.replace(/\s+/g, `_`));
	const fields = [
		{ name: `Number:`, value: pal.number, inline: true },
		{ name: `Food:`, value: pal.food, inline: true },
		{ name: `Elements:`, value: pal.element, inline: true },
	];

	fields.push(...palDropFields(pal));

	fields.push(
		{ name: `Work Suitability:`, value: pal.suitability },
		{ name: `Partner Skill:`, value: pal.partner },
	);

	if (pal.tech) {
		fields.push({ name: `Tech:`, value: pal.tech });
	}

	const embed = new EmbedBuilder()
		.setAuthor({ name: `Rarity: ${rarity}` })
		.setDescription(pal.description)
		.setColor(getPalColor(pal, PAL_COLORS))
		.setTitle(pal.name)
		.setURL(`https://palworld.fandom.com/wiki/${wiki}`)
		.setFooter({ text: `Spawns: ${pal.spawnTime}. Farmable: ${pal.farmable}.` })
		.addFields(fields);

	if (thumbnailUrl) {
		embed.setThumbnail(thumbnailUrl);
	}

	if (habitatUrl) {
		embed.setImage(habitatUrl);
	}

	return embed;
}

function buildPalResponse(pal, userId) {
	const thumbnail = resolveLocalImage(pal.thumbnail);
	const habitat = resolveLocalImage(pal.habitat);
	const actionButtons = new ActionRowBuilder().addComponents(
		new ButtonBuilder()
			.setCustomId(`breed:parents:${encodeURIComponent(pal.name)}:${userId}:${encodeURIComponent(pal.number)}`)
			.setLabel(`Breeding Parents`)
			.setStyle(ButtonStyle.Primary),
	);
	const learnedMovesButton = buildLearnedMovesButton(pal, userId);
	if (learnedMovesButton) {
		actionButtons.addComponents(learnedMovesButton);
	}
	const knownDrops = distinctPalDrops(pal).filter(dropName => findItemByDropName(dropName));

	if (knownDrops.length) {
		actionButtons.addComponents(
			new ButtonBuilder()
				.setCustomId(`paldeck:drops:${encodeURIComponent(pal.number)}:${userId}`)
				.setLabel(`Look Up Drops`)
				.setStyle(ButtonStyle.Secondary),
		);
	}

	return {
		embeds: [buildPalEmbed(pal, thumbnail.url, habitat.url)],
		files: [...thumbnail.files, ...habitat.files],
		components: [actionButtons],
	};
}

function criteriaHasValue(criteria) {
	return Object.values(criteria).some(value => String(value || ``).trim());
}

function buildCriteriaLine(criteria) {
	return `Element: ${criteria.element}\nSuitability: ${criteria.suitability}\nRarity:        ${criteria.rarity}\n Drops:        ${criteria.drops}\nFarmable:      ${criteria.farmable}`;
}

function findSearchResults(criteria) {
	return PALS.filter(pal => {
		if (criteria.element && !normalizeText(pal.element).includes(normalizeText(criteria.element))) {
			return false;
		}

		if (criteria.suitability && !matchesSuitabilities(criteria.suitability, pal.suitability)) {
			return false;
		}

		if (criteria.rarity && criteria.rarity !== getRarity(pal)) {
			return false;
		}

		if (criteria.drops && !matchesList(criteria.drops, searchableDropValues(pal))) {
			return false;
		}

		if (criteria.farmable && !matchesList(criteria.farmable, farmableValues(pal))) {
			return false;
		}

		return true;
	}).map(pal => ({
		element: pal.element,
		name: pal.name,
		number: pal.number,
		rarity: getRarity(pal),
	}));
}

function droppingPalResults(item) {
	const palsByName = new Map(PALS.map(pal => [normalizeText(pal.name), pal]));
	const seen = new Set();
	const results = [];
	for (const drop of item.droppedBy || []) {
		const pal = palsByName.get(normalizeText(drop.pal));
		const variant = String(drop.variant || ``).trim();
		const key = `${normalizeText(drop.pal)}\0${normalizeText(variant)}`;
		if (!pal || seen.has(key)) {
			continue;
		}
		seen.add(key);
		results.push({
			element: pal.element,
			name: variant ? `${variant} ${pal.name}` : pal.name,
			number: pal.number,
			rarity: getRarity(pal),
		});
	}
	return results;
}

async function replyWithDroppingPals(interaction, item, originPalNumber = null, ownerId = null) {
	const criteria = { element: ``, suitability: ``, rarity: ``, drops: item.name, farmable: `` };
	const results = droppingPalResults(item);

	if (!results.length) {
		await interaction.reply({ content: `No matching Pals were found.`, flags: MessageFlags.Ephemeral });
		return;
	}

	const page = 0;
	const totalPages = getTotalPages(results);
	const searchId = await storeSearch({
		userId: interaction.user.id,
		criteria,
		results,
		originPalNumber,
		originItemId: item.id,
		ownerId,
	});

	await replaceInteractionMessage(interaction, {
		embeds: [buildSearchEmbed(criteria, results, page)],
		components: buildSearchComponents({ searchId, page, totalPages, originPalNumber, originItemId: item.id, ownerId }),
		files: [],
	});
}

function getTotalPages(results) {
	return Math.max(1, Math.ceil(results.length / RESULTS_PER_PAGE));
}

function clampPage(page, totalPages) {
	return Math.min(Math.max(page, 0), totalPages - 1);
}

function buildSearchEmbed(criteria, results, page) {
	const totalPages = getTotalPages(results);
	const currentPage = clampPage(page, totalPages);
	const pageResults = results.slice(currentPage * RESULTS_PER_PAGE, (currentPage + 1) * RESULTS_PER_PAGE);

	const footer = totalPages > 1 ? `Page ${currentPage + 1}/${totalPages} | ${results.length} result(s)` : `${results.length} result(s)`;
	return new EmbedBuilder()
		.setTitle(`Matching:`)
		.setDescription(buildCriteriaLine(criteria))
		.setFooter({ text: footer })
		.addFields(
			{ name: `Name\n-------\n`, value: pageResults.map(result => result.name).join(`\n-------\n`), inline: true },
			{ name: `Element\n-------\n`, value: pageResults.map(result => result.element).join(`\n-------\n`), inline: true },
			{ name: `Rarity\n-------\n`, value: pageResults.map(result => result.rarity).join(`\n-------\n`), inline: true },
		);
}

function buildNumberMatchesEmbed(number, results) {
	return new EmbedBuilder()
		.setTitle(`Pals numbered ${number}:`)
		.setDescription(`Multiple Pals share this number.`)
		.addFields(
			{ name: `Name\n-------\n`, value: results.map(result => result.name).join(`\n-------\n`), inline: true },
			{ name: `Element\n-------\n`, value: results.map(result => result.element).join(`\n-------\n`), inline: true },
			{ name: `Rarity\n-------\n`, value: results.map(result => getRarity(result)).join(`\n-------\n`), inline: true },
		);
}

function buildSearchComponents({ searchId, page, totalPages, originPalNumber = null, originItemId = null, ownerId = null }) {
	const rows = [];

	if (totalPages > 1) {
		rows.push(new ActionRowBuilder().addComponents(
			new ButtonBuilder()
				.setCustomId(`paldeck:page:${searchId}:${page - 1}`)
				.setLabel(`<`)
				.setStyle(ButtonStyle.Secondary)
				.setDisabled(page <= 0),
			new ButtonBuilder()
				.setCustomId(`paldeck:page:${searchId}:${page + 1}`)
				.setLabel(`>`)
				.setStyle(ButtonStyle.Secondary)
				.setDisabled(page >= totalPages - 1),
		));
	}

	if (originPalNumber && ownerId) {
		rows.push(new ActionRowBuilder().addComponents(buildBackToPalButton(originPalNumber, ownerId)));
	} else if (originItemId && ownerId) {
		rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder()
			.setCustomId(`item:back:${originItemId}:${ownerId}`)
			.setLabel(`Back`)
			.setStyle(ButtonStyle.Secondary)));
	}

	return rows;
}

async function storeSearch({ userId, criteria, results, originPalNumber = null, originItemId = null, ownerId = null }) {
	const searchId = crypto.randomUUID();
	const expiresAt = Date.now() + SEARCH_TTL_MS;
	const state = { userId, criteria, results, expiresAt, originPalNumber, originItemId, ownerId };
	const timeout = setTimeout(() => searchCache.delete(searchId), SEARCH_TTL_MS);

	if (typeof timeout.unref === `function`) {
		timeout.unref();
	}

	searchCache.set(searchId, state);
	await SearchSessions.destroy({ where: { expires_at: { [Op.lte]: Date.now() } } });
	await SearchSessions.create({
		search_id: searchId,
		user_id: userId,
		criteria: JSON.stringify(criteria),
		results: JSON.stringify(results),
		expires_at: expiresAt,
	});

	return searchId;
}

async function getSearch(searchId) {
	const cachedState = searchCache.get(searchId);

	if (cachedState) {
		return cachedState;
	}

	const savedState = await SearchSessions.findOne({ where: { search_id: searchId } });

	if (!savedState) {
		return null;
	}

	if (savedState.expires_at <= Date.now()) {
		await SearchSessions.destroy({ where: { search_id: searchId } });
		return null;
	}

	const state = {
		userId: savedState.user_id,
		criteria: JSON.parse(savedState.criteria),
		results: JSON.parse(savedState.results),
		expiresAt: savedState.expires_at,
	};
	const timeout = setTimeout(
		() => searchCache.delete(searchId),
		Math.max(savedState.expires_at - Date.now(), 1),
	);

	if (typeof timeout.unref === `function`) {
		timeout.unref();
	}

	searchCache.set(searchId, state);

	return state;
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName(`paldeck`)
		.setDescription(`Access the paldeck.`)
		.addSubcommand(subcommand =>
			subcommand
				.setName(`name`)
				.setDescription(`Search for a pal by name.`)
				.addStringOption(option =>
					option
						.setName(`name`)
						.setDescription(`Name of a pal.`)
						.setAutocomplete(true)
						.setRequired(true)))
		.addSubcommand(subcommand =>
			subcommand
				.setName(`number`)
				.setDescription(`Search for a pal by number.`)
				.addStringOption(option =>
					option
						.setName(`number`)
						.setDescription(`Number of a pal.`)
						.setRequired(true)))
		.addSubcommand(subcommand =>
			subcommand
				.setName(`search`)
				.setDescription(`Search for pals based on various criteria.`)
				.addStringOption(option =>
					option
						.setName(`element`)
						.setDescription(`List pals based on element type.`)
						.addChoices(...ELEMENT_CHOICES))
				.addStringOption(option =>
					option
						.setName(`suitability`)
						.setDescription(`Match all suitabilities in a comma-separated list.`)
						.setAutocomplete(true))
				.addStringOption(option =>
					option
						.setName(`rarity`)
						.setDescription(`List pals based on rarity.`)
						.addChoices(...RARITY_CHOICES))
				.addStringOption(option =>
					option
						.setName(`drops`)
						.setDescription(`Lists pals based on drops.`)
						.setAutocomplete(true))
				.addStringOption(option =>
					option
						.setName(`farmable`)
						.setDescription(`Lists pals based on farmed material.`)
						.setAutocomplete(true))),
	async autocomplete(interaction) {
		const focusedOption = interaction.options.getFocused(true);
		await interaction.respond(autocompleteChoices(focusedOption.name, focusedOption.value));
	},

	async execute(interaction) {
		const subcommand = interaction.options.getSubcommand();

		if (subcommand === `name`) {
			const palName = interaction.options.getString(`name`);
			const pal = PALS.find(palData => normalizeText(palData.name) === normalizeText(palName));

			if (!pal) {
				await interaction.reply({ content: `Nothing found.`, flags: MessageFlags.Ephemeral });
				return;
			}

			await interaction.reply(buildPalResponse(pal, interaction.user.id));
			return;
		}

		if (subcommand === `number`) {
			const palNumber = normalizeNumber(interaction.options.getString(`number`));
			const matches = PALS.filter(palData => normalizeNumber(palData.number) === palNumber);

			if (!matches.length) {
				await interaction.reply({ content: `Nothing found.`, flags: MessageFlags.Ephemeral });
				return;
			}

			if (matches.length > 1) {
				await interaction.reply({ embeds: [buildNumberMatchesEmbed(interaction.options.getString(`number`), matches)] });
				return;
			}

			await interaction.reply(buildPalResponse(matches[0], interaction.user.id));
			return;
		}

		const criteria = {
			element: interaction.options.getString(`element`) || ``,
			suitability: interaction.options.getString(`suitability`) || ``,
			rarity: interaction.options.getString(`rarity`) || ``,
			drops: interaction.options.getString(`drops`) || ``,
			farmable: interaction.options.getString(`farmable`) || ``,
		};

		if (!criteriaHasValue(criteria)) {
			await interaction.reply({ content: `Choose at least one search filter.`, flags: MessageFlags.Ephemeral });
			return;
		}

		const results = findSearchResults(criteria);

		if (!results.length) {
			await interaction.reply({ content: `Nothing found.`, flags: MessageFlags.Ephemeral });
			return;
		}

		const page = 0;
		const totalPages = getTotalPages(results);
		const searchId = await storeSearch({ userId: interaction.user.id, criteria, results });

		await interaction.reply({
			embeds: [buildSearchEmbed(criteria, results, page)],
			components: buildSearchComponents({ searchId, page, totalPages }),
		});
	},

	async handleButton(interaction) {
		const [, action, searchId, rawPage] = interaction.customId.split(`:`);

		if (action === `back`) {
			if (rawPage !== interaction.user.id) {
				await interaction.reply({ content: UNAUTHORIZED_CONTROL_MESSAGE, flags: MessageFlags.Ephemeral });
				return;
			}

			const pal = palByNumber(decodeURIComponent(searchId));

			if (!pal) {
				await interaction.reply({ content: `That Pal is no longer available.`, flags: MessageFlags.Ephemeral });
				return;
			}

			await replaceInteractionMessage(interaction, buildPalResponse(pal, rawPage));
			return;
		}

		if (action === `drops`) {
			if (rawPage !== interaction.user.id) {
				await interaction.reply({ content: UNAUTHORIZED_CONTROL_MESSAGE, flags: MessageFlags.Ephemeral });
				return;
			}

			const pal = palByNumber(decodeURIComponent(searchId));
			const select = pal && buildDropSelect(pal, rawPage);

			if (!select) {
				await interaction.reply({ content: `No item details are available for this Pal's drops.`, flags: MessageFlags.Ephemeral });
				return;
			}

			// Keep navigation on the public Pal message so its owner can search repeatedly or return cleanly.
			const backRow = new ActionRowBuilder().addComponents(buildBackToPalButton(pal.number, rawPage));
			await interaction.update({ components: [interaction.message.components[0], select, backRow] });
			return;
		}

		if (action === `moves`) {
			await showLearnedMoves(interaction, searchId, rawPage, {
				colors: PAL_COLORS, palByNumber, unauthorizedMessage: UNAUTHORIZED_CONTROL_MESSAGE,
			});
			return;
		}

		if (action !== `page`) {
			await interaction.reply({ content: `Unknown Paldeck action.`, flags: MessageFlags.Ephemeral });
			return;
		}

		const state = await getSearch(searchId);

		if (!state) {
			await interaction.reply({ content: `This search has expired. Run the command again.`, flags: MessageFlags.Ephemeral });
			return;
		}

		if (state.userId !== interaction.user.id) {
			await interaction.reply({ content: UNAUTHORIZED_CONTROL_MESSAGE, flags: MessageFlags.Ephemeral });
			return;
		}

		const totalPages = getTotalPages(state.results);
		const page = clampPage(Number(rawPage), totalPages);

		await replaceInteractionMessage(interaction, {
			embeds: [buildSearchEmbed(state.criteria, state.results, page)],
			components: buildSearchComponents({
				searchId,
				page,
				totalPages,
				originPalNumber: state.originPalNumber,
				originItemId: state.originItemId,
				ownerId: state.ownerId,
			}),
		});
	},

	async handleSelectMenu(interaction) {
		const [, action, rawPalNumber, ownerId] = interaction.customId.split(`:`);

		if (action !== `drop`) {
			await interaction.reply({ content: `Unknown Paldeck menu.`, flags: MessageFlags.Ephemeral });
			return;
		}

		if (ownerId !== interaction.user.id) {
			await interaction.reply({ content: UNAUTHORIZED_CONTROL_MESSAGE, flags: MessageFlags.Ephemeral });
			return;
		}

		const pal = palByNumber(decodeURIComponent(rawPalNumber));
		const item = ITEMS_BY_ID.get(interaction.values[0]);

		if (!pal || !item || !distinctPalDrops(pal).some(drop => normalizeText(drop) === normalizeText(item.name))) {
			await interaction.reply({ content: `That drop is no longer available for this Pal.`, flags: MessageFlags.Ephemeral });
			return;
		}

		await replaceInteractionMessage(interaction, buildItemResponse(item, pal, ownerId));
	},

	buildItemResponse,
	buildMerchantResponse,
	buildMedalMerchantResponse,
	buildBountyMerchantResponse,
	buildArenaMerchantResponse,
	buildSourceDetailsResponse,
	replyWithDroppingPals,
};
