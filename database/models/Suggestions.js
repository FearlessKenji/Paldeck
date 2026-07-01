module.exports = (sequelize, DataTypes) => {
	return sequelize.define(`Suggestions`, {
		suggestion: {
			type: DataTypes.TEXT,
			allowNull: false,
		},
		author:{
			type: DataTypes.STRING,
			allowNull: false,
		},
		author_id: {
			type: DataTypes.STRING,
			allowNull: true,
		},
		guild_id: {
			type: DataTypes.STRING,
			allowNull: true,
		},
		guild_name: {
			type: DataTypes.STRING,
			allowNull: true,
		},
		channel_id: {
			type: DataTypes.STRING,
			allowNull: true,
		},
		channel_name: {
			type: DataTypes.STRING,
			allowNull: true,
		},
		suggestion_id: {
			type: DataTypes.STRING,
			allowNull: true,
		},
		accepted: {
			type: DataTypes.BOOLEAN,
			allowNull: false,
			defaultValue: false,
		},
	}, {
		timestamps: false,
	});
};
