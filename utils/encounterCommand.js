const path = require(`node:path`);
const { AttachmentBuilder, EmbedBuilder, MessageFlags, SlashCommandBuilder } = require(`discord.js`);
const { completionRewards, derivedEncounterHp, encountersFor, findEncounter, GAME_MAX_LEVEL, ROOT_DIR } = require(`./encounterRecommendations.js`);

function normalize(value) {
	return String(value || ``).toLowerCase().replace(/[^a-z0-9]+/gu, ` `).trim();
}

function commandData(command) {
	const optionName = command === `tower` ? `tower` : `raid`;
	return new SlashCommandBuilder()
		.setName(command)
		.setDescription(command === `tower` ? `Get a team recommendation, rewards, and location for a tower or progression boss.` : `Get flexible team guidance and completion rewards for a raid boss.`)
		.addSubcommand(subcommand => subcommand.setName(`normal`).setDescription(`Get a Normal difficulty recommendation.`)
			.addStringOption(option => option.setName(optionName).setDescription(`Encounter to prepare for.`).setAutocomplete(true).setRequired(true)))
		.addSubcommand(subcommand => subcommand.setName(`hard`).setDescription(`Get a Hard, Ultra, or Master difficulty recommendation.`)
			.addStringOption(option => option.setName(optionName).setDescription(`Encounter to prepare for.`).setAutocomplete(true).setRequired(true)));
}

function readinessText(variant) {
	let mitigation = `standard incoming damage`;
	if (variant.receiveDamage < 1) {
		mitigation = `${Math.round((1 - variant.receiveDamage) * 100)}% innate damage reduction`;
	} else if (variant.receiveDamage > 1) {
		mitigation = `${Math.round((variant.receiveDamage - 1) * 100)}% increased damage taken`;
	}
	return [
		`Boss level: **${variant.level}**`,
		`Recommended player level: **${Math.min(variant.recommendedPlayerLevel || variant.recommendedPalLevel || variant.level, GAME_MAX_LEVEL)}**`,
		`Recommended Pal level: **${Math.min(variant.recommendedPalLevel || variant.level, GAME_MAX_LEVEL)}**`,
		`Elements: **${variant.elements.join(` / `)}**`,
		`HP: **${derivedEncounterHp(variant).toLocaleString(`en-US`)} HP**`,
		`Durability: **${mitigation}**`,
		...(variant.battleTimeLimit ? [`Time limit: **${Math.round(variant.battleTimeLimit / 60)} minutes**`] : []),
	].join(`\n`);
}

function partyFields(variant, difficulty) {
	return variant.party.map(entry => ({
		name: entry.role ? `${entry.pal} — ${entry.role}` : entry.pal,
		value: entry.strategy ?
			`${entry.strategy}\nPassives: ${entry.passives.join(`, `)}` :
			(difficulty === `hard` ?
				`Moves: ${entry.moves.join(`, `)}\nPassives: ${entry.passives.join(`, `)}` :
				`Use its strongest available counter-type attacks; a specialized bred moveset is not required.\nHelpful passives, if available: ${entry.passives.join(`, `)}`),
		inline: false,
	}));
}

function usesPalboxArmy(encounterKind, difficulty) {
	return encounterKind === `raid` || (encounterKind === `tower-raid` && difficulty === `hard`);
}

function foodGuidance(variant, difficulty, palboxArmy) {
	if (variant.foodGuidance) {
		return variant.foodGuidance;
	}
	if (difficulty === `normal`) {
		return `Food: Use an Attack- or Defense-boosting meal appropriate to your progression if the attempt needs it.`;
	}
	return palboxArmy ?
		`Food: Feed Pals Mammorest Curry (+25% Attack), or Galeclaw Nikujaga (+25% Defense) if they die too quickly.` :
		`Food: Eat and feed the active Pal Mammorest Curry (+25% Attack), or use Galeclaw Nikujaga (+25% Defense) for survival.`;
}

function researchGuidance(variant) {
	const recommendedLevel = variant.recommendedPlayerLevel || variant.recommendedPalLevel || variant.level;
	if (recommendedLevel <= 55) {
		return `Base research: Treat Base Pal Attack and Defense research as an optional bonus; do not delay this fight for expensive ranks.`;
	}
	if (recommendedLevel < GAME_MAX_LEVEL) {
		return `Base research: Add affordable Base Pal Attack and Defense ranks, but prioritize a viable army and equipment first.`;
	}
	return `Base research: Prioritize Base Pal Attack and Defense bonuses for the deployed Palbox army.`;
}

