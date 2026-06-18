const { JoinedServers, BannedServers, BannedUsers } = require(`../database/dbObjects.js`);
const { info } = require(`./writeLog.js`);

const OWNER_FETCH_CONCURRENCY = 10;

async function runWithConcurrency(items, limit, worker) {
	let nextIndex = 0;
	const workerCount = Math.min(limit, items.length);
	const results = new Array(items.length);

	async function runNext() {
		while (nextIndex < items.length) {
			const currentIndex = nextIndex;
			nextIndex++;
			results[currentIndex] = await worker(items[currentIndex], currentIndex);
		}
	}

	await Promise.all(Array.from({ length: workerCount }, runNext));

	return results;
}

async function removeStaleJoinedServers(joinedServers, currentGuildIds) {
	const staleServers = joinedServers.filter(server => !currentGuildIds.has(server.guild_id));

	for (const server of staleServers) {
		await JoinedServers.destroy({ where: { guild_id: server.guild_id } });
	}

	return staleServers.length;
}

async function syncGuild(guild, bannedServerIds, bannedUserIds) {
	try {
		const owner = await guild.fetchOwner();
		const ownerUser = owner.user;
		const isBlockedServer = bannedServerIds.has(guild.id);
		const isBlockedOwner = bannedUserIds.has(ownerUser.id);

		if (isBlockedServer || isBlockedOwner) {
			await guild.leave();
			await JoinedServers.destroy({ where: { guild_id: guild.id } });
			return `leftBanned`;
		}

		await JoinedServers.upsert({
			guild_id: guild.id,
			guild_name: guild.name,
			owner_id: ownerUser.id,
			owner_username: ownerUser.username,
		});
		return `synced`;
	} catch {
		return `failed`;
	}
}

async function syncJoinedServers(client) {
	info(`Synchronizing servers...`);

	const guilds = client.guilds.cache.map(guild => guild);
	const currentGuildIds = new Set(guilds.map(guild => guild.id));
	const [joinedServers, bannedServers, bannedUsers] = await Promise.all([
		JoinedServers.findAll(),
		BannedServers.findAll(),
		BannedUsers.findAll(),
	]);
	const bannedServerIds = new Set(bannedServers.map(server => server.guild_id));
	const bannedUserIds = new Set(bannedUsers.map(user => user.user_id));

	const staleRemoved = await removeStaleJoinedServers(joinedServers, currentGuildIds);
	const syncResults = await runWithConcurrency(guilds, OWNER_FETCH_CONCURRENCY, guild => syncGuild(guild, bannedServerIds, bannedUserIds));
	const leftBanned = syncResults.filter(result => result === `leftBanned`).length;
	const summary = {
		current: guilds.length - leftBanned,
		staleRemoved,
		leftBanned,
		failed: syncResults.filter(result => result === `failed`).length,
	};

	info(`Servers synced. Current: ${summary.current}, Stale: ${summary.staleRemoved}, Left: ${summary.leftBanned}, Failed: ${summary.failed}`);

	return summary;
}

module.exports = { syncJoinedServers };
