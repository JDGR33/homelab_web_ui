const rowsBody = document.getElementById("rowsBody");
const statusEl = document.getElementById("status");
const refreshBtn = document.getElementById("refreshBtn");
const chartStatusEl = document.getElementById("chartStatus");
const currencyChartEl = document.getElementById("currencyChart");

function parseNumeric(value) {
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : NaN;
    }

    if (typeof value === "string") {
        const raw = value.trim().replace(/\s+/g, "");
        if (!raw) {
            return NaN;
        }

        const hasComma = raw.includes(",");
        const hasDot = raw.includes(".");
        let normalized = raw;

        if (hasComma && hasDot) {
            const lastComma = raw.lastIndexOf(",");
            const lastDot = raw.lastIndexOf(".");
            // Use the last separator as decimal mark and strip the other as thousands marks.
            if (lastComma > lastDot) {
                normalized = raw.replace(/\./g, "").replace(",", ".");
            } else {
                normalized = raw.replace(/,/g, "");
            }
        } else if (hasComma) {
            normalized = raw.replace(/,/g, ".");
        }

        const numeric = Number(normalized);
        return Number.isFinite(numeric) ? numeric : NaN;
    }

    return NaN;
}

function parseTimestampValue(value) {
    if (typeof value === "number") {
        // Handle Unix timestamps in seconds as well as milliseconds.
        return value > 1e12 ? value : value * 1000;
    }

    if (value instanceof Date) {
        return value.getTime();
    }

    if (typeof value === "string") {
        const dateFromString = new Date(value).getTime();
        if (Number.isFinite(dateFromString)) {
            return dateFromString;
        }

        // Some API rows include microseconds (e.g. 2026-04-18T16:00:38.064940),
        // which many JS engines do not parse reliably. Keep milliseconds only.
        const normalizedIso = value.replace(
            /(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2})\.(\d{4,})(Z|[+-]\d{2}:?\d{2})?$/,
            (_, base, fraction, tz = "") => `${base}.${fraction.slice(0, 3)}${tz}`
        );
        if (normalizedIso !== value) {
            const dateFromNormalizedIso = new Date(normalizedIso).getTime();
            if (Number.isFinite(dateFromNormalizedIso)) {
                return dateFromNormalizedIso;
            }
        }

        const dmyMatch = value.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
        if (dmyMatch) {
            const [, d, m, yRaw, hh = "0", mm = "0", ss = "0"] = dmyMatch;
            const year = yRaw.length === 2 ? Number(`20${yRaw}`) : Number(yRaw);
            const parsed = new Date(
                Date.UTC(
                    year,
                    Number(m) - 1,
                    Number(d),
                    Number(hh),
                    Number(mm),
                    Number(ss)
                )
            ).getTime();
            if (Number.isFinite(parsed)) {
                return parsed;
            }
        }

        const asNumber = Number(value);
        if (Number.isFinite(asNumber)) {
            return asNumber > 1e12 ? asNumber : asNumber * 1000;
        }
    }

    return NaN;
}

function seriesObjectToRows(obj) {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
        return [];
    }

    const entries = Object.entries(obj)
        .map(([key, value]) => ({
            date: key,
            rate: value,
            parsedDate: parseTimestampValue(key),
            parsedRate: parseNumeric(value),
        }))
        .filter((item) => Number.isFinite(item.parsedDate) && Number.isFinite(item.parsedRate));

    if (entries.length < 2) {
        return [];
    }

    return entries.map((item) => ({
        date: item.date,
        rate: item.rate,
    }));
}

function extractRowsFromPayload(payload) {
    if (Array.isArray(payload)) {
        return payload;
    }

    if (!payload || typeof payload !== "object") {
        return [];
    }

    const directCandidates = [
        payload.rows,
        payload.data,
        payload.items,
        payload.results,
        payload.records,
        payload.rates,
        payload.values,
        payload.history,
    ];

    for (const candidate of directCandidates) {
        if (Array.isArray(candidate)) {
            return candidate;
        }
    }

    for (const candidate of directCandidates) {
        if (candidate && typeof candidate === "object") {
            const mappedRows = seriesObjectToRows(candidate);
            if (mappedRows.length > 0) {
                return mappedRows;
            }

            const nested = extractRowsFromPayload(candidate);
            if (nested.length > 0) {
                return nested;
            }
        }
    }

    for (const value of Object.values(payload)) {
        if (Array.isArray(value)) {
            return value;
        }
    }

    for (const value of Object.values(payload)) {
        if (value && typeof value === "object") {
            const mappedRows = seriesObjectToRows(value);
            if (mappedRows.length > 0) {
                return mappedRows;
            }

            const nested = extractRowsFromPayload(value);
            if (nested.length > 0) {
                return nested;
            }
        }
    }

    return [];
}

