const fs = require(`node:fs`);
const path = require(`node:path`);
const { Op } = require(`sequelize`);
const { PermissionFlagsBits } = require(`discord.js`);
const { JoinedServers } = require(`../database/dbObjects.js`);
const { error, warn } = require(`./writeLog.js`);

const PATCH_NOTES_PATH = path.resolve(__dirname, `..`, `docs`, `patch-notes.md`);
const ANNOUNCEMENT_MESSAGE_LIMIT = 1900;
const RELEASE_HEADING_PATTERN = /^##\s+(v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)(?:\s|$)/u;

function normalizeNewlines(text) {
	return String(text || ``).replace(/\r\n?/gu, `\n`).trim();
}

function normalizeAnnouncementId(value) {
	if (value === null || value === undefined || value === ``) {
		return null;
	}

	if (typeof value === `object`) {
		if (`id` in value) {
			return normalizeAnnouncementId(value.id);
		}

		if (`value` in value) {
			return normalizeAnnouncementId(value.value);
		}
	}

	const normalized = String(value).trim();
	return normalized || null;
}

function requireAnnouncementId(value, label) {
	const normalized = normalizeAnnouncementId(value);

	if (!normalized) {
		throw new Error(`${label} is required.`);
	}

	return normalized;
}

function readPatchNotesDocument(filePath = PATCH_NOTES_PATH) {
	if (!fs.existsSync(filePath)) {
		return ``;
	}

	return fs.readFileSync(filePath, `utf8`);
}

