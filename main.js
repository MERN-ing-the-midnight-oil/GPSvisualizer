import { renderStopsTable } from "./renderStopsTable.js";

document.addEventListener("DOMContentLoaded", function () {
	const dropZone = document.getElementById("drop-zone");
	const output = document.getElementById("output");
	const thresholdInput = document.getElementById("threshold");
	const thresholdLabel = document.getElementById("threshold-label");

	let allStops = {};

	function convertTo24Hour(timeStr) {
		const [time, ampm] = timeStr.split(" ");
		let [hours, minutes] = time.split(":").map(Number);
		if (ampm === "PM" && hours < 12) hours += 12;
		if (ampm === "AM" && hours === 12) hours = 0;
		return `${String(hours).padStart(
			2,
			"0"
		)}:${String(minutes).padStart(2, "0")}:00`;
	}

	function parseEventDateTime(eventDateRaw, createdOnRaw) {
		try {
			let dateStr;
			if (typeof eventDateRaw === "number") {
				const excelEpoch = new Date(1899, 11, 30);
				const ms = eventDateRaw * 24 * 60 * 60 * 1000;
				const jsDate = new Date(excelEpoch.getTime() + ms);
				dateStr = jsDate.toISOString().split("T")[0];
			} else {
				const jsDate = new Date(eventDateRaw);
				if (isNaN(jsDate)) return null;
				dateStr = jsDate.toISOString().split("T")[0];
			}

			let hours = 0,
				minutes = 0;
			if (typeof createdOnRaw === "number") {
				const totalSeconds = Math.floor(86400 * (createdOnRaw % 1));
				hours = Math.floor(totalSeconds / 3600);
				minutes = Math.floor((totalSeconds % 3600) / 60);
			} else if (typeof createdOnRaw === "string") {
				const match = createdOnRaw.match(/(\d{1,2}):(\d{2})\s?(AM|PM)?/i);
				if (!match) return null;
				hours = parseInt(match[1], 10);
				minutes = parseInt(match[2], 10);
				const ampm = match[3];
				if (ampm) {
					if (ampm.toUpperCase() === "PM" && hours < 12) hours += 12;
					if (ampm.toUpperCase() === "AM" && hours === 12) hours = 0;
				}
			} else {
				return null;
			}

			const numericTime = hours * 3600 + minutes * 60;
			const timeStr = `${hours % 12 || 12}:${String(minutes).padStart(
				2,
				"0"
			)} ${hours >= 12 ? "PM" : "AM"}`;
			return { dateStr, timeStr, numericTime };
		} catch {
			return null;
		}
	}

	dropZone.addEventListener("dragover", (e) => e.preventDefault());

	dropZone.addEventListener("drop", (e) => {
		e.preventDefault();
		const file = e.dataTransfer.files[0];
		if (!file || !file.name.endsWith(".xlsx"))
			return alert("Please drop a valid .xlsx file");

		const reader = new FileReader();
		reader.onload = (e) => {
			const data = new Uint8Array(e.target.result);
			const workbook = XLSX.read(data, { type: "array" });
			const sheet = workbook.Sheets[workbook.SheetNames[0]];
			const rows = XLSX.utils.sheet_to_json(sheet);

			const grouped = {};
			const dailyEvents = {};

			rows.forEach((row) => {
				const location = row["Location"]?.trim();
				if (row["Event"]?.toLowerCase().includes("door open") && location) {
					const time = parseEventDateTime(row["Event Date"], row["Created On"]);
					if (!time) return;

					const fullDate = new Date(
						`${time.dateStr}T${convertTo24Hour(time.timeStr)}`
					);
					if (fullDate.getDay() === 4) return;

					if (!dailyEvents[time.dateStr]) dailyEvents[time.dateStr] = [];
					const dayName = fullDate.toLocaleDateString("en-US", {
						weekday: "long",
					});
					dailyEvents[time.dateStr].push({ location, time, fullDate, dayName });
				}
			});

			Object.values(dailyEvents).forEach((dayRows) => {
				const sorted = dayRows.sort((a, b) => a.fullDate - b.fullDate);
				let startIncluding = false;
				for (const { location, time, dayName } of sorted) {
					if (location === "0 Bus Garage Parking Lot") {
						startIncluding = true;
						continue;
					}
					if (!startIncluding) continue;

					const isPM = time.numericTime >= 12 * 3600;
					const groupKey = `${location} – ${isPM ? "PM" : "AM"}`;
					if (!grouped[groupKey]) grouped[groupKey] = [];

					grouped[groupKey].push({ ...time, location, dayName });
				}
			});

			allStops = grouped;
			renderStopsTable(grouped, parseInt(thresholdInput.value, 10));
		};
		reader.readAsArrayBuffer(file);
	});

	thresholdInput.addEventListener("input", () => {
		const threshold = parseInt(thresholdInput.value, 10);
		thresholdLabel.textContent = threshold;
		renderStopsTable(allStops, threshold);
	});
});
