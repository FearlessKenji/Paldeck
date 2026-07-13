module.exports = (sequelize, DataTypes) => {
	return sequelize.define(`JoinedServers`, {
		guild_id: {
			type: DataTypes.STRING,
			primaryKey: true,
		},
		guild_name: {
			type: DataTypes.STRING,
			allowNull: false,
		},
		owner_id: {
			type: DataTypes.STRING,
			allowNull: false,
		},
		owner_username: {
			type: DataTypes.STRING,
			allowNull: false,
		},
		paldeck_announcement_channel_id: {
			type: DataTypes.STRING,
			allowNull: true,
		},
		paldeck_announcement_last_id: {
			type: DataTypes.STRING,
			allowNull: true,
		},
	}, {
		timestamps: false,
	});
};
