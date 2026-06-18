const config = require(`../../../config/configCheck.js`);
const { SlashCommandBuilder, PermissionFlagsBits } = require(`discord.js`);
const { info } = require(`../../../utils/writeLog.js`);
const { BannedUsers, BannedServers } = require(`../../../database/dbObjects.js`);
const { isSnowflake } = require(`../../../utils/discordIds.js`);

module.exports = {
	data: new SlashCommandBuilder()
		.setName(`unban`)
		.setDescription(`Unban a user or server`)
		.addSubcommand(subcommand =>
			subcommand
				.setName(`user`)
				.setDescription(`Unban a user`)
				.addStringOption(option =>
					option.setName(`id`)
						.setDescription(`User ID`)
						.setRequired(true),
				),
		)
		.addSubcommand(subcommand =>
			subcommand
				.setName(`server`)
				.setDescription(`Unban a server`)
				.addStringOption(option =>
					option.setName(`id`)
						.setDescription(`Server ID`)
						.setRequired(true),
				),
		)
		.setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
	async execute(interaction) {
		if (interaction.user.id !== config.botOwner) {
			await interaction.reply({ content: `You are not authorized to use this command.`, ephemeral: true });
			return;
		}

		await interaction.deferReply({ ephemeral: true });

		const subcommand = interaction.options.getSubcommand();
		const id = interaction.options.getString(`id`);

		if (!isSnowflake(id)) {
			await interaction.editReply(`Please provide a valid Discord ID.`);
			return;
		}

		if (subcommand === `user`) {
			const unbannedUser = await BannedUsers.findOne({ where: { user_id: id } });

			if (!unbannedUser) {
				await interaction.editReply(`User not found in ban list.`);
				return;
			}

			await BannedUsers.destroy({ where: { user_id: id } });
			await interaction.editReply(`**Unbanned User**:\nName: ${unbannedUser.user_username}\nID: ${id}`);
			info(`Unbanned user ${unbannedUser.user_username}`);
			return;
		}

		if (subcommand === `server`) {
			const unbannedServer = await BannedServers.findOne({ where: { guild_id: id } });

			if (!unbannedServer) {
				await interaction.editReply(`Server not found in ban list.`);
				return;
			}

			await BannedServers.destroy({ where: { guild_id: id } });
			info(`Unbanned server ${unbannedServer.guild_name} (${unbannedServer.guild_id})`);
			await interaction.editReply(`**Unbanned Server**:\nName: ${unbannedServer.guild_name}\nID: ${unbannedServer.guild_id}`);
		}
	},
};
