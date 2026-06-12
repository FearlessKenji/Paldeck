const config = require('../../../modules/config.js');
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { writeLog } = require('../../../modules/writeLog.js');
const { JoinedServers, BannedUsers, BannedServers } = require('../../../database/dbObjects.js'); // Import your BannedUsers and BannedServers models

module.exports = {
	data: new SlashCommandBuilder()
		.setName('ban')
		.setDescription('Ban a user or server')
		.addSubcommand(subcommand =>
			subcommand
				.setName('user')
				.setDescription('Ban a user')
				.addStringOption(option =>
					option.setName('id')
						.setDescription('User ID')
						.setRequired(true),
				),
		)
		.addSubcommand(subcommand =>
			subcommand
				.setName('server')
				.setDescription('Ban a server')
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
		}
		else {
			const subcommand = interaction.options.getSubcommand();
			const id = interaction.options.getString('id');

			if (subcommand === 'user') {
			// Check if the user is already banned
				try {
					const existingUserBan = await BannedUsers.findOne({ where: { user_id: id } });
					if (existingUserBan) {
						return interaction.reply('This user is already banned.');
					}

					// Add the banned user to BannedUsers
					const user = await interaction.client.users.cache.get(id);
					await BannedUsers.create({ user_id: id, user_username: user.username }); // Replace 'username' with the actual username if available
					interaction.reply(`**Banned User**:\nName: ${user.username}\nID: ${user.id}`);
				}
				catch (error) {
					console.log('Error banning user.');
				}
			}
			else if (subcommand === 'server') {
				// Check if the server is already banned
				const existingServerBan = await BannedServers.findOne({ where: { guild_id: id } });
				if (existingServerBan) {
					return interaction.reply('This server is already banned.');
				}

				// Get server, owner information
				const guild = await interaction.client.guilds.cache.get(id);
				const owner = await interaction.client.users.cache.get(guild.ownerId);
				const joinedServers = await JoinedServers.findAll({ where: { owner_id: owner.id } });
				const bannedServers = [];
				// Add the banned owner to BannedUsers
				await BannedUsers.create({ user_id: owner.id, user_username: owner.username });
				console.log(writeLog('Leaving associated servers:'));
				for (const joinedServer of joinedServers) {
					const server = await interaction.client.guilds.cache.get(joinedServer.guild_id);
					await BannedServers.upsert({ guild_id: server.id, guild_name: server.name, owner_id: owner.id, owner_username: owner.username });
					bannedServers.push(`Name: ${server.name}\nID: ${server.id}\n`);
					server.leave();
				}
				// Reply with a message
				interaction.reply(`**Banned Server Owner**:\nName: ${owner.username}\nID: ${owner.id}\n**Banned Servers**:\n${bannedServers}`);
			}
		}
	},
};
