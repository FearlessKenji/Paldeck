const { Events } = require('discord.js');
const { writeLog } = require('../modules/writeLog.js');
const { JoinedServers, BannedServers, BannedUsers } = require('../database/dbObjects.js'); // Import the JoinedServers model

module.exports = {
	name: Events.GuildCreate,
	async execute(guild) {
		try {
			const owner = await guild.fetchOwner();
			const isBlockedServer = await BannedServers.findOne({ where: { guild_id: guild.id } });
			const isBlockedOwner = await BannedUsers.findOne({ where: { user_id: owner.id } });
			if (isBlockedServer || isBlockedOwner) {
			// Server is blacklisted, leave the server
				console.log(writeLog(`Leaving banned server: ${guild.name} | ID: ${guild.id}`));
				guild.leave();
				return;
			}
			console.log(writeLog(`Added to new server: ${guild.name} | ID: ${guild.id} | Owner: ${owner} | OwnerUsername: ${owner.user.username}.`));
			// Add the guild and owner information to the JoinedServers table
			await JoinedServers.create({
				guild_id: guild.id,
				guild_name: guild.name,
				owner_id: owner.id,
				owner_username: owner.user.username,
			});
		}
		catch (error) {
			console.error(writeLog('Failed to update log upon arrival.', error));
		}
	},
};
