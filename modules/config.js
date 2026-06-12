let fileConfig = {};

try {
	fileConfig = require('../config.json');
}
catch (error) {
	if (error.code !== 'MODULE_NOT_FOUND') {
		throw error;
	}
}

const config = {
	botOwner: fileConfig.botOwner,
	guildId: fileConfig.guildId,
	count: fileConfig.count,
};

module.exports = config;
