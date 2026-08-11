// Replaces a Discord interaction message without retaining images from its prior card or map view.
async function replaceInteractionMessage(interaction, payload) {
	// Discord retains prior attachments during edits unless they are explicitly cleared before replacement files are uploaded.
	await interaction.update({ ...payload, attachments: [] });
}

module.exports = { replaceInteractionMessage };