function strategyField(variant, difficulty, encounterKind) {
	const palboxArmy = usesPalboxArmy(encounterKind, difficulty);
	const lines = [foodGuidance(variant, difficulty, palboxArmy),
		...(palboxArmy ? [researchGuidance(variant)] : []),
		...(variant.teamGuidance || []), ...(variant.raidComposition || []), ...(variant.notes || [])];
	return { name: `Strategy`, value: lines.map(line => `• ${line}`).join(`\n`), inline: false };
}

function recommendationFields(variant, difficulty, encounterKind) {
	const guidance = [strategyField(variant, difficulty, encounterKind)];
	return encounterKind === `raid` ? guidance : [...guidance, ...partyFields(variant, difficulty)];
}

function difficultyName(variant, difficulty) {
	return variant.difficultyLabel || (difficulty === `hard` ? `Hard` : `Normal`);
}

function encounterTypeName(command, difficulty, encounterKind) {
	if (encounterKind === `story`) {
		return `Story Boss`;
	}
	if (encounterKind === `tower-raid` && difficulty === `hard`) {
		return `Tower Raid`;
	}
	return command === `tower` ? `Tower Boss` : `Raid Boss`;
}

function buildPayload(command, difficulty, encounter) {
	const variant = encounter.variants[difficulty];
	const difficultyLabel = difficultyName(variant, difficulty);
	const typeLabel = encounterTypeName(command, difficulty, encounter.kind);
	const towerPresentation = command === `tower` || (encounter.kind === `tower-raid` && difficulty === `hard`);
	const strategy = new EmbedBuilder()
		.setColor(towerPresentation ? 0x38bdf8 : 0xa855f7)
		.setTitle(`${encounter.name} — ${difficultyLabel}`)
		.setDescription(`${typeLabel}${encounter.towerName ? ` · ${encounter.towerName}` : ``}`)
		.addFields({ name: `Readiness`, value: readinessText(variant) }, ...recommendationFields(variant, difficulty, encounter.kind));
	const rewards = completionRewards(encounter, variant);
	const embeds = [strategy];
	const files = [];
	if (towerPresentation && encounter.map) {
		const filePath = path.resolve(ROOT_DIR, encounter.map);
		const fileName = path.basename(filePath);
		files.push(new AttachmentBuilder(filePath, { name: fileName }));
		embeds.push(new EmbedBuilder().setColor(0x38bdf8).setImage(`attachment://${fileName}`));
	}
	if (rewards.length) {
		embeds.push(new EmbedBuilder().setColor(0xf59e0b).setTitle(`Completion Rewards`)
			.setDescription(rewards.map(reward => `• ${reward}`).join(`\n`).slice(0, 4096)));
	}
	return { embeds, files };
}

function encounterChoices(command, difficulty, focused = ``) {
	const needle = normalize(focused);
	return encountersFor(command, difficulty)
		.filter(encounter => !needle || normalize([encounter.name, encounter.towerName, ...encounter.aliases].join(` `)).includes(needle))
		.slice(0, 25)
		.map(encounter => ({
			name: (command === `raid` ? encounter.name : `${encounter.towerName || `Story Boss`} — ${encounter.name}`).slice(0, 100),
			value: encounter.id,
		}));
}

function createEncounterCommand(command) {
	const optionName = command === `tower` ? `tower` : `raid`;
	return {
		data: commandData(command),
		async autocomplete(interaction) {
			const difficulty = interaction.options.getSubcommand();
			await interaction.respond(encounterChoices(command, difficulty, interaction.options.getFocused()));
		},
		async execute(interaction) {
			const difficulty = interaction.options.getSubcommand();
			const encounter = findEncounter(command, difficulty, interaction.options.getString(optionName));
			if (!encounter) {
				await interaction.reply({ content: `Choose an encounter from autocomplete for that difficulty.`, flags: MessageFlags.Ephemeral });
				return;
			}
			await interaction.reply(buildPayload(command, difficulty, encounter));
		},
	};
}

module.exports = { buildPayload, createEncounterCommand, encounterChoices, normalize };