function parseLatestPatchNotes(documentText) {
	const text = normalizeNewlines(documentText);
	const lines = text.split(`\n`);
	const firstReleaseIndex = lines.findIndex(line => RELEASE_HEADING_PATTERN.test(line));

	if (firstReleaseIndex === -1) {
		return null;
	}

	const nextReleaseIndex = lines.findIndex((line, index) => index > firstReleaseIndex && /^##\s+/u.test(line));
	const releaseMatch = lines[firstReleaseIndex].match(RELEASE_HEADING_PATTERN);
	const heading = lines[firstReleaseIndex].replace(/^##\s+/u, ``).trim();
	const bodyLines = lines.slice(firstReleaseIndex + 1, nextReleaseIndex === -1 ? undefined : nextReleaseIndex);
	const body = normalizeNewlines(bodyLines.join(`\n`));
	const version = releaseMatch?.[1] || ``;

	return {
		body,
		heading,
		id: version.startsWith(`v`) ? version : `v${version}`,
		version,
	};
}

function getLatestPatchNotes() {
	return parseLatestPatchNotes(readPatchNotesDocument());
}

function splitLongLine(line, limit) {
	const chunks = [];
	let remaining = String(line || ``);

	while (remaining.length > limit) {
		let splitAt = remaining.lastIndexOf(`. `, limit);

		if (splitAt >= Math.floor(limit * 0.5)) {
			splitAt += 1;
		} else {
			splitAt = remaining.lastIndexOf(` `, limit);
		}

		if (splitAt < 1) {
			splitAt = limit;
		}

		chunks.push(remaining.slice(0, splitAt).trim());
		remaining = remaining.slice(splitAt).trim();
	}

	if (remaining) {
		chunks.push(remaining);
	}

	return chunks;
}

function splitAnnouncementText(text, limit = ANNOUNCEMENT_MESSAGE_LIMIT) {
	const chunks = [];
	let current = ``;

	for (const line of normalizeNewlines(text).split(`\n`)) {
		const candidate = current ? `${current}\n${line}` : line;

		if (candidate.length <= limit) {
			current = candidate;
			continue;
		}

		if (current) {
			chunks.push(current);
		}

		if (line.length <= limit) {
			current = line;
			continue;
		}

		const longLineChunks = splitLongLine(line, limit);
		chunks.push(...longLineChunks.slice(0, -1));
		current = longLineChunks.at(-1) || ``;
	}

	if (current) {
		chunks.push(current);
	}

	return chunks;
}

function formatPatchNotesMessages(note) {
	if (!note?.body) {
		return [];
	}

	const text = `# Paldeck ${note.heading}\n\n${note.body}`;
	const chunks = splitAnnouncementText(text);

	if (chunks.length <= 1) {
		return chunks;
	}

	return chunks.map((chunk, index) => `${chunk}\n\n_Part ${index + 1}/${chunks.length}_`);
}

async function getAnnouncementSettings(guildId) {
	const normalizedGuildId = requireAnnouncementId(guildId, `Guild ID`);
	const server = await JoinedServers.findOne({
		raw: true,
		where: { guild_id: normalizedGuildId },
	});

	return {
		guildId: normalizedGuildId,
		paldeckAnnouncementChannelId: server?.paldeck_announcement_channel_id || null,
		paldeckAnnouncementLastId: server?.paldeck_announcement_last_id || null,
	};
}

async function getGuildMetadata(guild) {
	const owner = await guild.fetchOwner().catch(() => null);

	return {
		guild_id: guild.id,
		guild_name: guild.name || `Unknown Server`,
		owner_id: owner?.id || guild.ownerId || `unknown`,
		owner_username: owner?.user?.username || `Unknown Owner`,
	};
}

async function updateAnnouncementSettings(guild, values) {
	const guildId = requireAnnouncementId(guild, `Guild ID`);
	const server = await JoinedServers.findByPk(guildId);

	if (server) {
		await server.update(values);
		return getAnnouncementSettings(guildId);
	}

	if (!guild || typeof guild !== `object`) {
		throw new Error(`Guild details are required to create announcement settings.`);
	}

	await JoinedServers.create({
		...await getGuildMetadata(guild),
		...values,
	});
	return getAnnouncementSettings(guildId);
}

async function saveAnnouncementChannel(guild, channelId) {
	return updateAnnouncementSettings(guild, {
		paldeck_announcement_channel_id: normalizeAnnouncementId(channelId),
	});
}

async function clearAnnouncementChannel(guild) {
	return updateAnnouncementSettings(guild, {
		paldeck_announcement_channel_id: null,
	});
}

async function fetchGuild(client, guildId) {
	return client.guilds.cache.get(guildId) || client.guilds.fetch(guildId).catch(() => null);
}

async function fetchAnnouncementChannel(guild, channelId) {
	if (!channelId) {
		return { ok: false, message: `No Paldeck Updates channel is configured.` };
	}

	const channel = await guild.channels.fetch(channelId).catch(() => null);

	if (!channel?.send || !channel.isTextBased?.()) {
		return { ok: false, message: `The configured Paldeck Updates channel is unavailable.` };
	}

	const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
	const permissions = me ? channel.permissionsFor(me) : null;

	if (!permissions?.has(PermissionFlagsBits.ViewChannel) || !permissions?.has(PermissionFlagsBits.SendMessages)) {
		return { ok: false, message: `Paldeck cannot view or send messages in the configured updates channel.` };
	}

	return { channel, ok: true };
}

async function markPatchNotesSent(guildId, noteId) {
	const server = await JoinedServers.findByPk(guildId);

	if (!server) {
		return;
	}

	await server.update({
		paldeck_announcement_last_id: noteId,
	});
}

async function sendLatestPatchNotesToGuild(client, guildId, { force = false } = {}) {
	const normalizedGuildId = requireAnnouncementId(guildId, `Guild ID`);
	const settings = await getAnnouncementSettings(normalizedGuildId);
	const note = getLatestPatchNotes();

	if (!note) {
		return { guildId: normalizedGuildId, ok: false, sent: 0, skipped: true, message: `No patch notes were found.` };
	}

	if (!force && settings.paldeckAnnouncementLastId === note.id) {
		return { guildId: normalizedGuildId, ok: true, patchNoteId: note.id, sent: 0, skipped: true, message: `Latest patch notes were already sent.` };
	}

	const guild = await fetchGuild(client, normalizedGuildId);

	if (!guild) {
		return { guildId: normalizedGuildId, ok: false, patchNoteId: note.id, sent: 0, skipped: true, message: `Guild is unavailable.` };
	}

	const channelResult = await fetchAnnouncementChannel(guild, settings.paldeckAnnouncementChannelId);

	if (!channelResult.ok) {
		return { guildId: normalizedGuildId, ok: false, patchNoteId: note.id, sent: 0, skipped: true, message: channelResult.message };
	}

	const messages = formatPatchNotesMessages(note);

	for (const content of messages) {
		await channelResult.channel.send({ content });
	}

	await markPatchNotesSent(normalizedGuildId, note.id);

	return {
		guildId: normalizedGuildId,
		ok: true,
		patchNoteId: note.id,
		sent: messages.length,
		skipped: false,
		message: `Sent ${messages.length} patch-note message(s).`,
	};
}

async function broadcastLatestPatchNotes(client, { force = false } = {}) {
	const servers = await JoinedServers.findAll({
		attributes: [`guild_id`],
		raw: true,
		where: {
			paldeck_announcement_channel_id: { [Op.ne]: null },
		},
	});
	const results = [];

	for (const server of servers) {
		try {
			results.push(await sendLatestPatchNotesToGuild(client, server.guild_id, { force }));
		} catch (err) {
			error(`Failed to send Paldeck patch notes for guild ${server.guild_id}:`, err);
			results.push({
				guildId: server.guild_id,
				ok: false,
				sent: 0,
				skipped: true,
				message: err.message,
			});
		}
	}

	if (!servers.length) {
		warn(`Patch-note broadcast skipped because no servers have Paldeck Updates channels configured.`);
	}

	return results;
}

module.exports = {
	broadcastLatestPatchNotes,
	clearAnnouncementChannel,
	formatPatchNotesMessages,
	getAnnouncementSettings,
	getLatestPatchNotes,
	normalizeAnnouncementId,
	parseLatestPatchNotes,
	saveAnnouncementChannel,
	sendLatestPatchNotesToGuild,
	splitAnnouncementText,
};
