const Sequelize = require('sequelize');

const sequelize = new Sequelize('database', 'username', 'password', {
	host: 'localhost',
	dialect: 'sqlite',
	logging: false,
	storage: 'database/database.sqlite',
});

const Channels = require('./models/Channels.js')(sequelize, Sequelize.DataTypes);
require('./models/JoinedServers.js')(sequelize, Sequelize.DataTypes);
require('./models/Suggestions.js')(sequelize, Sequelize.DataTypes);
require('./models/BannedUsers.js')(sequelize, Sequelize.DataTypes);
require('./models/BannedServers.js')(sequelize, Sequelize.DataTypes);

const force = process.argv.includes('--force') || process.argv.includes('-f');

sequelize.sync({ force }).then(async () => {
	const channels = [
		Channels.upsert({ id: '1221954020424421437', name: 'Suggestions' }),
	];

	await Promise.all(channels);
	console.log('Database synced');

	sequelize.close();
}).catch(console.error);

