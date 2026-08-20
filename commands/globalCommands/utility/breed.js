const {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	EmbedBuilder,
	MessageFlags,
	SlashCommandBuilder,
	StringSelectMenuBuilder,
} = require(`discord.js`);
const crypto = require(`node:crypto`);
const breedingFile = require(`../../../data/palBreeding.json`);
const palFile = require(`../../../data/palData.json`);
const { createBreedingCalculator, normalizeBreedingName } = require(`../../../utils/palBreeding.js`);
const { getPalColor } = require(`../../../utils/palColors.js`);
const { replaceInteractionMessage } = require(`../../../utils/interactionNavigation.js`);
const { buildBackToPalButton } = require(`../../../utils/palDrops.js`);

const PAGE_SIZE = 10;
const LIST_TTL_MS = 15 * 60 * 1000;
const calculator = createBreedingCalculator(palFile, breedingFile);
const PAL_COLORS = palFile.Colors?.[0] || {};
const PAL_DATA_BY_NAME = new Map(palFile.Pals.map(pal => [normalizeBreedingName(pal.name), pal]));
const listCache = new Map();

function formatPalLabel(pal) {
	return pal.name;
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

function formatGender(value) {
	return value || `any`;
}

function formatGenderedChildLine(entry) {
	return `${formatPalLabel(entry.parentA)} (${formatGender(entry.parentAGender)}) + ${formatPalLabel(entry.parentB)} (${formatGender(entry.parentBGender)}) -> ${formatPalLabel(entry.child)}`;
}

function formatChildField(result) {
	if (result.method === `gendered-pair-result`) {
		return result.children.map(formatGenderedChildLine).join(`\n`);
	}

	return formatPalLabel(result.child);
}

function formatGenderedRequirement(result) {
	const entry = result.children?.[0];

	if (result.method !== `gendered-pair-result` || !entry) {
		return ``;
	}

	return ` - ${formatPalLabel(entry.parentA)} ${formatGender(entry.parentAGender)}, ${formatPalLabel(entry.parentB)} ${formatGender(entry.parentBGender)}`;
}

function formatPairLine(result) {
	const genders = formatGenderedRequirement(result);

	return `${formatPalLabel(result.parentA)} + ${formatPalLabel(result.parentB)}${genders}`;
}

function formatPartnerLine(entry) {
	const genders = formatGenderedRequirement(entry.result);

	return `${formatPalLabel(entry.partner)}${genders}`;
}

function getAutocompleteChoices(optionName) {
	const pals = optionName === `child` ? calculator.childPals : calculator.parentPals;

	return pals.map(pal => ({
		name: pal.name.slice(0, 100),
		value: pal.name,
	}));
}

function buildResultEmbed(result) {
	const fields = [
		{ name: result.method === `gendered-pair-result` ? `Children` : `Child`, value: formatChildField(result), inline: false },
	];
	if (result.method === `standard`) {
		fields.push({ name: `Target Rank`, value: `${result.targetRank}${result.rankModifier ? ` (CombiRankBonus +${result.rankModifier})` : ``}`, inline: false });
	}

	return new EmbedBuilder()
		.setColor(getResultColor(result.child))
		.setTitle(`${result.parentA.name} + ${result.parentB.name}`)
		.setDescription(`Breeding result`)
		.addFields(fields);
}

function buildMutationButton(parentA, parentB, userId, rankModifier = 0) {
	return new ButtonBuilder()
		.setCustomId(`breed:mutations:${encodeURIComponent(parentA.name)}:${encodeURIComponent(parentB.name)}:${userId}:${rankModifier}`)
		.setLabel(`View Mutated Children`)
		.setStyle(ButtonStyle.Primary);
}

function buildResultComponents(result, userId) {
	return [new ActionRowBuilder().addComponents(buildMutationButton(result.parentA, result.parentB, userId, result.rankModifier))];
}

function buildMutationBackButton(backTarget) {
	if (backTarget.type === `list`) {
		return new ButtonBuilder()
			.setCustomId(`breed:mutation-back-list:${backTarget.listId}:${backTarget.page}:${backTarget.userId}`)
			.setLabel(backTarget.label)
			.setStyle(ButtonStyle.Secondary);
	}
	return new ButtonBuilder()
		.setCustomId(`breed:mutation-back-result:${encodeURIComponent(backTarget.parentA)}:${encodeURIComponent(backTarget.parentB)}:${backTarget.userId}:${backTarget.rankModifier || 0}`)
		.setLabel(`Back to Result`)
		.setStyle(ButtonStyle.Secondary);
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

	const footer = totalPages > 1 ? `Page ${currentPage + 1}/${totalPages} | ${state.lines.length} result(s)` : `${state.lines.length} result(s)`;
	return new EmbedBuilder()
		.setColor(state.color)
		.setTitle(state.title)
		.setDescription(`${state.description}\n\n${list || state.emptyText}`)
		.setFooter({ text: footer });
}

function buildListComponents(listId, page, totalPages, state) {
	const rows = [];
	if (totalPages > 1) {
		rows.push(new ActionRowBuilder().addComponents(
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
		));
	}
	const mutationPairs = state.mutationPairs?.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE) || [];
	if (mutationPairs.length) {
		rows.push(new ActionRowBuilder().addComponents(
			new StringSelectMenuBuilder()
				.setCustomId(`breed:mutation-select:${listId}`)
				.setPlaceholder(`View Mutation Chances`)
				.addOptions(mutationPairs.map((pair, index) => ({
					label: `${pair.parentA} + ${pair.parentB}`.slice(0, 100),
					value: `${page * PAGE_SIZE + index}`,
				}))),
		));
	}
	if (state.mutationParentChild) {
		rows.push(new ActionRowBuilder().addComponents(
			new ButtonBuilder()
				.setCustomId(`breed:mutation-parents:${encodeURIComponent(state.mutationParentChild)}:${listId}:${page}:${state.userId}`)
				.setLabel(`View Mutated Egg Parents`)
				.setStyle(ButtonStyle.Primary),
		));
	}
	if (state.originPalNumber && state.originOwnerId) {
		rows.push(new ActionRowBuilder().addComponents(
			buildBackToPalButton(state.originPalNumber, state.originOwnerId),
		));
	}
	if (state.mutationBackTarget) {
		rows.push(new ActionRowBuilder().addComponents(buildMutationBackButton(state.mutationBackTarget)));
	}
	return rows;
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
	const renderedState = { ...state, userId: interaction.user.id };
	const totalPages = getTotalPages(renderedState.lines);
	const listId = storeList(interaction.user.id, renderedState);

	const payload = {
		embeds: [buildListEmbed(renderedState, page)],
		components: buildListComponents(listId, page, totalPages, renderedState),
	};
	if (state.replaceCurrent || state.originPalNumber) {
		await replaceInteractionMessage(interaction, payload);
		return;
	}
	await interaction.reply(payload);
}

