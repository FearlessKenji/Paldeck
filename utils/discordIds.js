function isSnowflake(value) {
	return /^\d{17,20}$/.test(String(value || ``));
}

module.exports = { isSnowflake };
