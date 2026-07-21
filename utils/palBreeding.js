function normalizeBreedingName(value) {
	return String(value || ``).trim().toLowerCase();
}

function pairKey(parentA, parentB) {
	return [normalizeBreedingName(parentA), normalizeBreedingName(parentB)]
		.sort((first, second) => first.localeCompare(second))
		.join(`|`);
}

function getBreedingValue(breeding, pal, breedingField, legacyField, fallback = null) {
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

	return {
		...pal,
		breedingId: getBreedingValue(breeding, pal, `id`, `breedingId`, ``),
		breedingIndex: getBreedingValue(breeding, pal, `index`, `breedingIndex`, index),
		breedingPriority: getBreedingValue(breeding, pal, `priority`, `breedingPriority`, null),
		breedingRank: getBreedingValue(breeding, pal, `rank`, `breedingRank`, null),
		canBeChild: getBreedingValue(breeding, pal, `canBeChild`, `canBeChild`, false),
		canBeParent: getBreedingValue(breeding, pal, `canBeParent`, `canBeParent`, false),
		canBeStandardChild: getBreedingValue(breeding, pal, `canBeStandardChild`, `canBeStandardChild`, false),
		hidden: Boolean(pal.hidden),
		index,
		isBreedingVariant: getBreedingValue(breeding, pal, `variant`, `isBreedingVariant`, false),
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

function createBreedingCalculator(palFile, breedingFile = palFile) {
	const localPals = (palFile.Pals || []).map((pal, index) => withBreedingMetadata(pal, index));
	const sourceOnlyPals = (breedingFile.SourceOnlyPals || [])
		.map((pal, index) => withBreedingMetadata(pal, localPals.length + index, true));
	const pals = [...localPals, ...sourceOnlyPals];
	const parentPals = pals.filter(pal => pal.canBeParent && !pal.hidden);
	const childPals = pals.filter(pal => pal.canBeChild && !pal.hidden);
	const standardChildren = pals.filter(pal => pal.canBeStandardChild && !pal.hidden);
	const palsByName = new Map(pals.map(pal => [normalizeBreedingName(pal.name), pal]));
	const genderedPairResults = new Map();
	const sourceOverrides = new Map();
	const uniqueCombinations = new Map();
	const resultCache = new Map();

	function addCombination(target, row) {
		const [parentAName, parentBName, childName] = Array.isArray(row) ?
			row :
			[row.parentA, row.parentB, row.child];
		const parentA = palsByName.get(normalizeBreedingName(parentAName));
		const parentB = palsByName.get(normalizeBreedingName(parentBName));
		const child = palsByName.get(normalizeBreedingName(childName));

		if (!parentA || !parentB || !child) {
			return;
		}

		target.set(pairKey(parentA.name, parentB.name), {
			child,
			parentA,
			parentB,
		});
	}

	function addGenderedPairResult(row) {
		const parentA = palsByName.get(normalizeBreedingName(row.parentA));
		const parentB = palsByName.get(normalizeBreedingName(row.parentB));
		const child = palsByName.get(normalizeBreedingName(row.child));

		if (!parentA || !parentB || !child) {
			return;
		}

		const key = pairKey(parentA.name, parentB.name);
		const entries = genderedPairResults.get(key) || [];

		entries.push({
			child,
			parentA,
			parentAGender: row.parentAGender || null,
			parentB,
			parentBGender: row.parentBGender || null,
		});
		genderedPairResults.set(key, entries);
	}

	function hasGenderRequirement(row) {
		return Boolean(row?.parentAGender || row?.parentBGender);
	}

	for (const sourceOverride of breedingFile.SourceOverrides || []) {
		addCombination(sourceOverrides, sourceOverride);
	}

	for (const genderedPairResult of breedingFile.GenderedPairResults || []) {
		addGenderedPairResult(genderedPairResult);
	}

	for (const combination of breedingFile.UniqueCombinations || []) {
		if (hasGenderRequirement(combination)) {
			addGenderedPairResult(combination);
		} else {
			addCombination(uniqueCombinations, combination);
		}
	}

	function getPal(name) {
		return palsByName.get(normalizeBreedingName(name)) || null;
	}

	function compareStandardChildCandidates(first, second) {
		const firstPriority = Number.isFinite(first.breedingPriority) ? first.breedingPriority : Number.NEGATIVE_INFINITY;
		const secondPriority = Number.isFinite(second.breedingPriority) ? second.breedingPriority : Number.NEGATIVE_INFINITY;

		if (firstPriority !== secondPriority) {
			return secondPriority - firstPriority;
		}

		if (first.isBreedingVariant !== second.isBreedingVariant) {
			return first.isBreedingVariant ? 1 : -1;
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

	function calculateForPals(parentA, parentB) {
		const cacheKey = pairKey(parentA.name, parentB.name);
		const cachedResult = resultCache.get(cacheKey);

		if (cachedResult) {
			return cachedResult;
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

		const genderedResults = genderedPairResults.get(cacheKey);

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

		const sourceOverride = sourceOverrides.get(cacheKey);

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

		const uniqueCombination = uniqueCombinations.get(cacheKey);

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

		const targetRank = Number.isFinite(parentA.breedingRank) && Number.isFinite(parentB.breedingRank) ?
			Math.floor((parentA.breedingRank + parentB.breedingRank + 1) / 2) :
			null;
		const child = findClosestStandardChild(targetRank);
		const result = {
			parentA,
			parentB,
			child,
			children: [{
				child,
				parentA,
				parentAGender: null,
				parentB,
				parentBGender: null,
			}],
			method: `standard`,
			targetRank,
			specialCombination: null,
		};

		resultCache.set(cacheKey, result);
		return result;
	}

	function calculateChild(parentAName, parentBName) {
		const parentA = getPal(parentAName);
		const parentB = getPal(parentBName);

		if (!parentA || !parentB) {
			return null;
		}

		if (!parentA.canBeParent || !parentB.canBeParent || parentA.hidden || parentB.hidden) {
			return null;
		}

		return calculateForPals(parentA, parentB);
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
		findPartners,
		formatBreedingMethod,
		getPal,
		pals,
		parentPals,
	};
}

module.exports = {
	createBreedingCalculator,
	formatBreedingMethod,
	normalizeBreedingName,
};