function formatProbability(outcome) {
	const percent = (outcome.probability * 100).toFixed(2).replace(/\.00$/, ``);
	return `${outcome.name} (${percent}%)`;
}

function formatMutationParentPair(pair) {
	const percent = (pair.probability * 100).toFixed(2).replace(/\.00$/, ``);
	return `${pair.parentA.name} + ${pair.parentB.name} (${percent}%)`;
}

function sortMutationOutcomes(first, second) {
	return second.probability - first.probability || first.name.localeCompare(second.name);
}

async function replyWithPairMutationChildren(interaction, parentAName, parentBName, mutationBackTarget) {
	const result = calculator.getMutatedChildrenForParents(parentAName, parentBName);
	if (!result) {
		await interaction.reply({ content: `I couldn't find mutation data for those parents.`, flags: MessageFlags.Ephemeral });
		return;
	}
	await replyWithList(interaction, {
		color: getResultColor(result.children[0] || result.parentA),
		description: `Possible Alpha children from a mutated egg.`,
		emptyText: `No mutated children found.`,
		lines: [...result.outcomes].sort(sortMutationOutcomes).map(formatProbability),
		mutationBackTarget,
		replaceCurrent: true,
		title: `${result.parentA.name} + ${result.parentB.name} — ${result.children.length === 1 ? `Mutated Child` : `Mutated Children`}`,
	});
}

async function replyWithParentPairs(interaction, childName, origin = {}) {
	const result = calculator.findParentPairs(childName);

	if (!result) {
		await interaction.reply({ content: `I couldn't find that child Pal in the breeding data.`, flags: MessageFlags.Ephemeral });
		return;
	}

	const mutationParents = calculator.findMutationParentPairs(result.child.name);
	await replyWithList(interaction, {
		color: getResultColor(result.child),
		description: `Parent pairs that produce ${formatPalLabel(result.child)}.`,
		emptyText: `No parent pairs found.`,
		lines: result.pairs.map(formatPairLine),
		mutationParentChild: mutationParents?.pairs.length ? result.child.name : null,
		title: `Breeding Parents`,
		...origin,
	});
}

