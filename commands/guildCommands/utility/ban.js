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

async function banUser(interaction, userId) {
	if (await BannedUsers.findOne({ where: { user_id: userId } })) {
		await interaction.editReply(`This user is already banned.`);
		return;
	}
	const user = await fetchUser(interaction.client, userId);
	const username = userName(user, userId);
	await BannedUsers.upsert({ user_id: userId, user_username: username });
	await interaction.editReply(`**Banned User**:\nName: ${username}\nID: ${userId}`);
	info(`Banned user ${username}`);
}

async function recordAndLeaveGuild({ client, guildRecord, owner, bannedServerIds, summaries }) {
	const guild = await fetchGuild(client, guildRecord.guild_id);
	const guildId = guild?.id || guildRecord.guild_id;
	const guildName = guild?.name || guildRecord.guild_name;
	await BannedServers.upsert({
		guild_id: guildId,
		guild_name: guildName,
		owner_id: owner.id,
		owner_username: owner.username,
	});
	summaries.push(`Name: ${guildName}\nID: ${guildId}`);
	bannedServerIds.add(guildId);
	if (guild) {
		await guild.leave();
	}
}

async function banServerOwner(interaction, guildId) {
	if (await BannedServers.findOne({ where: { guild_id: guildId } })) {
		await interaction.editReply(`This server is already banned.`);
		return;
	}
	const targetGuild = await fetchGuild(interaction.client, guildId);
	if (!targetGuild) {
		await interaction.editReply(`I could not find that server in my current guild list.`);
		return;
	}
	const owner = (await targetGuild.fetchOwner()).user;
	const joinedServers = await JoinedServers.findAll({ where: { owner_id: owner.id } });
	const bannedServerIds = new Set();
	const summaries = [];
	await BannedUsers.upsert({ user_id: owner.id, user_username: owner.username });
	await JoinedServers.upsert({
		guild_id: targetGuild.id,
		guild_name: targetGuild.name,
		owner_id: owner.id,
		owner_username: owner.username,
	});
	info(`Leaving servers owned by banned owner ${owner.username} (${owner.id}).`);
	for (const joinedServer of joinedServers) {
		await recordAndLeaveGuild({
			client: interaction.client,
			guildRecord: joinedServer,
			owner,
			bannedServerIds,
			summaries,
		});
	}
	if (!bannedServerIds.has(targetGuild.id)) {
		await recordAndLeaveGuild({
			client: interaction.client,
			guildRecord: {
				guild_id: targetGuild.id,
				guild_name: targetGuild.name,
			},
			owner,
			bannedServerIds,
			summaries,
		});
	}
	await interaction.editReply(
		`**Banned Server Owner**:\nName: ${owner.username}\nID: ${owner.id}` +
		`\n**Banned Servers**:\n${summaries.join(`\n\n`)}`,
	);
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
				await banUser(interaction, id);
				return;
			}
			if (subcommand === `server`) {
				await banServerOwner(interaction, id);
			}
		} catch (err) {
			error(`Error banning target.`, err);
			await interaction.editReply(`I could not complete that ban. Check the logs for details.`);
		}
	},
};
