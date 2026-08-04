// Centralizes file-backed visibility rules so data refreshes, validation, and lookup tests agree.

const availabilityManifest = require(`../data/itemAvailability.json`);

const AVAILABILITY_BY_ITEM_ID = new Map(availabilityManifest.items.map(entry => [entry.id, entry]));
const UNAVAILABLE_ITEM_IDS = new Set(availabilityManifest.items
	.filter(entry => [`unused`, `unreleased`, `superseded`].includes(entry.status))
	.map(entry => entry.id));

function hasPlaceholderItemText(item) {
	const description = String(item?.description || ``).trim();
	const name = String(item?.name || ``).trim();

	return !description ||
		/^[a-z]{2}[_ ]text(?:\b|')/iu.test(description) ||
		/^\[WIP\]/iu.test(description) ||
		name === `-` ||
		description === `-` ||
		/^en[_ ]text(?:\b|')/iu.test(name);
}

function shouldHideItem(item) {
	// Schematics explicitly disabled by the installed item table are definitions, not obtainable card entries.
	const illegalSchematic = item?.category === `Schematic` && Number(item?.properties?.bLegalInGame ?? 0) === 0;
	return UNAVAILABLE_ITEM_IDS.has(item?.id) || illegalSchematic || hasPlaceholderItemText(item);
}

function availabilityEvidence(item) {
	const evidence = [];

	if (item?.recipes?.length) {
		evidence.push(`recipe`);
	}
	if (item?.droppedBy?.length) {
		evidence.push(`Pal drop`);
	}
	if (item?.acquisition?.sources?.length) {
		evidence.push(`acquisition source`);
	}
	if (item?.merchantLocations) {
		evidence.push(`merchant`);
	}

	return evidence;
}

function needsAvailabilityReview(item) {
	const decision = AVAILABILITY_BY_ITEM_ID.get(item?.id);
	const allowedEvidence = new Set(decision?.allowedEvidence || []);
	const unexpectedEvidence = availabilityEvidence(item).filter(evidence => !allowedEvidence.has(evidence));

	return item?.searchable === false &&
		!hasPlaceholderItemText(item) &&
		unexpectedEvidence.length > 0;
}

module.exports = {
	UNAVAILABLE_ITEM_IDS,
	availabilityManifest,
	availabilityEvidence,
	hasPlaceholderItemText,
	needsAvailabilityReview,
	shouldHideItem,
};
