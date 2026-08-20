const { eligibleMutationChildren, mutationCandidateRankRanges, mutationOutcomesForParents, mutationTargetRange } = require(`./palMutations.js`);

function normalizeBreedingName(value) {
	return String(value || ``).trim().toLowerCase();
}

function pairKey(parentA, parentB) {
	return [normalizeBreedingName(parentA), normalizeBreedingName(parentB)]
		.sort((first, second) => first.localeCompare(second))
		.join(`|`);
}

function getBreedingValue({ breeding, pal }, breedingField, legacyField, fallback = null) {
	if (Object.hasOwn(breeding, breedingField)) {
		return breeding[breedingField];
	}

	if (Object.hasOwn(pal, legacyField)) {
		return pal[legacyField];
	}

	return fallback;
}

function withBreedingMetadata(pal, index, sourceOnly = false) {
	const breeding = pal.breeding || {};
	const value = (breedingField, legacyField, fallback) =>
		getBreedingValue({ breeding, pal }, breedingField, legacyField, fallback);

	return {
		...pal,
		breedingId: value(`id`, `breedingId`, ``),
		breedingIndex: value(`index`, `breedingIndex`, index),
		breedingPriority: value(`priority`, `breedingPriority`, null),
		breedingRank: value(`rank`, `breedingRank`, null),
		canBeChild: value(`canBeChild`, `canBeChild`, false),
		canBeParent: value(`canBeParent`, `canBeParent`, false),
		canBeStandardChild: value(`canBeStandardChild`, `canBeStandardChild`, false),
		hidden: Boolean(pal.hidden),
		index,
		isBreedingVariant: value(`variant`, `isBreedingVariant`, false),
		placeholder: Boolean(pal.placeholder),
		sourceOnly,
	};
}

function formatBreedingMethod(method) {
	if (method === `same-species`) {
		return `Same species`;
	}

	if (method === `unique-combination`) {
		return `Unique combination`;
	}

	if (method === `source-override`) {
		return `Source override`;
	}

	if (method === `gendered-pair-result`) {
		return `Gender-specific known result`;
	}

	return `Standard rank`;
}

function createBreedingState(palFile, breedingFile) {
	const localPals = (palFile.Pals || []).map((pal, index) => withBreedingMetadata(pal, index));
	const sourceOnlyPals = (breedingFile.SourceOnlyPals || [])
		.map((pal, index) => withBreedingMetadata(pal, localPals.length + index, true));
	const pals = [...localPals, ...sourceOnlyPals];
	return {
		pals,
		parentPals: pals.filter(pal => pal.canBeParent && !pal.hidden),
		childPals: pals.filter(pal => pal.canBeChild && !pal.hidden),
		standardChildren: pals.filter(pal => pal.canBeStandardChild && !pal.hidden),
		palsByName: new Map(pals.map(pal => [normalizeBreedingName(pal.name), pal])),
		genderedPairResults: new Map(), sourceOverrides: new Map(), uniqueCombinations: new Map(), resultCache: new Map(),
	};
}

function addCombination(state, target, row) {
	const [parentAName, parentBName, childName] = Array.isArray(row) ? row : [row.parentA, row.parentB, row.child];
	const parentA = state.palsByName.get(normalizeBreedingName(parentAName));
	const parentB = state.palsByName.get(normalizeBreedingName(parentBName));
	const child = state.palsByName.get(normalizeBreedingName(childName));
	if (!parentA || !parentB || !child) {
		return;
	}
	target.set(pairKey(parentA.name, parentB.name), { child, parentA, parentB });
}

function addGenderedPairResult(state, row) {
	const parentA = state.palsByName.get(normalizeBreedingName(row.parentA));
	const parentB = state.palsByName.get(normalizeBreedingName(row.parentB));
	const child = state.palsByName.get(normalizeBreedingName(row.child));
	if (!parentA || !parentB || !child) {
		return;
	}
	const key = pairKey(parentA.name, parentB.name);
	const entries = state.genderedPairResults.get(key) || [];
	entries.push({
		child, parentA, parentAGender: row.parentAGender || null,
		parentB, parentBGender: row.parentBGender || null,
	});
	state.genderedPairResults.set(key, entries);
}

function loadBreedingCombinations(state, breedingFile) {
	for (const row of breedingFile.SourceOverrides || []) {
		addCombination(state, state.sourceOverrides, row);
	}
	for (const row of breedingFile.GenderedPairResults || []) {
		addGenderedPairResult(state, row);
	}
	for (const row of breedingFile.UniqueCombinations || []) {
		if (row?.parentAGender || row?.parentBGender) {
			addGenderedPairResult(state, row);
		} else {
			addCombination(state, state.uniqueCombinations, row);
		}
	}
}