function parseCurrencyRows(rows) {
    return (rows || [])
        .map((row) => ({
            rate: parseNumeric(
                row.rate ??
                row.value ??
                row.exchange_rate ??
                row.price ??
                row.bid ??
                row.ask ??
                row.sell ??
                row.buy
            ),
            timestamp: parseTimestampValue(
                row.scraped_at ??
                row.scrapedAt ??
                row.timestamp ??
                row.date ??
                row.created_at ??
                row.createdAt ??
                row.updated_at ??
                row.updatedAt ??
                row.time
            ),
        }))
        .filter((row) => Number.isFinite(row.rate) && Number.isFinite(row.timestamp))
        .sort((a, b) => a.timestamp - b.timestamp);
}

function buildPath(points, xScale, yScale) {
    if (points.length === 0) {
        return "";
    }

    return points
        .map((point, idx) => `${idx === 0 ? "M" : "L"} ${xScale(point.timestamp)} ${yScale(point.rate)}`)
        .join(" ");
}

function renderCurrencyLinePlot(eurRows, usdRows) {
    if (!currencyChartEl) {
        return;
    }

    const allRows = [...eurRows, ...usdRows];
    if (allRows.length === 0) {
        currencyChartEl.innerHTML = '<text x="50%" y="50%" text-anchor="middle" class="chart-label">No data to plot.</text>';
        return;
    }

    const width = 900;
    const height = 340;
    const pad = { top: 20, right: 20, bottom: 44, left: 58 };

    const minX = Math.min(...allRows.map((point) => point.timestamp));
    const maxX = Math.max(...allRows.map((point) => point.timestamp));
    const minYRaw = Math.min(...allRows.map((point) => point.rate));
    const maxYRaw = Math.max(...allRows.map((point) => point.rate));

    const yRange = Math.max(maxYRaw - minYRaw, 0.0001);
    const minY = minYRaw - yRange * 0.08;
    const maxY = maxYRaw + yRange * 0.08;
    const safeXRange = Math.max(maxX - minX, 1);
    const plotWidth = width - pad.left - pad.right;
    const plotHeight = height - pad.top - pad.bottom;

    const xScale = (value) => pad.left + ((value - minX) / safeXRange) * plotWidth;
    const yScale = (value) => pad.top + ((maxY - value) / Math.max(maxY - minY, 0.0001)) * plotHeight;

    const yTicks = 5;
    const xTicks = 5;

    const yTickSvg = Array.from({ length: yTicks + 1 }, (_, idx) => {
        const ratio = idx / yTicks;
        const value = maxY - (maxY - minY) * ratio;
        const y = pad.top + plotHeight * ratio;
        return `
      <line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" class="chart-grid" />
      <text x="${pad.left - 10}" y="${y + 4}" text-anchor="end" class="chart-label">${value.toFixed(2)}</text>
    `;
    }).join("");

    const xTickSvg = Array.from({ length: xTicks + 1 }, (_, idx) => {
        const ratio = idx / xTicks;
        const value = minX + safeXRange * ratio;
        const x = pad.left + plotWidth * ratio;
        const dateLabel = new Date(value).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
        });

        return `
      <line x1="${x}" y1="${pad.top}" x2="${x}" y2="${height - pad.bottom}" class="chart-grid" />
      <text x="${x}" y="${height - pad.bottom + 18}" text-anchor="middle" class="chart-label">${dateLabel}</text>
    `;
    }).join("");

    const eurPath = buildPath(eurRows, xScale, yScale);
    const usdPath = buildPath(usdRows, xScale, yScale);

    currencyChartEl.innerHTML = `
    <line x1="${pad.left}" y1="${height - pad.bottom}" x2="${width - pad.right}" y2="${height - pad.bottom}" class="chart-axis" />
    <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${height - pad.bottom}" class="chart-axis" />
    ${yTickSvg}
    ${xTickSvg}
    ${eurPath ? `<path d="${eurPath}" class="chart-line eur" />` : ""}
    ${usdPath ? `<path d="${usdPath}" class="chart-line usd" />` : ""}
  `;
}

