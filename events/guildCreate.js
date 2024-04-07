const { Events } = require('discord.js');
const { writeLog } = require('../modules/writeLog.js');

module.exports = {
	name: Events.GuildCreate,
	async execute(guild) {
		try {
			console.log(writeLog(`Added to new server: ${guild.name})\nID: ${guild.id}.`));
		}
		catch (error) {
			console.error(writeLog('Failed to update server table upon arrival.', error));
		}
	},
};