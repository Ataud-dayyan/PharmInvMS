let patientsLookup = [];
let drugsLookup = [];
let rowCounter = 0;

document.addEventListener("DOMContentLoaded", async function () {
    const rawRole = localStorage.getItem("user_role") || "";
    const role = rawRole.trim().toLowerCase();
    const token = localStorage.getItem("jwt_token");

    if (!token || role !== "doctor") {
        alert("Access Denied: Doctor clearance required.");
        localStorage.clear();
        window.location.href = "index.html";
        return;
    }

    document.getElementById("welcomeText").innerText = `Logged in: ${localStorage.getItem("user_name") || "Doctor"}`;

    await loadSelectionLookups();
    loadIssuedLogs();

    // Initialize first row
    addMedicationRow();

    const form = document.getElementById("prescriptionForm");
    if (form) form.addEventListener("submit", handlePrescriptionSubmit);

    // Patient dynamic ID binding
    const patientSearchInput = document.getElementById("patientSearch");
    if (patientSearchInput) {
        patientSearchInput.addEventListener("input", function (e) {
            const selected = patientsLookup.find(p => p.displayName.toLowerCase() === e.target.value.trim().toLowerCase());
            document.getElementById("patientId").value = selected ? selected.id : "";
        });
    }
});

// Load Patients and Drugs lists for autocomplete
async function loadSelectionLookups() {
    try {
        const [patientsRes, drugsRes] = await Promise.all([
            fetchWithAuth("/users?role=Patient&pageSize=100"),
            fetchWithAuth("/drugs?pageSize=100")
        ]);

        if (patientsRes && patientsRes.ok) {
            const data = await patientsRes.json();
            const list = data.items || data.data || (Array.isArray(data) ? data : []);

            patientsLookup = list.map(p => {
                const name = (p.firstName || p.lastName)
                    ? `${p.firstName || ''} ${p.lastName || ''}`.trim()
                    : (p.fullName || p.email.split('@')[0]);
                return {
                    id: p.id,
                    displayName: `${name} (${p.email})`
                };
            });

            const pDatalist = document.getElementById("patientOptions");
            if (pDatalist) {
                pDatalist.innerHTML = patientsLookup
                    .map(p => `<option value="${p.displayName}"></option>`)
                    .join("");
            }
        }

        if (drugsRes && drugsRes.ok) {
            const data = await drugsRes.json();
            const dList = data.items || data.data || (Array.isArray(data) ? data : []);

            drugsLookup = dList.map(d => ({
                id: d.id,
                displayName: `${d.name} [Stock: ${d.stockQuantity}]`
            }));

            const dDatalist = document.getElementById("drugOptions");
            if (dDatalist) {
                dDatalist.innerHTML = drugsLookup
                    .map(d => `<option value="${d.displayName}"></option>`)
                    .join("");
            }
        }
    } catch (err) {
        console.error("Failed to load lookup data for dropdowns:", err);
    }
}

// Add dynamic medication row
function addMedicationRow() {
    const container = document.getElementById("medicationRowsContainer");
    if (!container) return;

    const rowId = `drug-row-${rowCounter++}`;
    const rowDiv = document.createElement("div");
    rowDiv.id = rowId;
    rowDiv.className = "medication-item-row";
    rowDiv.style.cssText = "display: flex; gap: 10px; margin-bottom: 10px; align-items: center;";

    rowDiv.innerHTML = `
        <input type="hidden" class="item-drug-id" />
        <input type="text" list="drugOptions" class="item-drug-search" placeholder="Type drug name to search..." style="flex: 2; padding: 8px; border: 1px solid #ccc; border-radius: 4px;" required />
        <input type="number" class="item-qty" min="1" value="1" placeholder="Qty" style="width: 70px; padding: 8px; border: 1px solid #ccc; border-radius: 4px;" required />
        <input type="text" class="item-instructions" placeholder="Dosage e.g., 2x daily" style="flex: 2; padding: 8px; border: 1px solid #ccc; border-radius: 4px;" required />
        <button type="button" style="background: #ff4757; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer;" onclick="removeMedicationRow('${rowId}')">✕</button>
    `;

    container.appendChild(rowDiv);

    // Bind datalist lookup to this row's hidden ID input
    const searchInput = rowDiv.querySelector(".item-drug-search");
    const hiddenIdInput = rowDiv.querySelector(".item-drug-id");

    searchInput.addEventListener("input", function (e) {
        const selected = drugsLookup.find(
            d => d.displayName.toLowerCase() === e.target.value.trim().toLowerCase()
        );
        hiddenIdInput.value = selected ? selected.id : "";
    });
}

