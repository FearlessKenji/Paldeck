function decodeHtml(value) {
	return String(value || ``)
		.replace(/&quot;/g, `"`)
		.replace(/&#039;/g, `'`)
		.replace(/&lt;/g, `<`)
		.replace(/&gt;/g, `>`)
		// Decode ampersands last so `&amp;lt;` stays text instead of becoming a tag.
		.replace(/&amp;/g, `&`);
}

function removeTagsOnce(value, replacement = ``) {
	let result = ``;
	let insideTag = false;

	for (const character of String(value || ``)) {
		if (character === `<`) {
			insideTag = true;
			continue;
		}

		if (character === `>` && insideTag) {
			insideTag = false;
			result += replacement;
			continue;
		}

		if (!insideTag) {
			result += character;
		}
	}

	return result;
}

function stripTags(value, replacement = ``) {
	let text = decodeHtml(value);
	let previous = null;

	while (text !== previous) {
		previous = text;
		text = removeTagsOnce(text, replacement);
	}

	return text
		.replace(/[<>]/g, ``)
		.trim();
}

module.exports = {
	decodeHtml,
	stripTags,
};
