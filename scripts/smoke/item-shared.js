const fs = require(`node:fs`);
const path = require(`node:path`);
const { itemDescriptionParts, normalizeItemDescription } = require(`../../utils/itemDescription.js`);
const { UNAVAILABLE_ITEM_IDS, needsAvailabilityReview, shouldHideItem } = require(`../../utils/itemVisibility.js`);
const { sourceText } = require(`../../utils/itemCards.js`);
const { itemSourcePresentation } = require(`../lib/maps/item-map-rendering.js`);

const projectRoot = path.resolve(__dirname, `..`, `..`);

function assert(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

function resolveProject(...parts) {
	return path.join(projectRoot, ...parts);
}

function readJson(...parts) {
	return JSON.parse(fs.readFileSync(path.join(projectRoot, ...parts), `utf8`));
}

function requireFresh(...parts) {
	const filePath = path.join(projectRoot, ...parts);
	const resolvedPath = require.resolve(filePath);
	delete require.cache[resolvedPath];
	return require(resolvedPath);
}

function serializeDiscordPayload(payload) {
	return JSON.stringify(payload, (_key, value) => typeof value?.toJSON === `function` ? value.toJSON() : value);
}

module.exports = {
	UNAVAILABLE_ITEM_IDS, assert, fs, itemDescriptionParts, itemSourcePresentation, needsAvailabilityReview,
	normalizeItemDescription, path, readJson, requireFresh, resolveProject, serializeDiscordPayload, shouldHideItem, sourceText,
};