function renderCurrencyHistory(eurRows, usdRows) {
    if (!chartStatusEl) {
        return;
    }

    const eur = parseCurrencyRows(eurRows);
    const usd = parseCurrencyRows(usdRows);
    const totalRows = eur.length + usd.length;

    if (totalRows === 0) {
        if (currencyChartEl) {
            currencyChartEl.innerHTML = '<text x="50%" y="50%" text-anchor="middle" class="chart-label">No 4-month currency data found.</text>';
        }
        chartStatusEl.textContent = `No data (raw EUR: ${eurRows.length}, raw USD: ${usdRows.length})`;
        return;
    }

    renderCurrencyLinePlot(eur, usd);

    chartStatusEl.textContent = `Loaded plot (EUR: ${eur.length}, USD: ${usd.length})`;
}

async function fetchFirstOkJson(urls) {
    let lastError = null;

    for (const url of urls) {
        try {
            const response = await fetch(url, {
                headers: { Accept: "application/json" },
            });

            if (!response.ok) {
                lastError = new Error(`Request failed (${response.status}) at ${url}`);
                continue;
            }

            return await response.json();
        } catch (error) {
            lastError = error;
        }
    }

    throw lastError ?? new Error("No endpoint responded");
}

async function loadCurrencyChart() {
    if (!chartStatusEl || !currencyChartEl) {
        return;
    }

    chartStatusEl.textContent = "Loading 4-month plot...";
    currencyChartEl.innerHTML = '<text x="50%" y="50%" text-anchor="middle" class="chart-label">Loading plot...</text>';

    try {
        const [eurPayload, usdPayload] = await Promise.all([
            fetchFirstOkJson([
                "/api/currency-rates/last-four-months/euro",
                "/api/currency-rates/last-four-months/eur",
            ]),
            fetchFirstOkJson([
                "/api/currency-rates/last-four-months/dolar",
                "/api/currency-rates/last-four-months/dollar",
                "/api/currency-rates/last-four-months/usd",
            ]),
        ]);
        const eurRows = extractRowsFromPayload(eurPayload);
        const usdRows = extractRowsFromPayload(usdPayload);

        renderCurrencyHistory(eurRows, usdRows);
    } catch (error) {
        currencyChartEl.innerHTML = `<text x="50%" y="50%" text-anchor="middle" class="chart-label">${error.message}</text>`;
        chartStatusEl.textContent = "Plot error";
    }
}

async function loadRows() {
    statusEl.textContent = "Loading...";
    refreshBtn.disabled = true;

    try {
        const response = await fetch("/api/currency-rates/first-five", {
            headers: { Accept: "application/json" },
        });

        if (!response.ok) {
            throw new Error(`Request failed (${response.status})`);
        }

        const payload = await response.json();
        const rows = payload.rows || [];

        rowsBody.innerHTML = "";

        if (rows.length === 0) {
            rowsBody.innerHTML = '<tr><td class="empty" colspan="4">No rows found.</td></tr>';
            statusEl.textContent = "No data";
            return;
        }

        for (const row of rows) {
            const tr = document.createElement("tr");
            tr.innerHTML = `
        <td>${row.id ?? ""}</td>
        <td>${row.currency ?? ""}</td>
        <td>${row.rate ?? ""}</td>
        <td>${row.scraped_at ?? ""}</td>
      `;
            rowsBody.appendChild(tr);
        }

        statusEl.textContent = `Loaded ${rows.length} row(s)`;
    } catch (error) {
        rowsBody.innerHTML = `<tr><td class="error" colspan="4">${error.message}</td></tr>`;
        statusEl.textContent = "Error";
    } finally {
        refreshBtn.disabled = false;
    }
}

async function refreshAll() {
    await Promise.all([loadRows(), loadCurrencyChart()]);
}

refreshBtn.addEventListener("click", refreshAll);
window.addEventListener("DOMContentLoaded", refreshAll);
