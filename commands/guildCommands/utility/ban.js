const config = require(`../../../config/configCheck.js`);
const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require(`discord.js`);
const { info, error } = require(`../../../utils/writeLog.js`);
const { JoinedServers, BannedUsers, BannedServers } = require(`../../../database/dbObjects.js`);
const { isSnowflake } = require(`../../../utils/discordIds.js`);

async function fetchUser(client, id) {
	return client.users.fetch(id).catch(() => null);
}

async function fetchGuild(client, id) {
	return client.guilds.fetch(id).catch(() => null);
}

function userName(user, id) {
	return user?.username || `Unknown User (${id})`;
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName(`ban`)
		.setDescription(`Ban a user or server`)
		.addSubcommand(subcommand =>
			subcommand
				.setName(`user`)
				.setDescription(`Ban a user`)
				.addStringOption(option =>
					option.setName(`id`)
						.setDescription(`User ID`)
						.setRequired(true),
				),
		)
		.addSubcommand(subcommand =>
			subcommand
				.setName(`server`)
				.setDescription(`Ban a server`)
				.addStringOption(option =>
					option.setName(`id`)
						.setDescription(`Server ID`)
						.setRequired(true),
				),
		)
		.setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
	async execute(interaction) {
		if (interaction.user.id !== config.botOwner) {
			await interaction.reply({ content: `You are not authorized to use this command.`, flags: MessageFlags.Ephemeral });
			return;
		}

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		const subcommand = interaction.options.getSubcommand();
		const id = interaction.options.getString(`id`);

		if (!isSnowflake(id)) {
			await interaction.editReply(`Please provide a valid Discord ID.`);
			return;
		}

		try {
			if (subcommand === `user`) {
				const existingUserBan = await BannedUsers.findOne({ where: { user_id: id } });

				if (existingUserBan) {
					await interaction.editReply(`This user is already banned.`);
					return;
				}

				const user = await fetchUser(interaction.client, id);
				const username = userName(user, id);

				await BannedUsers.upsert({ user_id: id, user_username: username });
				await interaction.editReply(`**Banned User**:\nName: ${username}\nID: ${id}`);
				info(`Banned user ${username}`);
				return;
			}

			if (subcommand === `server`) {
				const existingServerBan = await BannedServers.findOne({ where: { guild_id: id } });

				if (existingServerBan) {
					await interaction.editReply(`This server is already banned.`);
					return;
				}

				const guild = await fetchGuild(interaction.client, id);

				if (!guild) {
					await interaction.editReply(`I could not find that server in my current guild list.`);
					return;
				}

				const ownerMember = await guild.fetchOwner();
				const owner = ownerMember.user;
				const joinedServers = await JoinedServers.findAll({ where: { owner_id: owner.id } });
				const bannedServers = [];
				const bannedServerIds = new Set();

				await BannedUsers.upsert({ user_id: owner.id, user_username: owner.username });
				await JoinedServers.upsert({
					guild_id: guild.id,
					guild_name: guild.name,
					owner_id: owner.id,
					owner_username: owner.username,
				});

				info(`Leaving servers owned by banned owner ${owner.username} (${owner.id}).`);

				for (const joinedServer of joinedServers) {
					const server = await fetchGuild(interaction.client, joinedServer.guild_id);
					const guildId = server?.id || joinedServer.guild_id;
					const guildName = server?.name || joinedServer.guild_name;

					await BannedServers.upsert({
						guild_id: guildId,
						guild_name: guildName,
						owner_id: owner.id,
						owner_username: owner.username,
					});

					bannedServers.push(`Name: ${guildName}\nID: ${guildId}`);
					bannedServerIds.add(guildId);

					if (server) {
						await server.leave();
					}
				}

				await BannedServers.upsert({
					guild_id: guild.id,
					guild_name: guild.name,
					owner_id: owner.id,
					owner_username: owner.username,
				});

				if (!bannedServerIds.has(guild.id)) {
					bannedServers.push(`Name: ${guild.name}\nID: ${guild.id}`);
					await guild.leave();
				}

				await interaction.editReply(`**Banned Server Owner**:\nName: ${owner.username}\nID: ${owner.id}\n**Banned Servers**:\n${bannedServers.join(`\n\n`)}`);
			}
		} catch (err) {
			error(`Error banning target.`, err);
			await interaction.editReply(`I could not complete that ban. Check the logs for details.`);
		}
	},
};
