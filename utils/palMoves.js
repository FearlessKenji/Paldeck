const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } = require(`discord.js`);
const { getPalColor } = require(`./palColors.js`);
const { replaceInteractionMessage } = require(`./interactionNavigation.js`);
const { buildBackToPalButton } = require(`./palDrops.js`);

function buildLearnedMovesButton(pal, ownerId) {
	if (!pal.levelUpMoves?.length) {
		return null;
	}
	return new ButtonBuilder()
		.setCustomId(`paldeck:moves:${encodeURIComponent(pal.number)}:${ownerId}`)
		.setLabel(`Learned Moves`)
		.setStyle(ButtonStyle.Secondary);
}

function buildLevelUpMovesResponse(pal, ownerId, colors) {
	const description = pal.levelUpMoves
		.map(move => `**Lv. ${move.level}** — ${move.name}`)
		.join(`\n`);
	return {
		embeds: [new EmbedBuilder()
			.setTitle(`${pal.name} — Learned Moves`)
			.setDescription(description)
			.setColor(getPalColor(pal, colors))],
		components: [new ActionRowBuilder().addComponents(buildBackToPalButton(pal.number, ownerId))],
		files: [],
	};
}

async function showLearnedMoves(interaction, encodedPalNumber, ownerId, context) {
	if (ownerId !== interaction.user.id) {
		await interaction.reply({ content: context.unauthorizedMessage, flags: MessageFlags.Ephemeral });
		return;
	}
	const pal = context.palByNumber(decodeURIComponent(encodedPalNumber));
	if (!pal?.levelUpMoves?.length) {
		await interaction.reply({ content: `No verified level-up moves are available for that Pal.`, flags: MessageFlags.Ephemeral });
		return;
	}
	await replaceInteractionMessage(interaction, buildLevelUpMovesResponse(pal, ownerId, context.colors));
}

module.exports = { buildLearnedMovesButton, buildLevelUpMovesResponse, showLearnedMoves };