// Remove medication row
function removeMedicationRow(rowId) {
    const container = document.getElementById("medicationRowsContainer");
    if (container && container.children.length > 1) {
        document.getElementById(rowId).remove();
    } else {
        alert("A prescription must include at least one medication.");
    }
}

// Handle submit with all medication items
async function handlePrescriptionSubmit(e) {
    e.preventDefault();

    const patientId = document.getElementById("patientId").value.trim();
    if (!patientId) {
        alert("Please select a valid patient from the dropdown list.");
        return;
    }

    const rowElements = document.querySelectorAll("#medicationRowsContainer .medication-item-row");
    const items = [];

    for (const row of rowElements) {
        const drugId = row.querySelector(".item-drug-id").value.trim();
        const drugSearch = row.querySelector(".item-drug-search").value.trim();
        const quantity = parseInt(row.querySelector(".item-qty").value, 10);
        const instructions = row.querySelector(".item-instructions").value.trim();

        if (!drugId) {
            alert(`Please select a valid medication from the dropdown for: "${drugSearch || 'unselected item'}"`);
            return;
        }

        items.push({
            drugId: drugId,
            quantity: quantity,
            instructions: instructions
        });
    }

    if (items.length === 0) {
        alert("Please add at least one medication item.");
        return;
    }

    const notes = document.getElementById("prescriptionNotes") ? document.getElementById("prescriptionNotes").value : "";
    const doctorId = localStorage.getItem("user_id") || "00000000-0000-0000-0000-000000000000";

    const payload = {
        patientId: patientId,
        doctorId: doctorId,
        notes: notes,
        items: items
    };

    try {
        const response = await fetchWithAuth("/prescriptions", {
            method: "POST",
            body: JSON.stringify(payload)
        });

        if (response && response.ok) {
            alert("✅ Prescription authorized and sent to pharmacy!");
            
            // Reset form
            document.getElementById("prescriptionForm").reset();
            document.getElementById("patientId").value = "";

            // Reset medication rows back to single empty row
            const container = document.getElementById("medicationRowsContainer");
            container.innerHTML = "";
            rowCounter = 0;
            addMedicationRow();

            loadIssuedLogs();
        } else {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.message || `Server returned HTTP ${response.status}`);
        }
    } catch (error) {
        console.error(error);
        alert(`Error transmitting prescription: ${error.message}`);
    }
}

async function loadIssuedLogs() {
    const container = document.getElementById("doctorLogContainer");
    if (!container) return;

    try {
        const doctorId = localStorage.getItem("user_id");
        const response = await fetchWithAuth(`/prescriptions/doctor/${doctorId}`);
        container.innerHTML = "";

        if (response && response.ok) {
            const logs = await response.json();
            const logList = Array.isArray(logs) ? logs : (logs.items || []);

            if (logList.length === 0) {
                container.innerHTML = `<p style="color: #666; text-align: center;">No active diagnostic transmission records generated yet.</p>`;
                return;
            }

            logList.forEach(log => {
                container.innerHTML += `
                    <div style="background: #f8f9fa; padding: 12px; margin-bottom: 10px; border-left: 4px solid #512BD4; border-radius: 4px;">
                        <p style="margin: 0; font-weight: 600; color: #333;">Order ID: ${log.id}</p>
                        <small style="color: #666;">Status: ${log.status} | Date: ${new Date(log.createdAt).toLocaleDateString()}</small>
                    </div>`;
            });
        } else {
            container.innerHTML = `<p style="color: #666; text-align: center;">No active diagnostic transmission records generated yet.</p>`;
        }
    } catch (error) {
        container.innerHTML = `<p style="color: #ff4757;">Error pulling down activity logs.</p>`;
    }
}