function createBreedingHelpers(state) {
	const { palsByName, standardChildren } = state;
	function getPal(name) {
		return palsByName.get(normalizeBreedingName(name)) || null;
	}

	function compareStandardChildCandidates(first, second) {
		const firstPriority = Number.isFinite(first.breedingPriority) ? first.breedingPriority : Number.NEGATIVE_INFINITY;
		const secondPriority = Number.isFinite(second.breedingPriority) ? second.breedingPriority : Number.NEGATIVE_INFINITY;

		if (firstPriority !== secondPriority) {
			return secondPriority - firstPriority;
		}

		return first.index - second.index;
	}

	function findClosestStandardChild(targetRank) {
		if (!Number.isFinite(targetRank)) {
			return null;
		}

		let bestMatch = null;
		let bestDistance = Infinity;

		for (const pal of standardChildren) {
			if (!Number.isFinite(pal.breedingRank)) {
				continue;
			}

			const distance = Math.abs(pal.breedingRank - targetRank);

			if (
				!bestMatch ||
				distance < bestDistance ||
				(distance === bestDistance && compareStandardChildCandidates(pal, bestMatch) < 0)
			) {
				bestMatch = pal;
				bestDistance = distance;
			}
		}

		return bestMatch;
	}

	function orientGenderedResult(entry, parentA, parentB) {
		if (entry.parentA.name === parentA.name && entry.parentB.name === parentB.name) {
			return {
				child: entry.child,
				parentA,
				parentAGender: entry.parentAGender,
				parentB,
				parentBGender: entry.parentBGender,
			};
		}

		return {
			child: entry.child,
			parentA,
			parentAGender: entry.parentBGender,
			parentB,
			parentBGender: entry.parentAGender,
		};
	}

	function resultChildren(result) {
		return result.children || [{
			child: result.child,
			parentA: result.parentA,
			parentAGender: null,
			parentB: result.parentB,
			parentBGender: null,
		}];
	}

	function resultHasChild(result, child) {
		return resultChildren(result).some(entry => entry.child?.name === child.name);
	}

	function focusResultChild(result, child) {
		if (result.method !== `gendered-pair-result`) {
			return result;
		}

		const children = resultChildren(result).filter(entry => entry.child?.name === child.name);

		return {
			...result,
			child: children[0]?.child || result.child,
			children,
		};
	}
	return { findClosestStandardChild, focusResultChild, getPal, orientGenderedResult, resultHasChild };
}

function standardBreedingResult(parentA, parentB, findClosestStandardChild, rankModifier = 0) {
	const targetRank = Number.isFinite(parentA.breedingRank) && Number.isFinite(parentB.breedingRank) ?
		Math.floor((parentA.breedingRank + parentB.breedingRank + 1) / 2) + rankModifier :
		null;
	const child = findClosestStandardChild(targetRank);
	return {
		parentA, parentB, child,
		children: [{ child, parentA, parentAGender: null, parentB, parentBGender: null }],
		method: `standard`, targetRank, specialCombination: null,
	};
}

function createPairCalculator(state, helpers) {
	const { genderedPairResults, resultCache, sourceOverrides, uniqueCombinations } = state;
	const { findClosestStandardChild, orientGenderedResult } = helpers;
	function calculateForPals(parentA, parentB, rankModifier = 0) {
		const normalizedModifier = Math.min(10, Math.max(0, Number.isInteger(rankModifier) ? rankModifier : 0));
		const parentsKey = pairKey(parentA.name, parentB.name);
		const cacheKey = `${parentsKey}|${normalizedModifier}`;
		const cachedResult = resultCache.get(cacheKey);

		if (cachedResult) {
			return cachedResult;
		}

		const genderedResults = genderedPairResults.get(parentsKey);

		if (genderedResults?.length) {
			const children = genderedResults.map(entry => orientGenderedResult(entry, parentA, parentB));
			const result = {
				parentA,
				parentB,
				child: children[0]?.child || null,
				children,
				method: `gendered-pair-result`,
				targetRank: null,
				specialCombination: null,
			};

			resultCache.set(cacheKey, result);
			return result;
		}

		const sourceOverride = sourceOverrides.get(parentsKey);

		if (sourceOverride) {
			const result = {
				parentA,
				parentB,
				child: sourceOverride.child,
				children: [{
					child: sourceOverride.child,
					parentA,
					parentAGender: null,
					parentB,
					parentBGender: null,
				}],
				method: `source-override`,
				targetRank: null,
				specialCombination: null,
			};

			resultCache.set(cacheKey, result);
			return result;
		}

		const uniqueCombination = uniqueCombinations.get(parentsKey);

		if (uniqueCombination) {
			const result = {
				parentA,
				parentB,
				child: uniqueCombination.child,
				children: [{
					child: uniqueCombination.child,
					parentA,
					parentAGender: null,
					parentB,
					parentBGender: null,
				}],
				method: `unique-combination`,
				targetRank: null,
				specialCombination: uniqueCombination,
			};

			resultCache.set(cacheKey, result);
			return result;
		}

		if (parentA.breedingId === parentB.breedingId) {
			const result = {
				parentA,
				parentB,
				child: parentA,
				children: [{
					child: parentA,
					parentA,
					parentAGender: null,
					parentB,
					parentBGender: null,
				}],
				method: `same-species`,
				targetRank: null,
				specialCombination: null,
			};

			resultCache.set(cacheKey, result);
			return result;
		}

		const result = standardBreedingResult(parentA, parentB, findClosestStandardChild, normalizedModifier);
		result.rankModifier = normalizedModifier;

		resultCache.set(cacheKey, result);
		return result;
	}
	return calculateForPals;
}

