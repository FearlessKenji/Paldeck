const { Events } = require(`discord.js`);
const { info, error } = require(`../utils/writeLog.js`);
const { JoinedServers } = require(`../database/dbObjects.js`); // Import the JoinedServers model

module.exports = {
	name: Events.GuildDelete,
	async execute(guild) {
		try {
			// Find and delete the entry from the JoinedServers table
			await JoinedServers.destroy({ where: { guild_id: guild.id } });
			info(`Removed from server: ${guild.name} | ID: ${guild.id}`);
		} catch (err) {
			error(`Failed to update log upon leaving.`, err);
		}
	},
};
