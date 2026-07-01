const { EmbedBuilder, Events } = require(`discord.js`);
const config = require(`../config/configCheck.js`);
const { Channels, Suggestions } = require(`../database/dbObjects.js`);
const { warn } = require(`../utils/writeLog.js`);

const MAX_EMBED_DESCRIPTION = 3500;
const MAX_FIELD_VALUE = 1024;

function trimText(value, maxLength) {
	const text = String(value || ``).trim();

	if (text.length <= maxLength) {
		return text;
	}

	return `${text.slice(0, maxLength - 3)}...`;
}

function stripOwnMention(message) {
	const botId = message.client.user?.id;
	let content = String(message.content || ``).trim();

	if (!botId) {
		return content;
	}

	content = content.replace(new RegExp(`^<@!?${botId}>\\s*`), ``);

	return content.trim();
}

function getResponseText(message) {
	const content = stripOwnMention(message);
	const attachments = [...message.attachments.values()].map(attachment => attachment.url);

	return [content, ...attachments].filter(Boolean).join(`\n`);
}

function buildResponseEmbed(suggestion, message, responseText) {
	return new EmbedBuilder()
		.setColor([255, 255, 255])
		.setTitle(`Response to your Paldeck suggestion`)
		.setDescription(trimText(responseText, MAX_EMBED_DESCRIPTION))
		.addFields({
			name: `Your suggestion`,
			value: trimText(suggestion.suggestion, MAX_FIELD_VALUE),
		})
		.setFooter({ text: `Suggestion ${suggestion.id} | Reply from ${message.author.username}` })
		.setTimestamp();
}

async function replyToModerator(message, content) {
	await message.reply({
		allowedMentions: { repliedUser: false },
		content,
	}).catch(err => {
		warn(`Failed to reply to suggestion moderator.`, {
			meta: {
				error: err.message,
				messageId: message.id,
			},
		});
	});
}

async function findOriginalChannel(client, suggestion) {
	if (!suggestion.channel_id) {
		return null;
	}

	const channel = await client.channels.fetch(suggestion.channel_id).catch(() => null);

	if (!channel?.isTextBased()) {
		return null;
	}

	return channel;
}

async function forwardToOriginalChannel(message, suggestion, responseText) {
	const channel = await findOriginalChannel(message.client, suggestion);

	if (!channel) {
		return false;
	}

	try {
		await channel.send({
			allowedMentions: { users: [suggestion.author_id] },
			content: `<@${suggestion.author_id}>`,
			embeds: [buildResponseEmbed(suggestion, message, responseText)],
		});
	} catch (err) {
		warn(`Failed to forward suggestion response to original channel.`, {
			meta: {
				channelId: suggestion.channel_id,
				error: err.message,
				suggestionId: suggestion.id,
			},
		});
		return false;
	}

	return true;
}

async function forwardToUserDm(message, suggestion, responseText) {
	const user = await message.client.users.fetch(suggestion.author_id).catch(() => null);

	if (!user) {
		return false;
	}

	try {
		await user.send({
			embeds: [buildResponseEmbed(suggestion, message, responseText)],
		});
	} catch (err) {
		warn(`Failed to forward suggestion response by DM.`, {
			meta: {
				error: err.message,
				suggestionId: suggestion.id,
				userId: suggestion.author_id,
			},
		});
		return false;
	}

	return true;
}

module.exports = {
	name: Events.MessageCreate,
	async execute(message) {
		if (message.author.bot || !message.guildId || !message.reference?.messageId) {
			return;
		}

		const suggestionChannel = await Channels.findOne({ where: { name: `Suggestions` } });

		if (!suggestionChannel || message.channelId !== suggestionChannel.id) {
			return;
		}

		const suggestion = await Suggestions.findOne({ where: { suggestion_id: message.reference.messageId } });

		if (!suggestion) {
			return;
		}

		if (message.author.id !== String(config.botOwner)) {
			await replyToModerator(message, `Only the configured bot owner can forward suggestion replies.`);
			return;
		}

		if (!suggestion.author_id) {
			await replyToModerator(message, `I do not have reply context for that older suggestion. New suggestions will include it.`);
			return;
		}

		const responseText = getResponseText(message);

		if (!responseText) {
			await replyToModerator(message, `I could not read a reply body. Keep the bot mention enabled on the reply, or enable Message Content Intent for the bot.`);
			return;
		}

		if (await forwardToOriginalChannel(message, suggestion, responseText)) {
			await replyToModerator(message, `Forwarded to the original channel.`);
			return;
		}

		if (await forwardToUserDm(message, suggestion, responseText)) {
			await replyToModerator(message, `I could not reach the original channel, so I sent the response by DM instead.`);
			return;
		}

		await replyToModerator(message, `I could not reach the original channel or DM the user.`);
	},
};
