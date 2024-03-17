const logsFolder = './logs';
const fs = require('node:fs');
const { dateToString } = require('./dateToString.js');

// Function to get initial content for the log file
function initLog() {
	const header = '=== Paldeck Console Log ===';
	const separator = '===========================';
	const timestamp = dateToString(Date.now());

	return `${header}\n${separator}\n[${timestamp}] Log file created.\n${separator}\n`;
}

// Function to write input data to a .log file
function writeLog(exception, err) {
	const logFile = 'logs/console.log'; // Specify the path to your .log file
	const logData = `${exception} ${err ? err : ''}`;

	if (!fs.existsSync(logFile)) {
		// Create the file if it doesn't exist
		if (!fs.existsSync(logsFolder)) {
			fs.mkdirSync(logsFolder);
			console.log(`Created "${logsFolder}" directory.`);
		}
		else {
			console.log(`"${logsFolder}" directory already exists.`);
		}

		fs.writeFileSync(logFile, initLog()); // You can add initial content here if needed
		console.log(`Created ${logFile}`);
	}

	// Append the input data to the log file
	const timestamp = dateToString(Date.now());
	fs.appendFileSync(logFile, `[${timestamp}] ${logData}\n`);
	return logData;
}
module.exports = { writeLog };