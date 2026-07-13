const {
	ChannelType,
	MessageFlags,
	PermissionFlagsBits,
	SlashCommandBuilder,
} = require(`discord.js`);
const {
	clearAnnouncementChannel,
	saveAnnouncementChannel,
	sendLatestPatchNotesToGuild,
} = require(`../../../utils/announcements.js`);

function requireGuild(interaction) {
	if (!interaction.guild) {
		throw new Error(`This command can only be used in a server.`);
	}

	return interaction.guild;
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName(`updates`)
		.setDescription(`Configure Paldeck update announcements.`)
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
		.addSubcommand(subcommand =>
			subcommand
				.setName(`channel`)
				.setDescription(`Subscribe this server to Paldeck update announcements.`)
				.addChannelOption(option =>
					option
						.setName(`channel`)
						.setDescription(`Where Paldeck Updates should be posted.`)
						.addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
						.setRequired(true),
				),
		)
		.addSubcommand(subcommand =>
			subcommand
				.setName(`clear`)
				.setDescription(`Unsubscribe this server from Paldeck update announcements.`),
		)
		.addSubcommand(subcommand =>
			subcommand
				.setName(`send-latest`)
				.setDescription(`Send the latest Paldeck patch notes to this server's updates channel.`),
		),

	async execute(interaction) {
		try {
			const guild = requireGuild(interaction);
			const subcommand = interaction.options.getSubcommand();

			await interaction.deferReply({ flags: MessageFlags.Ephemeral });

			if (subcommand === `channel`) {
				const channel = interaction.options.getChannel(`channel`, true);
				const settings = await saveAnnouncementChannel(guild, channel.id);

				await interaction.editReply(`Paldeck Updates will be posted in <#${settings.paldeckAnnouncementChannelId}>.`);
				return;
			}

			if (subcommand === `clear`) {
				await clearAnnouncementChannel(guild);
				await interaction.editReply(`Paldeck Updates channel cleared.`);
				return;
			}

			if (subcommand === `send-latest`) {
				const result = await sendLatestPatchNotesToGuild(interaction.client, guild.id);
				await interaction.editReply(result.message);
				return;
			}

			await interaction.editReply(`Unknown updates action.`);
		} catch (err) {
			if (interaction.deferred || interaction.replied) {
				await interaction.editReply(`Failed to update Paldeck Updates settings: ${err.message}`);
			} else {
				await interaction.reply({ content: `Failed to update Paldeck Updates settings: ${err.message}`, flags: MessageFlags.Ephemeral });
			}
		}
	},
};
