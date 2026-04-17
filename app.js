const rowsBody = document.getElementById("rowsBody");
const statusEl = document.getElementById("status");
const refreshBtn = document.getElementById("refreshBtn");

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

refreshBtn.addEventListener("click", loadRows);
window.addEventListener("DOMContentLoaded", loadRows);
