const {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	EmbedBuilder,
	MessageFlags,
	SlashCommandBuilder,
} = require(`discord.js`);
const crypto = require(`node:crypto`);
const breedingFile = require(`../../../data/palBreeding.json`);
const palFile = require(`../../../data/palData.json`);
const { createBreedingCalculator, formatBreedingMethod, normalizeBreedingName } = require(`../../../utils/palBreeding.js`);
const { getPalColor } = require(`../../../utils/palColors.js`);

const PAGE_SIZE = 10;
const LIST_TTL_MS = 15 * 60 * 1000;
const calculator = createBreedingCalculator(breedingFile);
const PAL_COLORS = palFile.Colors?.[0] || {};
const PAL_DATA_BY_NAME = new Map(palFile.Pals.map(pal => [normalizeBreedingName(pal.name), pal]));
const listCache = new Map();

function formatPalLabel(pal) {
	const number = pal.number ? `#${pal.number} ` : ``;

	return `${number}${pal.name}`;
}

function getLocalPalData(pal) {
	return PAL_DATA_BY_NAME.get(normalizeBreedingName(pal.name)) || null;
}

function getResultColor(pal) {
	const localPal = getLocalPalData(pal);

	if (localPal) {
		return getPalColor(localPal, PAL_COLORS);
	}

	return PAL_COLORS.Neutral || [255, 255, 255];
}

function formatRank(pal) {
	return `${pal.breedingRank}`;
}

function formatMethod(result) {
	const targetRank = result.targetRank === null ? `` : ` | Target rank: ${result.targetRank}`;

	return `${formatBreedingMethod(result.method)}${targetRank}`;
}

function formatPairLine(result) {
	const method = result.method === `special` ? ` - ${formatBreedingMethod(result.method)}` : ``;

	return `${formatPalLabel(result.parentA)} + ${formatPalLabel(result.parentB)}${method}`;
}

function formatPartnerLine(entry) {
	const method = entry.result.method === `special` ? ` - ${formatBreedingMethod(entry.result.method)}` : ``;

	return `${formatPalLabel(entry.partner)}${method}`;
}

function getAutocompleteChoices(optionName) {
	const pals = optionName === `child` ? calculator.childPals : calculator.parentPals;

	return pals.map(pal => ({
		name: formatPalLabel(pal).slice(0, 100),
		value: pal.name,
	}));
}

function buildResultEmbed(result) {
	const fields = [
		{ name: `Child`, value: formatPalLabel(result.child), inline: false },
		{ name: `Method`, value: formatMethod(result), inline: false },
		{ name: `Parent Ranks`, value: `${formatRank(result.parentA)} + ${formatRank(result.parentB)}`, inline: true },
		{ name: `Child Rank`, value: formatRank(result.child), inline: true },
	];

	return new EmbedBuilder()
		.setColor(getResultColor(result.child))
		.setTitle(`${result.parentA.name} + ${result.parentB.name}`)
		.setDescription(`Breeding result`)
		.addFields(fields);
}

function getTotalPages(lines) {
	return Math.max(1, Math.ceil(lines.length / PAGE_SIZE));
}

function clampPage(page, totalPages) {
	return Math.min(Math.max(page, 0), totalPages - 1);
}

function buildListEmbed(state, page) {
	const totalPages = getTotalPages(state.lines);
	const currentPage = clampPage(page, totalPages);
	const pageLines = state.lines.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
	const start = currentPage * PAGE_SIZE;
	const list = pageLines
		.map((line, index) => `${start + index + 1}. ${line}`)
		.join(`\n`);

	return new EmbedBuilder()
		.setColor(state.color)
		.setTitle(state.title)
		.setDescription(`${state.description}\n\n${list || state.emptyText}`)
		.setFooter({ text: `Page ${currentPage + 1}/${totalPages} | ${state.lines.length} result(s)` });
}

function buildListComponents(listId, page, totalPages) {
	if (totalPages <= 1) {
		return [];
	}

	return [
		new ActionRowBuilder().addComponents(
			new ButtonBuilder()
				.setCustomId(`breed:page:${listId}:${page - 1}`)
				.setLabel(`<`)
				.setStyle(ButtonStyle.Secondary)
				.setDisabled(page <= 0),
			new ButtonBuilder()
				.setCustomId(`breed:page:${listId}:${page + 1}`)
				.setLabel(`>`)
				.setStyle(ButtonStyle.Secondary)
				.setDisabled(page >= totalPages - 1),
		),
	];
}

function storeList(userId, state) {
	const listId = crypto.randomUUID();
	const expiresAt = Date.now() + LIST_TTL_MS;
	const timeout = setTimeout(() => listCache.delete(listId), LIST_TTL_MS);

	if (typeof timeout.unref === `function`) {
		timeout.unref();
	}

	listCache.set(listId, {
		...state,
		expiresAt,
		userId,
	});

	return listId;
}

