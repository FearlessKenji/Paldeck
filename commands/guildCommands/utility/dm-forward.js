const {
	ChannelType,
	MessageFlags,
	PermissionFlagsBits,
	SlashCommandBuilder,
} = require(`discord.js`);
const config = require(`../../../config/configCheck.js`);
const {
	clearDmForwardChannelId,
	getDmForwardChannelId,
	saveDmForwardChannelId,
} = require(`../../../utils/dmForwarding.js`);
const { isConfiguredOwner } = require(`../../../utils/configValues.js`);

function channelPermissionWarning(guild, channel) {
	const me = guild.members.me;
	const permissions = me ? channel.permissionsFor(me) : null;
	const missing = [];

	if (!permissions?.has(PermissionFlagsBits.ViewChannel)) {
		missing.push(`View Channel`);
	}

	if (!permissions?.has(PermissionFlagsBits.SendMessages)) {
		missing.push(`Send Messages`);
	}

	return missing.length ? `\n\n⚠️ Paldeck is missing: ${missing.join(` and `)}.` : ``;
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName(`dm-forward`)
		.setDescription(`Configure where direct messages to Paldeck are forwarded.`)
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
		.addSubcommand(subcommand =>
			subcommand
				.setName(`channel`)
				.setDescription(`Set the Paldeck direct-message inbox.`)
				.addChannelOption(option =>
					option
						.setName(`channel`)
						.setDescription(`Channel that should receive direct messages to Paldeck.`)
						.addChannelTypes(ChannelType.GuildText)
						.setRequired(true),
				),
		)
		.addSubcommand(subcommand =>
			subcommand
				.setName(`clear`)
				.setDescription(`Stop forwarding direct messages to a server channel.`),
		)
		.addSubcommand(subcommand =>
			subcommand
				.setName(`status`)
				.setDescription(`Show the configured direct-message inbox.`),
		),

	async execute(interaction) {
		if (!isConfiguredOwner(config, interaction.user.id)) {
			await interaction.reply({ content: `You are not authorized to use this command.`, flags: MessageFlags.Ephemeral });
			return;
		}

		const subcommand = interaction.options.getSubcommand();

		if (subcommand === `channel`) {
			const channel = interaction.options.getChannel(`channel`, true);

			await saveDmForwardChannelId(channel.id);
			await interaction.reply({
				content: `Direct messages to Paldeck will be forwarded to <#${channel.id}>.${channelPermissionWarning(interaction.guild, channel)}`,
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		if (subcommand === `clear`) {
			await clearDmForwardChannelId();
			await interaction.reply({ content: `Direct-message forwarding is disabled.`, flags: MessageFlags.Ephemeral });
			return;
		}

		if (subcommand === `status`) {
			const channelId = await getDmForwardChannelId();
			const content = channelId ? `Direct messages to Paldeck are forwarded to <#${channelId}>.` : `Direct-message forwarding is disabled.`;

			await interaction.reply({ content, flags: MessageFlags.Ephemeral });
			return;
		}

		await interaction.reply({ content: `Unknown direct-message forwarding action.`, flags: MessageFlags.Ephemeral });
	},
};
