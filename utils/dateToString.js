function dateToString(value) {
	const dateValue = new Date(value);
	let month = dateValue.getMonth() + 1;
	month = month.toString().padStart(2, `0`);
	const day = dateValue.getDate().toString().padStart(2, `0`);
	const year = dateValue.getFullYear();
	const date = month + `/` + day + `/` + year;
	let hours = dateValue.getHours();
	const minutes = dateValue.getMinutes().toString().padStart(2, `0`);
	const ampm = hours >= 12 ? `pm` : `am`;
	hours = hours % 12;
	hours = hours ? hours : 12;
	const time = hours + `:` + minutes + ` ` + ampm;

	return `${date} at ${time}`;
}
module.exports = { dateToString };