function collectMutationParentPairs(parentPals, childRange) {
	const pairs = [];
	for (let firstIndex = 0; firstIndex < parentPals.length; firstIndex += 1) {
		for (let secondIndex = firstIndex; secondIndex < parentPals.length; secondIndex += 1) {
			const parentA = parentPals[firstIndex];
			const parentB = parentPals[secondIndex];
			const range = mutationTargetRange(parentA.breedingRank, parentB.breedingRank);
			const overlapMinimum = Math.max(range.minimum, childRange.minimum);
			const overlapMaximum = Math.min(range.maximum, childRange.maximum);
			const rollCount = Math.max(0, overlapMaximum - overlapMinimum + 1);
			if (rollCount) {
				pairs.push({ parentA, parentB, probability: rollCount / (range.maximum - range.minimum + 1) });
			}
		}
	}
	return pairs;
}

function createMutationParentPairFinder(pals, parentPals, getPal) {
	const candidates = eligibleMutationChildren(pals);
	const candidateRanges = mutationCandidateRankRanges(candidates);
	return childName => {
		const child = getPal(childName);
		if (!child || child.hidden || !candidates.some(candidate => candidate.name === child.name)) {
			return null;
		}
		const childRange = candidateRanges.get(child.name);
		if (!childRange) {
			return { child, pairs: [] };
		}
		const pairs = collectMutationParentPairs(parentPals, childRange);
		pairs.sort((first, second) => second.probability - first.probability ||
			first.parentA.name.localeCompare(second.parentA.name) || first.parentB.name.localeCompare(second.parentB.name));
		return { child, pairs };
	};
}

function createBreedingQueries(state, helpers, calculateForPals) {
	const { childPals, pals, parentPals } = state;
	const { focusResultChild, getPal, resultHasChild } = helpers;
	const mutationCandidates = eligibleMutationChildren(pals);
	const findMutationParentPairs = createMutationParentPairFinder(pals, parentPals, getPal);
	function getMutatedChildrenForParents(parentAName, parentBName) {
		const parentA = getPal(parentAName);
		const parentB = getPal(parentBName);
		if (!parentA || !parentB || parentA.hidden || parentB.hidden) {
			return null;
		}
		const outcomes = mutationOutcomesForParents(
			parentA.breedingRank,
			parentB.breedingRank,
			mutationCandidates,
		);
		return {
			children: outcomes.map(outcome => getPal(outcome.name)).filter(Boolean),
			outcomes,
			parentA,
			parentB,
			targetRange: mutationTargetRange(parentA.breedingRank, parentB.breedingRank),
		};
	}

	function calculateChild(parentAName, parentBName, options = {}) {
		const parentA = getPal(parentAName);
		const parentB = getPal(parentBName);

		if (!parentA || !parentB) {
			return null;
		}

		if (!parentA.canBeParent || !parentB.canBeParent || parentA.hidden || parentB.hidden) {
			return null;
		}

		return calculateForPals(parentA, parentB, options.rankModifier);
	}

	function findParentPairs(childName) {
		const child = getPal(childName);

		if (!child) {
			return null;
		}

		if (!child.canBeChild || child.hidden) {
			return null;
		}

		const pairs = [];

		for (let firstIndex = 0; firstIndex < parentPals.length; firstIndex += 1) {
			for (let secondIndex = firstIndex; secondIndex < parentPals.length; secondIndex += 1) {
				const result = calculateForPals(parentPals[firstIndex], parentPals[secondIndex]);

				if (resultHasChild(result, child)) {
					pairs.push(focusResultChild(result, child));
				}
			}
		}

		return {
			child,
			pairs,
		};
	}

	function findPartners(parentName, childName) {
		const parent = getPal(parentName);
		const child = getPal(childName);

		if (!parent || !child) {
			return null;
		}

		if (!parent.canBeParent || !child.canBeChild || parent.hidden || child.hidden) {
			return null;
		}

		const partners = parentPals
			.map(partner => ({
				partner,
				result: calculateForPals(parent, partner),
			}))
			.filter(entry => resultHasChild(entry.result, child))
			.map(entry => ({
				...entry,
				result: focusResultChild(entry.result, child),
			}));

		return {
			parent,
			child,
			partners,
		};
	}

	return {
		calculateChild,
		childPals,
		findParentPairs,
		findMutationParentPairs,
		findPartners,
		formatBreedingMethod,
		getPal,
		getMutatedChildrenForParents,
		pals,
		parentPals,
	};
}

function createBreedingCalculator(palFile, breedingFile = palFile) {
	const state = createBreedingState(palFile, breedingFile);
	loadBreedingCombinations(state, breedingFile);
	const helpers = createBreedingHelpers(state);
	const calculateForPals = createPairCalculator(state, helpers);
	return createBreedingQueries(state, helpers, calculateForPals);
}

module.exports = {
	createBreedingCalculator,
	formatBreedingMethod,
	normalizeBreedingName,
};
