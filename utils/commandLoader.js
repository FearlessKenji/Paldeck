const fs = require(`node:fs`);
const path = require(`node:path`);

function noop() {
	return undefined;
}

function findCommandFiles(directory) {
	const resolvedDirectory = path.resolve(directory);
	const entries = fs.readdirSync(resolvedDirectory, { withFileTypes: true });
	const files = [];

	for (const entry of entries) {
		const entryPath = path.join(resolvedDirectory, entry.name);

		if (entry.isDirectory()) {
			files.push(...findCommandFiles(entryPath));
			continue;
		}

		if (entry.isFile() && entry.name.endsWith(`.js`)) {
			files.push(entryPath);
		}
	}

	return files;
}

function loadCommandFiles(directory, options = {}) {
	const warn = options.warn || noop;
	const commandFiles = findCommandFiles(directory);
	const commands = [];

	for (const filePath of commandFiles) {
		const command = require(filePath);

		if (command?.data && typeof command.execute === `function`) {
			commands.push({ command, filePath });
			continue;
		}

		warn(`The command at ${filePath} is missing a required "data" or "execute" property.`);
	}

	return commands;
}

function loadCommandCollection(collection, directory, options = {}) {
	const commands = loadCommandFiles(directory, options);

	for (const { command } of commands) {
		collection.set(command.data.name, command);
	}

	return collection;
}

function loadCommandData(directory, options = {}) {
	return loadCommandFiles(directory, options).map(({ command }) => command.data.toJSON());
}

module.exports = {
	loadCommandCollection,
	loadCommandData,
	loadCommandFiles,
};
