const childProcess = require(`node:child_process`);
const fs = require(`node:fs`);
const path = require(`node:path`);

const projectRoot = path.resolve(__dirname, `..`, `..`);

function assert(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

function listFiles(directory, predicate = () => true) {
	if (!fs.existsSync(directory)) {
		return [];
	}
	const files = [];
	for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
		const fullPath = path.join(directory, entry.name);
		files.push(...(entry.isDirectory() ? listFiles(fullPath, predicate) : predicate(fullPath) ? [fullPath] : []));
	}
	return files;
}

function readJson(...parts) {
	return JSON.parse(fs.readFileSync(resolveProject(...parts), `utf8`));
}

function relative(filePath) {
	return path.relative(projectRoot, filePath).replace(/\\/gu, `/`);
}

function requireFresh(...parts) {
	const resolvedPath = require.resolve(resolveProject(...parts));
	delete require.cache[resolvedPath];
	return require(resolvedPath);
}

function resolveProject(...parts) {
	return path.join(projectRoot, ...parts);
}

function runGit(args) {
	return childProcess.spawnSync(`git`, args, { cwd: projectRoot, encoding: `utf8` });
}

function serializeDiscordPayload(payload) {
	return JSON.stringify(payload, (_key, value) => typeof value?.toJSON === `function` ? value.toJSON() : value);
}

module.exports = {
	assert, childProcess, fs, listFiles, path, projectRoot, readJson, relative,
	requireFresh, resolveProject, runGit, serializeDiscordPayload,
};