async function replyWithMutationParentPairs(interaction, childName, mutationBackTarget) {
	const result = calculator.findMutationParentPairs(childName);
	if (!result) {
		await interaction.reply({ content: `I couldn't find that Pal in the mutation data.`, flags: MessageFlags.Ephemeral });
		return;
	}
	await replyWithList(interaction, {
		color: getResultColor(result.child),
		description: `Parent pairs that can produce ${result.child.name} from a mutated egg. Percentages are conditional on receiving a mutated egg.`,
		emptyText: `No mutated-egg parent pairs found.`,
		lines: result.pairs.map(formatMutationParentPair),
		mutationBackTarget,
		replaceCurrent: true,
		title: `${result.child.name} — Mutated Egg Parents`,
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

async function handleMutationResultBack(interaction) {
	const [, , rawParentA, rawParentB, ownerId, rawRankModifier] = interaction.customId.split(`:`);
	if (ownerId !== interaction.user.id) {
		await interaction.reply({ content: `I'm not your button, pal!`, flags: MessageFlags.Ephemeral });
		return;
	}
	const result = calculator.calculateChild(decodeURIComponent(rawParentA), decodeURIComponent(rawParentB), {
		rankModifier: Number(rawRankModifier) || 0,
	});
	await interaction.update({
		components: buildResultComponents(result, interaction.user.id),
		embeds: [buildResultEmbed(result)],
	});
}

async function handleMutationListBack(interaction) {
	const [, , originalListId, originalPage, ownerId] = interaction.customId.split(`:`);
	const originalState = getList(originalListId);
	if (!originalState || ownerId !== interaction.user.id || originalState.userId !== interaction.user.id) {
		await interaction.reply({ content: `This breeding list has expired. Run the command again.`, flags: MessageFlags.Ephemeral });
		return;
	}
	const totalPages = getTotalPages(originalState.lines);
	const page = clampPage(Number(originalPage), totalPages);
	await interaction.update({
		components: buildListComponents(originalListId, page, totalPages, originalState),
		embeds: [buildListEmbed(originalState, page)],
	});
}

async function handleListPage(interaction, listId, rawPage) {
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
		components: buildListComponents(listId, page, totalPages, state),
	});
}

async function handleMutationParentsButton(interaction, { childName, ownerId, sourceListId, sourcePage }) {
	const sourceState = getList(sourceListId);
	if (ownerId !== interaction.user.id || !sourceState || sourceState.userId !== interaction.user.id) {
		await interaction.reply({ content: `I'm not your button, pal!`, flags: MessageFlags.Ephemeral });
		return;
	}
	await replyWithMutationParentPairs(interaction, childName, {
		label: `Back to Parent Pairs`,
		listId: sourceListId,
		page: Number(sourcePage) || 0,
		type: `list`,
		userId: ownerId,
	});
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
						.setRequired(true)),
		)
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

			await interaction.reply({
				components: buildResultComponents(result, interaction.user.id),
				embeds: [buildResultEmbed(result)],
			});
			return;
		}

		if (subcommand === `parents`) {
			await replyWithParentPairs(interaction, interaction.options.getString(`child`));
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
				mutationBackLabel: `Back to Partners`,
				mutationPairs: result.partners.map(entry => ({ parentA: entry.result.parentA.name, parentB: entry.result.parentB.name })),
				title: `Breeding Partners`,
			});
		}
	},

	async handleButton(interaction) {
		const [, action, listId, rawPage, rawPalNumber, rawRankModifier] = interaction.customId.split(`:`);

		if (action === `parents`) {
			if (rawPage && rawPage !== interaction.user.id) {
				await interaction.reply({ content: `I'm not your button, pal!`, flags: MessageFlags.Ephemeral });
				return;
			}
			await replyWithParentPairs(interaction, decodeURIComponent(listId), {
				originOwnerId: rawPage || null,
				originPalNumber: rawPalNumber ? decodeURIComponent(rawPalNumber) : null,
			});
			return;
		}

		if (action === `mutations`) {
			if (rawPalNumber !== interaction.user.id) {
				await interaction.reply({ content: `I'm not your button, pal!`, flags: MessageFlags.Ephemeral });
				return;
			}
			await replyWithPairMutationChildren(
				interaction,
				decodeURIComponent(listId),
				decodeURIComponent(rawPage),
				{
					parentA: decodeURIComponent(listId),
					parentB: decodeURIComponent(rawPage),
					rankModifier: Number(rawRankModifier) || 0,
					type: `result`,
					userId: rawPalNumber,
				},
			);
			return;
		}

		if (action === `mutation-parents`) {
			await handleMutationParentsButton(interaction, {
				childName: decodeURIComponent(listId),
				ownerId: rawRankModifier,
				sourceListId: rawPage,
				sourcePage: rawPalNumber,
			});
			return;
		}

		if (action === `mutation-back-result`) {
			await handleMutationResultBack(interaction);
			return;
		}

		if (action === `mutation-back-list`) {
			await handleMutationListBack(interaction);
			return;
		}

		if (action !== `page`) {
			await interaction.reply({ content: `Unknown breed action.`, flags: MessageFlags.Ephemeral });
			return;
		}

		await handleListPage(interaction, listId, rawPage);
	},

	async handleSelectMenu(interaction) {
		const [, action, listId] = interaction.customId.split(`:`);
		const state = getList(listId);

		if (action !== `mutation-select` || !state) {
			await interaction.reply({ content: `This breeding list has expired. Run the command again.`, flags: MessageFlags.Ephemeral });
			return;
		}
		if (state.userId !== interaction.user.id) {
			await interaction.reply({ content: `Only the original searcher can use this menu.`, flags: MessageFlags.Ephemeral });
			return;
		}
		const pair = state.mutationPairs?.[Number(interaction.values[0])];
		if (!pair) {
			await interaction.reply({ content: `I couldn't find that breeding pair.`, flags: MessageFlags.Ephemeral });
			return;
		}
		const selectedIndex = Number(interaction.values[0]);
		await replyWithPairMutationChildren(interaction, pair.parentA, pair.parentB, {
			label: state.mutationBackLabel,
			listId,
			page: Math.floor(selectedIndex / PAGE_SIZE),
			type: `list`,
			userId: interaction.user.id,
		});
	},
};
