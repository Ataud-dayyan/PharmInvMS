let patientsLookup = [];
let drugsLookup = [];

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

    const form = document.getElementById("prescriptionForm");
    if (form) form.addEventListener("submit", handlePrescriptionSubmit);

    // Dynamic ID binding on selection
    document.getElementById("patientSearch").addEventListener("input", function (e) {
        const selected = patientsLookup.find(p => p.displayName.toLowerCase() === e.target.value.trim().toLowerCase());
        document.getElementById("patientId").value = selected ? selected.id : "";
    });

    document.querySelector(".item-drug-search").addEventListener("input", function (e) {
        const selected = drugsLookup.find(d => d.displayName.toLowerCase() === e.target.value.trim().toLowerCase());
        document.querySelector(".item-drug-id").value = selected ? selected.id : "";
    });
});

// Load Patients and Drugs lists for autocomplete
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

            // Format full name display safely
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
            pDatalist.innerHTML = patientsLookup
                .map(p => `<option value="${p.displayName}"></option>`)
                .join("");
        }

        if (drugsRes && drugsRes.ok) {
            const data = await drugsRes.json();
            const dList = data.items || data.data || (Array.isArray(data) ? data : []);

            drugsLookup = dList.map(d => ({
                id: d.id,
                displayName: `${d.name} [Stock: ${d.stockQuantity}]`
            }));

            const dDatalist = document.getElementById("drugOptions");
            dDatalist.innerHTML = drugsLookup
                .map(d => `<option value="${d.displayName}"></option>`)
                .join("");
        }
    } catch (err) {
        console.error("Failed to load lookup data for dropdowns:", err);
    }
}

async function handlePrescriptionSubmit(e) {
    e.preventDefault();

    const patientId = document.getElementById("patientId").value.trim();
    const drugId = document.querySelector(".item-drug-id").value.trim();

    if (!patientId) {
        alert("Please select a valid patient from the dropdown list.");
        return;
    }

    if (!drugId) {
        alert("Please select a valid medication from the dropdown list.");
        return;
    }

    const notes = document.getElementById("prescriptionNotes").value;
    const doctorId = localStorage.getItem("user_id") || "00000000-0000-0000-0000-000000000000";
    const quantity = parseInt(document.querySelector(".item-qty").value, 10);
    const instructions = document.querySelector(".item-instructions").value;

    const payload = {
        patientId: patientId,
        doctorId: doctorId,
        notes: notes,
        items: [
            {
                drugId: drugId,
                quantity: quantity,
                instructions: instructions
            }
        ]
    };

    try {
        const response = await fetchWithAuth("/prescriptions", {
            method: "POST",
            body: JSON.stringify(payload)
        });

        if (response && response.ok) {
            alert("✅ Prescription authorized and sent to pharmacy!");
            document.getElementById("prescriptionForm").reset();
            document.getElementById("patientId").value = "";
            document.querySelector(".item-drug-id").value = "";
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