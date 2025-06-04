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
					dailyEvents[time.dateStr].push({ location, time, fullDate });
				}
			});

			Object.values(dailyEvents).forEach((dayRows) => {
				const sorted = dayRows.sort((a, b) => a.fullDate - b.fullDate);
				let startIncluding = false;
				for (const { location, time } of sorted) {
					if (location === "0 Bus Garage Parking Lot") {
						startIncluding = true;
						continue;
					}
					if (!startIncluding) continue;
					const isPM = time.numericTime >= 12 * 3600;
					const groupKey = `${location} – ${isPM ? "PM" : "AM"}`;
					if (!grouped[groupKey]) grouped[groupKey] = [];
					grouped[groupKey].push(time);
				}
			});

			allStops = grouped;
			renderStops(grouped, parseInt(thresholdInput.value, 10));
		};
		reader.readAsArrayBuffer(file);
	});

	function renderStops(grouped, thresholdMinutes = 5) {
		output.innerHTML = "";

		const dates = new Set();
		const stopTimeMap = {};
		const avgTimeMap = {};

		// Build maps: stop → {date → time}, also collect dates
		for (const [key, times] of Object.entries(grouped)) {
			const stop = key.replace(/ – (AM|PM)$/, "");
			times.forEach((time) => {
				dates.add(time.dateStr);
				if (!stopTimeMap[stop]) stopTimeMap[stop] = {};
				stopTimeMap[stop][time.dateStr] = time;
			});
		}

		// Compute average numeric time per stop
		for (const stop in stopTimeMap) {
			const times = Object.values(stopTimeMap[stop]).map((t) => t.numericTime);
			const avg = times.reduce((a, b) => a + b, 0) / times.length;
			avgTimeMap[stop] = avg;
		}

		// Sort stops by average time
		const sortedStops = Object.keys(stopTimeMap).sort(
			(a, b) => avgTimeMap[a] - avgTimeMap[b]
		);

		const sortedDates = Array.from(dates).sort();

		// Build table
		const table = document.createElement("table");
		table.className = "summary-table";

		const headerRow = document.createElement("tr");
		const thEmpty = document.createElement("th");
		thEmpty.textContent = "Date";
		headerRow.appendChild(thEmpty);
		sortedStops.forEach((stop) => {
			const th = document.createElement("th");
			th.textContent = stop;
			headerRow.appendChild(th);
		});
		table.appendChild(headerRow);

		// Add data rows
		sortedDates.forEach((date) => {
			const row = document.createElement("tr");
			const dateCell = document.createElement("td");
			dateCell.textContent = date;
			row.appendChild(dateCell);

			sortedStops.forEach((stop) => {
				const td = document.createElement("td");
				const time = stopTimeMap[stop][date];
				if (time) td.textContent = time.timeStr;
				else td.textContent = ""; // leave blank
				row.appendChild(td);
			});

			table.appendChild(row);
		});

		// Add average row
		const avgRow = document.createElement("tr");
		const avgLabel = document.createElement("td");
		avgLabel.textContent = "Average";
		avgRow.appendChild(avgLabel);

		sortedStops.forEach((stop) => {
			const td = document.createElement("td");
			const avgSeconds = avgTimeMap[stop];
			const hours = Math.floor(avgSeconds / 3600);
			const minutes = Math.floor((avgSeconds % 3600) / 60);
			const formatted = `${hours % 12 || 12}:${String(minutes).padStart(
				2,
				"0"
			)} ${hours >= 12 ? "PM" : "AM"}`;
			td.textContent = formatted;
			avgRow.appendChild(td);
		});
		table.appendChild(avgRow);

		output.appendChild(table);
	}

	thresholdInput.addEventListener("input", () => {
		const threshold = parseInt(thresholdInput.value, 10);
		thresholdLabel.textContent = threshold;
		renderStops(allStops, threshold);
	});
});
