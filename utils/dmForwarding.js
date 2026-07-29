const { AttachmentBuilder, EmbedBuilder } = require(`discord.js`);
const { Buffer } = require(`node:buffer`);
const { BotSettings, JoinedServers } = require(`../database/dbObjects.js`);
const { warn } = require(`./writeLog.js`);

const DM_FORWARD_CHANNEL_KEY = `dm_forward_channel_id`;
const DISCORD_MESSAGE_LIMIT = 2000;

async function getDmForwardChannelId() {
	const setting = await BotSettings.findByPk(DM_FORWARD_CHANNEL_KEY);
	return setting?.value || null;
}

async function saveDmForwardChannelId(channelId) {
	await BotSettings.upsert({ key: DM_FORWARD_CHANNEL_KEY, value: String(channelId) });
}

async function clearDmForwardChannelId() {
	await BotSettings.destroy({ where: { key: DM_FORWARD_CHANNEL_KEY } });
}

function senderName(author) {
	return author.globalName || author.displayName || author.username || `Unknown User`;
}

function buildDmMetadataEmbed(message, ownedServers) {
	const servers = ownedServers.length ?
		ownedServers.map(server => `${server.guild_name} (${server.guild_id})`).join(`\n`) :
		`Not stored as a server owner.`;

	return new EmbedBuilder()
		.setColor(0xFFD700)
		.setTitle(`Direct Message to Paldeck`)
		.addFields(
			{ name: `User`, value: senderName(message.author), inline: true },
			{ name: `User ID`, value: message.author.id, inline: true },
			{ name: `Server(s) Owned`, value: servers.slice(0, 1024) },
		)
		.setTimestamp(message.createdAt || new Date());
}

function forwardedFiles(message) {
	return [
		...message.attachments.values(),
		...message.stickers.values(),
	].map(attachment => ({
		attachment: attachment.url,
		name: attachment.name || `attachment`,
	}));
}

async function forwardDirectMessage(message) {
	const channelId = await getDmForwardChannelId();

	if (!channelId) {
		return false;
	}

	const channel = await message.client.channels.fetch(channelId).catch(() => null);

	if (!channel?.isTextBased?.() || !channel.send) {
		warn(`Configured Paldeck DM forwarding channel ${channelId} is unavailable.`);
		return false;
	}

	const ownedServers = await JoinedServers.findAll({
		attributes: [`guild_id`, `guild_name`],
		raw: true,
		where: { owner_id: message.author.id },
	});
	const content = String(message.content || ``);
	const files = forwardedFiles(message);

	if (content.length > DISCORD_MESSAGE_LIMIT) {
		// Preserve long Nitro DMs exactly as a text attachment instead of truncating them.
		files.unshift(new AttachmentBuilder(Buffer.from(content, `utf8`), { name: `direct-message.txt` }));
	}

	try {
		await channel.send({
			allowedMentions: { parse: [] },
			content: content && content.length <= DISCORD_MESSAGE_LIMIT ? content : undefined,
			embeds: [buildDmMetadataEmbed(message, ownedServers)],
			files,
		});
		return true;
	} catch (err) {
		warn(`Failed to forward a direct message to channel ${channelId}.`, {
			meta: { error: err.message, messageId: message.id, userId: message.author.id },
		});
		return false;
	}
}

module.exports = {
	buildDmMetadataEmbed,
	clearDmForwardChannelId,
	forwardDirectMessage,
	getDmForwardChannelId,
	saveDmForwardChannelId,
};
