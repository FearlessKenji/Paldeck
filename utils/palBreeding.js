function normalizeBreedingName(value) {
	return String(value || ``).trim().toLowerCase();
}

function pairKey(parentA, parentB) {
	return [normalizeBreedingName(parentA), normalizeBreedingName(parentB)]
		.sort((first, second) => first.localeCompare(second))
		.join(`|`);
}

function withBreedingMetadata(pal, index, sourceOnly = false) {
	return {
		...pal,
		index,
		sourceOnly,
	};
}

function formatBreedingMethod(method) {
	if (method === `same-species`) {
		return `Same species`;
	}

	if (method === `special`) {
		return `Special combination`;
	}

	return `Standard rank`;
}

function createBreedingCalculator(breedingFile) {
	const localPals = breedingFile.Pals.map((pal, index) => withBreedingMetadata(pal, index));
	const sourceOnlyPals = (breedingFile.SourceOnlyPals || [])
		.map((pal, index) => withBreedingMetadata(pal, localPals.length + index, true));
	const pals = [...localPals, ...sourceOnlyPals];
	const parentPals = pals.filter(pal => pal.canBeParent);
	const childPals = pals.filter(pal => pal.canBeChild);
	const standardChildren = pals.filter(pal => pal.canBeStandardChild);
	const palsByName = new Map(pals.map(pal => [normalizeBreedingName(pal.name), pal]));
	const specialCombinations = new Map();
	const resultCache = new Map();

	for (const combination of breedingFile.SpecialCombinations || []) {
		specialCombinations.set(pairKey(combination.parentA, combination.parentB), combination);
	}

	function getPal(name) {
		return palsByName.get(normalizeBreedingName(name)) || null;
	}

	function findClosestStandardChild(targetRank) {
		let bestMatch = null;
		let bestDistance = Infinity;

		for (const pal of standardChildren) {
			const distance = Math.abs(pal.breedingRank - targetRank);

			if (!bestMatch || distance < bestDistance || (distance === bestDistance && pal.index < bestMatch.index)) {
				bestMatch = pal;
				bestDistance = distance;
			}
		}

		return bestMatch;
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
				method: `same-species`,
				targetRank: null,
				specialCombination: null,
			};

			resultCache.set(cacheKey, result);
			return result;
		}

		const specialCombination = specialCombinations.get(cacheKey);

		if (specialCombination) {
			const result = {
				parentA,
				parentB,
				child: getPal(specialCombination.child),
				method: `special`,
				targetRank: null,
				specialCombination,
			};

			resultCache.set(cacheKey, result);
			return result;
		}

		const targetRank = Math.floor((parentA.breedingRank + parentB.breedingRank + 1) / 2);
		const result = {
			parentA,
			parentB,
			child: findClosestStandardChild(targetRank),
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

		return calculateForPals(parentA, parentB);
	}

	function findParentPairs(childName) {
		const child = getPal(childName);

		if (!child) {
			return null;
		}

		const pairs = [];

		for (let firstIndex = 0; firstIndex < parentPals.length; firstIndex += 1) {
			for (let secondIndex = firstIndex; secondIndex < parentPals.length; secondIndex += 1) {
				const result = calculateForPals(parentPals[firstIndex], parentPals[secondIndex]);

				if (result.child?.name === child.name) {
					pairs.push(result);
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

		const partners = parentPals
			.map(partner => ({
				partner,
				result: calculateForPals(parent, partner),
			}))
			.filter(entry => entry.result.child?.name === child.name);

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
