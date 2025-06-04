export function renderStopsTable(grouped, thresholdMinutes = 5) {
	const output = document.getElementById("output");
	output.innerHTML = "";

	const allDatesSet = new Set();
	for (const times of Object.values(grouped)) {
		times.forEach((t) => allDatesSet.add(t.dateStr));
	}
	const allDates = Array.from(allDatesSet).sort();

	const stopTimeMap = {};
	for (const [stop, times] of Object.entries(grouped)) {
		stopTimeMap[stop] = {};
		times.forEach((t) => {
			stopTimeMap[stop][t.dateStr] = t;
		});
	}

	const stopAvgMap = Object.entries(stopTimeMap).map(([stop, dateMap]) => {
		const values = Object.values(dateMap)
			.map((t) => t.numericTime)
			.filter((n) => !isNaN(n));
		const avg =
			values.reduce((sum, val) => sum + val, 0) / Math.max(values.length, 1);
		return { stop, avg };
	});
	stopAvgMap.sort((a, b) => a.avg - b.avg);
	const sortedStops = stopAvgMap.map((entry) => entry.stop);

	const stopMedians = {};
	sortedStops.forEach((stop) => {
		const times = Object.values(stopTimeMap[stop])
			.map((t) => t.numericTime)
			.filter((n) => !isNaN(n))
			.sort((a, b) => a - b);
		const len = times.length;
		stopMedians[stop] =
			len % 2 === 1
				? times[Math.floor(len / 2)]
				: (times[len / 2 - 1] + times[len / 2]) / 2;
	});

	const table = document.createElement("table");
	table.className = "stop-table";

	const headerRow = document.createElement("tr");
	headerRow.innerHTML =
		`<th>Date</th>` + sortedStops.map((stop) => `<th>${stop}</th>`).join("");
	table.appendChild(headerRow);

	allDates.forEach((date) => {
		const row = document.createElement("tr");
		const cells = [`<td><strong>${date}</strong></td>`];

		sortedStops.forEach((stop) => {
			const timeObj = stopTimeMap[stop][date];
			if (!timeObj) {
				cells.push("<td></td>");
			} else {
				const deviation =
					Math.abs(timeObj.numericTime - stopMedians[stop]) / 60;
				const isOutlier = deviation > thresholdMinutes;
				cells.push(
					`<td class="${isOutlier ? "outlier" : ""}">${timeObj.timeStr}</td>`
				);
			}
		});
		row.innerHTML = cells.join("");
		table.appendChild(row);
	});

	const avgRow = document.createElement("tr");
	const avgCells = [`<td><strong>Average</strong></td>`];
	sortedStops.forEach((stop) => {
		const times = Object.values(stopTimeMap[stop])
			.map((t) => t.numericTime)
			.filter((n) => !isNaN(n));
		if (times.length === 0) {
			avgCells.push("<td></td>");
		} else {
			const avg = times.reduce((sum, val) => sum + val, 0) / times.length;
			const h = Math.floor(avg / 3600);
			const m = Math.floor((avg % 3600) / 60);
			const h12 = h % 12 || 12;
			const ampm = h >= 12 ? "PM" : "AM";
			const formatted = `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
			avgCells.push(`<td><strong>${formatted}</strong></td>`);
		}
	});
	avgRow.innerHTML = avgCells.join("");
	avgRow.classList.add("average-row");

	// Insert just after the header row (which is the first child of the table)
	if (table.children.length > 1) {
		table.insertBefore(avgRow, table.children[1]);
	} else {
		table.appendChild(avgRow);
	}

	output.appendChild(table);
}
