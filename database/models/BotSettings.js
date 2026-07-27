module.exports = (sequelize, DataTypes) => {
	return sequelize.define(`BotSettings`, {
		key: {
			type: DataTypes.STRING,
			primaryKey: true,
		},
		value: {
			type: DataTypes.TEXT,
			allowNull: false,
		},
	}, {
		timestamps: false,
	});
};
