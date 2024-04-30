const config = require('../../../config.json');
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { writeLog } = require('../../../modules/writeLog.js');
const { BannedUsers, BannedServers } = require('../../../database/dbObjects.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('unban')
		.setDescription('Unban a user or server')
		.addSubcommand(subcommand =>
			subcommand
				.setName('user')
				.setDescription('Unban a user')
				.addStringOption(option =>
					option.setName('id')
						.setDescription('User ID')
						.setRequired(true),
				),
		)
		.addSubcommand(subcommand =>
			subcommand
				.setName('server')
				.setDescription('Unban a server')
				.addStringOption(option =>
					option.setName('id')
						.setDescription('Server ID')
						.setRequired(true),
				),
		)
		.setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
	async execute(interaction) {
		if (interaction.user.id !== config.botOwner) {
			await interaction.reply({ content: 'You are not authorized to use this command.', ephemeral: true });
			return;
		}

		const subcommand = interaction.options.getSubcommand();
		const id = interaction.options.getString('id');

		if (subcommand === 'user') {
			const unbannedUser = await BannedUsers.findOne({ where: { user_id: id } });
			await BannedUsers.destroy({ where: { user_id: id } });
			await interaction.reply(`**Unbanned User**:\nName: ${unbannedUser.user_username}\nID: ${id}`);
			writeLog(`Unbanned user ${unbannedUser.user_username}`);
		}
		else if (subcommand === 'server') {
			// Unban server logic
			const unbannedServer = await BannedServers.findOne({ where: { guild_id: id } });
			if (!unbannedServer) {
				return interaction.reply('Server not found in ban list.');
			}
			await BannedServers.destroy({ where: { guild_id: id } });
			await interaction.reply(writeLog(`**Unbanned Server**:\nName: ${unbannedServer.guild_name}\nID: ${unbannedServer.guild_id}`));
		}
	},
};
