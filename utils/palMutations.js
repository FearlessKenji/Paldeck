const MUTATION_RANK_COEFFICIENT = 0.5;
const MUTATION_RANK_DIFFERENCE_PENALTY = 0.4;
const MUTATION_RANDOM_COEFFICIENT = 0.1;
const MUTATION_RATE = 0.01;

function mutationRateForBonus(bonusPercent = 0) {
	const normalizedBonus = Number.isFinite(bonusPercent) ? bonusPercent : 0;
	return Math.min(1, Math.max(0, MUTATION_RATE + normalizedBonus * 0.01));
}

function compareMutationCandidates(first, second) {
	if (first.breeding.rank !== second.breeding.rank) {
		return first.breeding.rank - second.breeding.rank;
	}
	if (first.breeding.priority !== second.breeding.priority) {
		return second.breeding.priority - first.breeding.priority;
	}
	return first.breeding.index - second.breeding.index;
}

function nearestMutationCandidate(candidates, targetRank) {
	return candidates.reduce((nearest, candidate) => {
		if (!nearest) {
			return candidate;
		}
		const candidateDistance = Math.abs(candidate.breeding.rank - targetRank);
		const nearestDistance = Math.abs(nearest.breeding.rank - targetRank);
		if (candidateDistance !== nearestDistance) {
			return candidateDistance < nearestDistance ? candidate : nearest;
		}
		return compareMutationCandidates(candidate, nearest) < 0 ? candidate : nearest;
	}, null);
}

// Palworld rounds each positive coefficient product to the nearest integer, adds one,
// then rolls uniformly across a span based on the lower-ranked parent.
function mutationTargetRange(firstParentRank, secondParentRank) {
	if (!Number.isFinite(firstParentRank) || !Number.isFinite(secondParentRank)) {
		return null;
	}
	const lowerRank = Math.min(firstParentRank, secondParentRank);
	const rankDifference = Math.abs(firstParentRank - secondParentRank);
	const base = Math.round(lowerRank * MUTATION_RANK_COEFFICIENT);
	const penalty = Math.round(rankDifference * MUTATION_RANK_DIFFERENCE_PENALTY);
	const span = Math.max(1, Math.round(lowerRank * MUTATION_RANDOM_COEFFICIENT));
	return { maximum: base + penalty + span, minimum: base + penalty + 1 };
}

function mutationChildrenForParents(firstParentRank, secondParentRank, candidates) {
	return mutationOutcomesForParents(firstParentRank, secondParentRank, candidates).map(outcome => outcome.name);
}

function mutationOutcomesForParents(firstParentRank, secondParentRank, candidates) {
	const range = mutationTargetRange(firstParentRank, secondParentRank);
	if (!range || !candidates.length) {
		return [];
	}
	const results = new Map();
	for (let targetRank = range.minimum; targetRank <= range.maximum; targetRank += 1) {
		const candidate = nearestMutationCandidate(candidates, targetRank);
		const outcome = results.get(candidate.name) || { candidate, rollCount: 0 };
		outcome.rollCount += 1;
		results.set(candidate.name, outcome);
	}
	const totalRolls = range.maximum - range.minimum + 1;
	return [...results.values()].sort((first, second) => compareMutationCandidates(first.candidate, second.candidate))
		.map(({ candidate, rollCount }) => ({ name: candidate.name, probability: rollCount / totalRolls, rollCount, totalRolls }));
}

function eligibleMutationChildren(pals) {
	return pals.filter(pal =>
		!pal.hidden && pal.breeding?.ignoreCombi === false && Number.isFinite(pal.breeding?.rank),
	);
}

function mutationCandidateRankRanges(candidates) {
	const winnersByRank = new Map();
	for (const candidate of candidates) {
		const current = winnersByRank.get(candidate.breeding.rank);
		if (!current || compareMutationCandidates(candidate, current) < 0) {
			winnersByRank.set(candidate.breeding.rank, candidate);
		}
	}
	const winners = [...winnersByRank.values()].sort((first, second) => first.breeding.rank - second.breeding.rank);
	return new Map(winners.map((candidate, index) => {
		const previous = winners[index - 1];
		const next = winners[index + 1];
		let minimum = Number.NEGATIVE_INFINITY;
		let maximum = Number.POSITIVE_INFINITY;
		if (previous) {
			const sum = previous.breeding.rank + candidate.breeding.rank;
			const winsTie = sum % 2 === 0 && compareMutationCandidates(candidate, previous) < 0;
			minimum = Math.floor(sum / 2) + (winsTie ? 0 : 1);
		}
		if (next) {
			const sum = candidate.breeding.rank + next.breeding.rank;
			const losesTie = sum % 2 === 0 && compareMutationCandidates(candidate, next) > 0;
			maximum = Math.floor(sum / 2) - (losesTie ? 1 : 0);
		}
		return [candidate.name, { maximum, minimum }];
	}));
}

module.exports = {
	MUTATION_RANDOM_COEFFICIENT,
	MUTATION_RATE,
	MUTATION_RANK_COEFFICIENT,
	MUTATION_RANK_DIFFERENCE_PENALTY,
	eligibleMutationChildren,
	mutationChildrenForParents,
	mutationCandidateRankRanges,
	mutationOutcomesForParents,
	mutationRateForBonus,
	mutationTargetRange,
	nearestMutationCandidate,
};
