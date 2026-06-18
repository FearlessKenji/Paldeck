const { Events } = require(`discord.js`);
const { info } = require(`../utils/writeLog.js`);
const { syncJoinedServers } = require(`../utils/syncJoinedServers.js`);

module.exports = {
	name: Events.ClientReady,
	once: true,
	async execute(client) {
		await syncJoinedServers(client);
		info(`Ready! Logged in as ${client.user.tag}`);
	},
};
