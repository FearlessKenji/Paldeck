const fs = require(`node:fs`);
const path = require(`node:path`);
const { Op } = require(`sequelize`);
const { MessageFlags, PermissionFlagsBits } = require(`discord.js`);
const { JoinedServers } = require(`../database/dbObjects.js`);
const { error, warn } = require(`./writeLog.js`);

const PATCH_NOTES_PATH = path.resolve(__dirname, `..`, `docs`, `patch-notes.md`);
const ANNOUNCEMENT_MESSAGE_LIMIT = 1900;
const MANAGER_WARNING_LIMIT = 3;
const MANAGER_WARNING_INTERVAL_MS = 15 * 60 * 1000;
const MANAGER_WARNING_WINDOW_MS = 24 * 60 * 60 * 1000;
const RELEASE_HEADING_PATTERN = /^##\s+(v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)(?:\s|$)/u;

const CLEARED_WARNING_STATE = {
	paldeck_announcement_warning_count: 0,
	paldeck_announcement_warning_key: null,
	paldeck_announcement_warning_last_sent_at: null,
	paldeck_announcement_warning_window_started_at: null,
};

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

		if (splitAt < Math.floor(limit * 0.5)) {
			splitAt = remaining.lastIndexOf(` `, limit);
		}

		if (splitAt < 1) {
			splitAt = limit - 1;
		}

		chunks.push(remaining.slice(0, splitAt + 1).trim());
		remaining = remaining.slice(splitAt + 1).trim();
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

	const body = normalizeNewlines(note.body);
	const text = `## Paldeck ${note.heading}${body ? `\n\n${body}` : ``}`;
	return splitAnnouncementText(text);
}

async function getAnnouncementSettings(guildId) {
	const normalizedGuildId = requireAnnouncementId(guildId, `Guild ID`);
	const server = await JoinedServers.findOne({
		raw: true,
		where: { guild_id: normalizedGuildId },
	});

	return {
		guildId: normalizedGuildId,
		guildName: server?.guild_name || `Unknown Server`,
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
		...CLEARED_WARNING_STATE,
	});
}

async function clearAnnouncementChannel(guild) {
	return updateAnnouncementSettings(guild, {
		paldeck_announcement_channel_id: null,
		...CLEARED_WARNING_STATE,
	});
}

async function fetchGuild(client, guildId) {
	return client.guilds.cache.get(guildId) || client.guilds.fetch(guildId).catch(() => null);
}

function missingPermissionResult(cannotView, cannotSend) {
	if (!cannotView && !cannotSend) {
		return null;
	}
	const missing = [];
	if (cannotView) {
		missing.push(`view`);
	}
	if (cannotSend) {
		missing.push(`send`);
	}
	let ability = `send messages in`;
	if (missing.length === 2) {
		ability = `view or send messages in`;
	} else if (missing[0] === `view`) {
		ability = `view`;
	}
	return {
		code: missing.join(`-`),
		ok: false,
		message: `Paldeck cannot ${ability} the configured updates channel.`,
	};
}

async function checkAnnouncementChannelAccess(guild, channel) {
	if (!channel?.send || !channel.isTextBased?.()) {
		return { code: `unavailable`, ok: false, message: `The configured Paldeck Updates channel is unavailable.` };
	}

	const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
	const permissions = me ? channel.permissionsFor(me) : null;
	const cannotView = !permissions?.has(PermissionFlagsBits.ViewChannel);
	const cannotSend = !permissions?.has(PermissionFlagsBits.SendMessages);

	return missingPermissionResult(cannotView, cannotSend) || { channel, ok: true };
}

async function fetchAnnouncementChannel(guild, channelId) {
	if (!channelId) {
		return { code: `missing`, ok: false, message: `No Paldeck Updates channel is configured.` };
	}

	const channel = await guild.channels.fetch(channelId).catch(() => null);
	return checkAnnouncementChannelAccess(guild, channel);
}

async function recordAnnouncementFailure(guild, channelId, channelResult) {
	const server = await JoinedServers.findByPk(guild.id);
	const warningKey = `${channelId || `none`}:${channelResult.code || `unknown`}`;

	if (server && server.paldeck_announcement_warning_key !== warningKey) {
		// A materially different failure receives a fresh warning budget immediately.
		await server.update({
			...CLEARED_WARNING_STATE,
			paldeck_announcement_warning_key: warningKey,
		});
	}
}

function managerWarningContent(warningKey) {
	const failureCode = String(warningKey || ``).split(`:`).at(-1);
	const heading = `**Paldeck updates need attention**`;

	if (failureCode === `unavailable`) {
		return `${heading}\n\nYou are seeing this message because Paldeck has patch note updates enabled on this server, but the configured channel is no longer available. Use \`/updates channel\` to select another channel or \`/updates clear\` to disable announcements.`;
	}

	const permissionNames = [];
	if (failureCode.split(`-`).includes(`view`)) {
		permissionNames.push(`View Channel`);
	}
	if (failureCode.split(`-`).includes(`send`)) {
		permissionNames.push(`Send Messages`);
	}
	const missingPermissions = permissionNames.length ? permissionNames.join(`, `) : `Unknown`;

	return `${heading}\n\nYou are seeing this message because Paldeck has patch note updates enabled on this server, but it cannot post to the configured channel due to current permissions. Use \`/updates channel\` or modify the destination channel's permissions to repair it, or \`/updates clear\` to disable announcements.\n\n**Missing permissions:** ${missingPermissions}`;
}