async function replyWithList(interaction, state) {
	const page = 0;
	const totalPages = getTotalPages(state.lines);
	const listId = storeList(interaction.user.id, state);

	await interaction.reply({
		embeds: [buildListEmbed(state, page)],
		components: buildListComponents(listId, page, totalPages),
	});
}

function getList(listId) {
	const state = listCache.get(listId);

	if (!state) {
		return null;
	}

	if (state.expiresAt <= Date.now()) {
		listCache.delete(listId);
		return null;
	}

	return state;
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName(`breed`)
		.setDescription(`Calculate Pal breeding results.`)
		.addSubcommand(subcommand =>
			subcommand
				.setName(`result`)
				.setDescription(`Find the child produced by two parents.`)
				.addStringOption(option =>
					option
						.setName(`parent1`)
						.setDescription(`First parent Pal.`)
						.setAutocomplete(true)
						.setRequired(true))
				.addStringOption(option =>
					option
						.setName(`parent2`)
						.setDescription(`Second parent Pal.`)
						.setAutocomplete(true)
						.setRequired(true)))
		.addSubcommand(subcommand =>
			subcommand
				.setName(`parents`)
				.setDescription(`Find parent pairs that produce a child.`)
				.addStringOption(option =>
					option
						.setName(`child`)
						.setDescription(`Desired child Pal.`)
						.setAutocomplete(true)
						.setRequired(true)))
		.addSubcommand(subcommand =>
			subcommand
				.setName(`partner`)
				.setDescription(`Find partners for a parent to produce a child.`)
				.addStringOption(option =>
					option
						.setName(`parent`)
						.setDescription(`Known parent Pal.`)
						.setAutocomplete(true)
						.setRequired(true))
				.addStringOption(option =>
					option
						.setName(`child`)
						.setDescription(`Desired child Pal.`)
						.setAutocomplete(true)
						.setRequired(true))),

	async autocomplete(interaction) {
		const focusedOption = interaction.options.getFocused(true);
		const focusedValue = normalizeBreedingName(focusedOption.value);
		const filtered = getAutocompleteChoices(focusedOption.name)
			.filter(choice => normalizeBreedingName(`${choice.name} ${choice.value}`).includes(focusedValue))
			.slice(0, 25);

		await interaction.respond(filtered);
	},

	async execute(interaction) {
		const subcommand = interaction.options.getSubcommand();

		if (subcommand === `result`) {
			const result = calculator.calculateChild(
				interaction.options.getString(`parent1`),
				interaction.options.getString(`parent2`),
			);

			if (!result?.child) {
				await interaction.reply({ content: `I couldn't find one of those Pals in the breeding data.`, flags: MessageFlags.Ephemeral });
				return;
			}

			await interaction.reply({ embeds: [buildResultEmbed(result)] });
			return;
		}

		if (subcommand === `parents`) {
			const childName = interaction.options.getString(`child`);
			const result = calculator.findParentPairs(childName);

			if (!result) {
				await interaction.reply({ content: `I couldn't find that child Pal in the breeding data.`, flags: MessageFlags.Ephemeral });
				return;
			}

			await replyWithList(interaction, {
				color: getResultColor(result.child),
				description: `Parent pairs that produce ${formatPalLabel(result.child)}.`,
				emptyText: `No parent pairs found.`,
				lines: result.pairs.map(formatPairLine),
				title: `Breeding Parents`,
			});
			return;
		}

		if (subcommand === `partner`) {
			const result = calculator.findPartners(
				interaction.options.getString(`parent`),
				interaction.options.getString(`child`),
			);

			if (!result) {
				await interaction.reply({ content: `I couldn't find that parent or child Pal in the breeding data.`, flags: MessageFlags.Ephemeral });
				return;
			}

			await replyWithList(interaction, {
				color: getResultColor(result.child),
				description: `Partners for ${formatPalLabel(result.parent)} to produce ${formatPalLabel(result.child)}.`,
				emptyText: `No partners found.`,
				lines: result.partners.map(formatPartnerLine),
				title: `Breeding Partners`,
			});
		}
	},

	async handleButton(interaction) {
		const [, action, listId, rawPage] = interaction.customId.split(`:`);

		if (action !== `page`) {
			await interaction.reply({ content: `Unknown breed action.`, flags: MessageFlags.Ephemeral });
			return;
		}

		const state = getList(listId);

		if (!state) {
			await interaction.reply({ content: `This breeding list has expired. Run the command again.`, flags: MessageFlags.Ephemeral });
			return;
		}

		if (state.userId !== interaction.user.id) {
			await interaction.reply({ content: `Only the original searcher can page through these results.`, flags: MessageFlags.Ephemeral });
			return;
		}

		const totalPages = getTotalPages(state.lines);
		const page = clampPage(Number(rawPage), totalPages);

		await interaction.update({
			embeds: [buildListEmbed(state, page)],
			components: buildListComponents(listId, page, totalPages),
		});
	},
};
