const { AttachmentBuilder, EmbedBuilder } = require(`discord.js`);
const { Buffer } = require(`node:buffer`);
const config = require(`../config/configCheck.js`);
const { BotSettings, JoinedServers } = require(`../database/dbObjects.js`);
const { isConfiguredOwner } = require(`./configValues.js`);
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

function forwardedDmSenderId(report, botId) {
	if (!botId || report?.author?.id !== botId) {
		return null;
	}

	const metadata = report.embeds?.find(embed => embed.title === `Direct Message to Paldeck`);
	const userId = metadata?.fields?.find(field => field.name === `User ID`)?.value;

	// Only bot-authored inbox reports with a valid Discord ID may choose a DM recipient.
	return /^\d{16,20}$/u.test(userId || ``) ? userId : null;
}

function replyContent(message) {
	const botId = message.client.user?.id;
	let content = String(message.content || ``).trim();

	if (botId) {
		content = content.replace(new RegExp(`^<@!?${botId}>\\s*`), ``).trim();
	}

	return content;
}

function buildDmReplyPayload(message) {
	const content = replyContent(message);
	const files = forwardedFiles(message);

	if (!content && !files.length) {
		return null;
	}

	if (content.length > DISCORD_MESSAGE_LIMIT) {
		files.unshift(new AttachmentBuilder(Buffer.from(content, `utf8`), { name: `paldeck-reply.txt` }));
	}

	return {
		allowedMentions: { parse: [] },
		content: content && content.length <= DISCORD_MESSAGE_LIMIT ? content : undefined,
		files,
	};
}

async function fetchInboxReport(message) {
	try {
		return await message.fetchReference();
	} catch (err) {
		warn(`Failed to read a referenced direct-message inbox report.`, {
			meta: { error: err.message, messageId: message.id, referencedMessageId: message.reference.messageId },
		});
		return null;
	}
}

async function sendDmReply(message, userId, payload) {
	try {
		const user = await message.client.users.fetch(userId);
		await user.send(payload);
		return true;
	} catch (err) {
		warn(`Failed to send a direct-message inbox reply.`, {
			meta: { error: err.message, messageId: message.id, userId },
		});
		return false;
	}
}

async function acknowledgeDmReply(message, content) {
	await message.reply({
		allowedMentions: { repliedUser: false },
		content,
	}).catch(err => {
		warn(`Failed to acknowledge a direct-message inbox reply.`, {
			meta: { error: err.message, messageId: message.id },
		});
	});
}

async function handleDmForwardReply(message) {
	if (!message.guildId || !message.reference?.messageId || message.channelId !== await getDmForwardChannelId()) {
		return false;
	}
	if (message.reference.channelId && message.reference.channelId !== message.channelId) {
		return false;
	}

	const report = await fetchInboxReport(message);

	if (!report) {
		if (isConfiguredOwner(config, message.author.id)) {
			await acknowledgeDmReply(message, `I could not read the message you replied to. Check that Paldeck can read message history in this channel.`);
		}
		return true;
	}

	const userId = forwardedDmSenderId(report, message.client.user?.id);

	if (!userId) {
		return false;
	}

	if (!isConfiguredOwner(config, message.author.id)) {
		await acknowledgeDmReply(message, `Only the configured bot owner can reply to forwarded direct messages.`);
		return true;
	}

	const payload = buildDmReplyPayload(message);

	if (!payload) {
		await acknowledgeDmReply(message, `I could not read a reply body. Keep the bot mention enabled on the reply, or enable Message Content Intent for the bot.`);
		return true;
	}

	if (!await sendDmReply(message, userId, payload)) {
		await acknowledgeDmReply(message, `I could not DM the original sender. They may have blocked Paldeck or closed their DMs.`);
		return true;
	}

	await acknowledgeDmReply(message, `Sent your reply to the original sender by DM.`);
	return true;
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
	handleDmForwardReply,
	saveDmForwardChannelId,
};
