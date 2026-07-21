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
const { Op } = require(`sequelize`);
const { SearchSessions } = require(`../../../database/dbObjects.js`);
const palFile = require(`../../../data/palData.json`);
const { getPalColor } = require(`../../../utils/palColors.js`);

const PALS = palFile.Pals.filter(pal => !pal.hidden);
const PAL_COLORS = palFile.Colors?.[0] || {};
const PROJECT_ROOT = path.resolve(__dirname, `..`, `..`, `..`);
const RESULTS_PER_PAGE = 25;
const SEARCH_TTL_MS = 15 * 60 * 1000;
const searchCache = new Map();

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
const ANCIENT_RELIC_LABEL = `Ancient Relics`;
const ANCIENT_RELIC_DROPS = new Set([
	`Decayed Ancient Relic`,
	`Dormant Ancient Relic`,
	`Glistening Ancient Relic`,
	`Glowing Ancient Relic`,
	`Gorgeous Ancient Relic`,
].map(value => value.toLowerCase()));

function splitValues(value) {
	return String(value || ``)
		.split(`,`)
		.map(entry => entry.trim())
		.filter(Boolean);
}

function uniqueSorted(values) {
	return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function worldTreeDropEntries(pal) {
	return Object.entries(pal.worldTreeDrops || {})
		.filter(([, value]) => String(value || ``).trim())
		.sort(([firstLevel], [secondLevel]) => Number(firstLevel) - Number(secondLevel));
}

function worldTreeDropValues(pal) {
	return worldTreeDropEntries(pal).flatMap(([, value]) => splitValues(value));
}

function isAncientRelicDrop(value) {
	return ANCIENT_RELIC_DROPS.has(String(value || ``).trim().toLowerCase());
}

function collapseAncientRelicDrops(values) {
	const collapsed = [];
	let addedRelicLabel = false;

	for (const value of values) {
		// Keep exact relic names in palData, but avoid repeating five relic variants in the embed.
		if (isAncientRelicDrop(value)) {
			if (!addedRelicLabel) {
				collapsed.push(ANCIENT_RELIC_LABEL);
				addedRelicLabel = true;
			}

			continue;
		}

		collapsed.push(value);
	}

	return collapsed;
}

function formatWorldTreeDrops(pal) {
	return worldTreeDropEntries(pal)
		.map(([level, value]) => `Lv.${level}: ${collapseAncientRelicDrops(splitValues(value)).join(`, `)}`)
		.join(`\n`);
}

function searchableDropValues(pal) {
	const values = [
		...splitValues(pal.drops),
		...worldTreeDropValues(pal),
	];

	if (values.some(isAncientRelicDrop)) {
		values.push(ANCIENT_RELIC_LABEL);
	}

	return values;
}

function autocompleteDropValues(pal) {
	return [
		...splitValues(pal.drops),
		...collapseAncientRelicDrops(worldTreeDropValues(pal)),
	];
}

function farmableValues(pal) {
	const farmable = String(pal.farmable || ``).trim();

	if (!farmable.startsWith(`Yes - `)) {
		return [];
	}

	return splitValues(farmable.slice(`Yes - `.length));
}

const AUTOCOMPLETE_CHOICES = {
	name: uniqueSorted(PALS.map(pal => pal.name)),
	suitability: uniqueSorted(PALS.flatMap(pal => splitValues(pal.suitability))),
	drops: uniqueSorted(PALS.flatMap(autocompleteDropValues)),
	farmable: uniqueSorted(PALS.flatMap(farmableValues)),
};

function normalizeText(value) {
	return String(value || ``).trim().toLowerCase();
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
		{ name: `Drops:`, value: pal.drops },
	];
	const worldTreeDrops = formatWorldTreeDrops(pal);

	if (worldTreeDrops) {
		fields.push({ name: `World Tree Drops:`, value: worldTreeDrops });
	}

	fields.push(
		{ name: `Work Suitability:`, value: pal.suitability },
		{ name: `Partner Skill:`, value: pal.partner },
	);

	if (pal.tech) {
		fields.push({ name: `Tech:`, value: pal.tech });
	}

	const embed = new EmbedBuilder()
		.setAuthor({ name: `Rarity: ${rarity}`, url: `https://palworld.gg/breeding-calculator` })
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

function buildPalResponse(pal) {
	const thumbnail = resolveLocalImage(pal.thumbnail);
	const habitat = resolveLocalImage(pal.habitat);

	return {
		embeds: [buildPalEmbed(pal, thumbnail.url, habitat.url)],
		files: [...thumbnail.files, ...habitat.files],
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

	return new EmbedBuilder()
		.setTitle(`Matching:`)
		.setDescription(buildCriteriaLine(criteria))
		.setFooter({ text: `Page ${currentPage + 1}/${totalPages} | ${results.length} result(s)` })
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

function buildSearchComponents(searchId, page, totalPages) {
	if (totalPages <= 1) {
		return [];
	}

	return [
		new ActionRowBuilder().addComponents(
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
		),
	];
}

async function storeSearch(userId, criteria, results) {
	const searchId = crypto.randomUUID();
	const expiresAt = Date.now() + SEARCH_TTL_MS;
	const state = { userId, criteria, results, expiresAt };
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
						.setDescription(`List pals based on suitabilities.`)
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
		const choices = AUTOCOMPLETE_CHOICES[focusedOption.name] || [];
		const filtered = choices
			.filter(choice => normalizeText(choice).includes(normalizeText(focusedOption.value)))
			.slice(0, 25);

		await interaction.respond(
			filtered.map(choice => ({ name: choice, value: choice })),
		);
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

			await interaction.reply(buildPalResponse(pal));
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

			await interaction.reply(buildPalResponse(matches[0]));
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
		const searchId = await storeSearch(interaction.user.id, criteria, results);

		await interaction.reply({
			embeds: [buildSearchEmbed(criteria, results, page)],
			components: buildSearchComponents(searchId, page, totalPages),
		});
	},

	async handleButton(interaction) {
		const [, action, searchId, rawPage] = interaction.customId.split(`:`);

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
			await interaction.reply({ content: `Only the original searcher can page through these results.`, flags: MessageFlags.Ephemeral });
			return;
		}

		const totalPages = getTotalPages(state.results);
		const page = clampPage(Number(rawPage), totalPages);

		await interaction.update({
			embeds: [buildSearchEmbed(state.criteria, state.results, page)],
			components: buildSearchComponents(searchId, page, totalPages),
		});
	},
};
