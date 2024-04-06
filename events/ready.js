const { Events } = require('discord.js');
const { writeLog } = require('../modules/writeLog.js');

// When the client is ready, run this code (only once).
// The distinction between `client: Client<boolean>` and `readyClient: Client<true>` is important for TypeScript developers.
// It makes some properties non-nullable.
module.exports = {
	name: Events.ClientReady,
	once: true,
	execute(client) {
		// Ready
		console.log(writeLog(`Ready! Logged in as ${client.user.tag}`));
		client.user.setPresence({
			status: 'online',
			activity: {
				name: `with pals in ${client.guilds.cache.size} servers.`, // Customize this to your desired status message
				type: 'PLAYING', // You can choose from WATCHING, PLAYING, STREAMING, and LISTENING
			},
		});
	},
};