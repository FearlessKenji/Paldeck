// Validates the versioned game-availability snapshot without requiring a Palworld install in CI.
const ALLOWED_STATUSES = new Set([`available`, `event-only`, `superseded`, `unreleased`, `unused`]);
const ALLOWED_EVIDENCE = new Set([`recipe`, `Pal drop`, `acquisition source`, `merchant`]);
const HIDDEN_STATUSES = new Set([`superseded`, `unreleased`, `unused`]);

function findAvailabilityManifestProblems(itemData, manifest) {
	const problems = [];
	const itemById = new Map((itemData.Items || []).map(item => [item.id, item]));
	const seen = new Set();

	if (manifest.schemaVersion !== 1) {
		problems.push(`Availability manifest schemaVersion must be 1.`);
	}
	if (!/^\d+$/u.test(String(manifest.game?.buildId || ``))) {
		problems.push(`Availability manifest requires a numeric Palworld build ID.`);
	}
	if (!Array.isArray(manifest.items) || !manifest.items.length) {
		return [...problems, `Availability manifest must contain audited item decisions.`];
	}

	for (const [index, decision] of manifest.items.entries()) {
		problems.push(...availabilityDecisionProblems({ decision, index, itemById, seen }));
	}

	return problems;
}

function availabilityDecisionProblems({ decision, index, itemById, seen }) {
	if (!String(decision.id || ``).trim() || seen.has(decision.id)) {
		return [`Availability decision ${index} has a missing or duplicate item ID.`];
	}
	seen.add(decision.id);
	const problems = [];
	if (!ALLOWED_STATUSES.has(decision.status)) {
		problems.push(`${decision.id}: unsupported availability status ${decision.status}.`);
	}
	if (!String(decision.reason || ``).trim()) {
		problems.push(`${decision.id}: availability decisions require a review rationale.`);
	}
	if ((decision.allowedEvidence || []).some(evidence => !ALLOWED_EVIDENCE.has(evidence))) {
		problems.push(`${decision.id}: allowedEvidence contains an unsupported evidence type.`);
	}
	const item = itemById.get(decision.id);
	if (!item) {
		problems.push(`${decision.id}: availability decision references a missing catalog item.`);
	} else if (HIDDEN_STATUSES.has(decision.status) && item.searchable !== false) {
		problems.push(`${item.name}: ${decision.status} availability decisions must be hidden from lookup.`);
	}
	return problems;
}

function steamBuildId(appManifestText) {
	return /"buildid"\s+"(\d+)"/u.exec(String(appManifestText || ``))?.[1] || null;
}

module.exports = {
	findAvailabilityManifestProblems,
	steamBuildId,
};
