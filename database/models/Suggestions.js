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