function isEligibleManagerInteraction(interaction) {
	return interaction.isChatInputCommand?.() && interaction.guildId &&
		interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
}

function availableManagerWarningBudget(server, now) {
	const windowStartedAt = server.paldeck_announcement_warning_window_started_at;
	const lastSentAt = server.paldeck_announcement_warning_last_sent_at;
	const windowExpired = !windowStartedAt || now - new Date(windowStartedAt) >= MANAGER_WARNING_WINDOW_MS;
	const warningCount = windowExpired ? 0 : server.paldeck_announcement_warning_count;
	const intervalActive = lastSentAt && now - new Date(lastSentAt) < MANAGER_WARNING_INTERVAL_MS;

	if (warningCount >= MANAGER_WARNING_LIMIT || intervalActive) {
		return null;
	}

	return { warningCount, windowExpired, windowStartedAt };
}

async function sendAnnouncementWarningToManager(interaction, now = new Date()) {
	if (!isEligibleManagerInteraction(interaction)) {
		return false;
	}

	const server = await JoinedServers.findByPk(interaction.guildId);
	if (!server?.paldeck_announcement_channel_id || !server.paldeck_announcement_warning_key) {
		return false;
	}

	const budget = availableManagerWarningBudget(server, now);
	if (!budget) {
		return false;
	}

	const payload = {
		content: managerWarningContent(server.paldeck_announcement_warning_key),
		flags: MessageFlags.Ephemeral,
	};

	if (interaction.replied || interaction.deferred) {
		await interaction.followUp(payload);
	} else {
		await interaction.reply(payload);
	}

	await server.update({
		paldeck_announcement_warning_count: budget.warningCount + 1,
		paldeck_announcement_warning_last_sent_at: now,
		paldeck_announcement_warning_window_started_at: budget.windowExpired ? now : budget.windowStartedAt,
	});
	return true;
}

async function markPatchNotesSent(guildId, noteId) {
	const server = await JoinedServers.findByPk(guildId);

	if (!server) {
		return;
	}

	await server.update({
		paldeck_announcement_last_id: noteId,
		...CLEARED_WARNING_STATE,
	});
}

async function sendLatestPatchNotesToGuild(client, guildId, { force = false } = {}) {
	const normalizedGuildId = requireAnnouncementId(guildId, `Guild ID`);
	const settings = await getAnnouncementSettings(normalizedGuildId);
	const note = getLatestPatchNotes();

	if (!note) {
		return { guildId: normalizedGuildId, guildName: settings.guildName, ok: false, sent: 0, skipped: true, message: `No patch notes were found.` };
	}

	if (!force && settings.paldeckAnnouncementLastId === note.id) {
		return { guildId: normalizedGuildId, guildName: settings.guildName, ok: true, patchNoteId: note.id, sent: 0, skipped: true, message: `Latest patch notes were already sent.` };
	}

	const guild = await fetchGuild(client, normalizedGuildId);

	if (!guild) {
		return { guildId: normalizedGuildId, guildName: settings.guildName, ok: false, patchNoteId: note.id, sent: 0, skipped: true, message: `Guild is unavailable.` };
	}
	const guildName = guild.name || settings.guildName;

	const channelResult = await fetchAnnouncementChannel(guild, settings.paldeckAnnouncementChannelId);

	if (!channelResult.ok) {
		await recordAnnouncementFailure(guild, settings.paldeckAnnouncementChannelId, channelResult);

		return {
			guildId: normalizedGuildId,
			guildName,
			ok: false,
			patchNoteId: note.id,
			sent: 0,
			skipped: true,
			message: channelResult.message,
		};
	}

	const messages = formatPatchNotesMessages(note);

	for (const content of messages) {
		await channelResult.channel.send({ content });
	}

	await markPatchNotesSent(normalizedGuildId, note.id);

	return {
		guildId: normalizedGuildId,
		guildName,
		ok: true,
		patchNoteId: note.id,
		sent: messages.length,
		skipped: false,
		message: `Sent ${messages.length} patch-note message(s).`,
	};
}

async function broadcastLatestPatchNotes(client, { force = false } = {}) {
	const servers = await JoinedServers.findAll({
		attributes: [`guild_id`, `guild_name`],
		raw: true,
		where: {
			paldeck_announcement_channel_id: { [Op.ne]: null },
		},
	});
	const results = [];

	for (const server of servers) {
		try {
			const result = await sendLatestPatchNotesToGuild(client, server.guild_id, { force });
			results.push({ ...result, guildName: result.guildName || server.guild_name || `Unknown Server` });
		} catch (err) {
			error(`Failed to send Paldeck patch notes for guild ${server.guild_id}:`, err);
			results.push({
				guildId: server.guild_id,
				guildName: server.guild_name || `Unknown Server`,
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
	checkAnnouncementChannelAccess,
	clearAnnouncementChannel,
	formatPatchNotesMessages,
	getAnnouncementSettings,
	getLatestPatchNotes,
	normalizeAnnouncementId,
	parseLatestPatchNotes,
	saveAnnouncementChannel,
	sendAnnouncementWarningToManager,
	sendLatestPatchNotesToGuild,
	splitAnnouncementText,
};
