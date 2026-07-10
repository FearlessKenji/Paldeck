const FALLBACK_COLOR = [255, 255, 255];

function normalizeElementKey(element) {
	return String(element || ``)
		.split(`,`)
		.map(part => part.trim())
		.filter(Boolean)
		.join(`, `);
}

function isRgbArray(color) {
	return Array.isArray(color) &&
		color.length === 3 &&
		color.every(channel => Number.isInteger(channel) && channel >= 0 && channel <= 255);
}

function isPackedColor(color) {
	return Number.isInteger(color) && color >= 0 && color <= 0xFFFFFF;
}

function isValidColor(color) {
	return isRgbArray(color) || isPackedColor(color);
}

function colorToHex(color) {
	if (isRgbArray(color)) {
		return color.reduce((value, channel) => (value << 8) + channel, 0);
	}

	if (isPackedColor(color)) {
		return color;
	}

	return null;
}

function colorsMatch(first, second) {
	const firstHex = colorToHex(first);
	const secondHex = colorToHex(second);

	return firstHex !== null && firstHex === secondHex;
}

function getElementColor(element, colors = {}) {
	const key = normalizeElementKey(element);
	const color = colors[key];

	return isValidColor(color) ? color : null;
}

function getPalColor(pal, colors = {}) {
	return getElementColor(pal.element, colors) ||
		(isValidColor(pal.color) ? pal.color : FALLBACK_COLOR);
}

function findPalColorProblems(pals, colors = {}) {
	return pals.flatMap(pal => {
		const expectedColor = getElementColor(pal.element, colors);

		if (!expectedColor) {
			return [{
				name: pal.name,
				number: pal.number,
				element: pal.element,
				reason: `Missing palette color`,
			}];
		}

		if (!isValidColor(pal.color)) {
			return [{
				name: pal.name,
				number: pal.number,
				element: pal.element,
				expectedColor,
				actualColor: pal.color,
				reason: `Invalid pal color`,
			}];
		}

		if (!colorsMatch(pal.color, expectedColor)) {
			return [{
				name: pal.name,
				number: pal.number,
				element: pal.element,
				expectedColor,
				actualColor: pal.color,
				reason: `Pal color does not match palette`,
			}];
		}

		return [];
	});
}

module.exports = {
	FALLBACK_COLOR,
	colorsMatch,
	findPalColorProblems,
	getElementColor,
	getPalColor,
	normalizeElementKey,
};
