const { Events, ActivityType } = require('discord.js');
const { writeLog } = require('../modules/writeLog.js');
const { JoinedServers } = require('../database/dbObjects.js');

module.exports = {
	name: Events.ClientReady,
	once: true,
	async execute(client) {
		client.user.setActivity({
			type: ActivityType.Custom,
			name: `Catching pals in ${client.guilds.cache.size} servers`,
		});
		const guilds = client.guilds.cache.map(guild => guild);
		for (const guild of guilds) {
			const owner = await guild.fetchOwner();
			console.log(writeLog(guild.id, guild.name, owner.user.id, owner.user.username));
			await JoinedServers.upsert({
				guild_id: guild.id,
				guild_name: guild.name,
				owner_id: owner.user.id,
				owner_username: owner.user.username,
			});
		}
		console.log(writeLog(`Ready! Logged in as ${client.user.tag}`));
	},
};
