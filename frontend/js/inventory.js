document.addEventListener("DOMContentLoaded", function () {
    const rawRole = localStorage.getItem("user_role") || "";
    const role = rawRole.trim().toLowerCase();
    const token = localStorage.getItem("jwt_token");

    if (!token || (role !== "pharmacist" && role !== "admin")) {
        alert("Access Denied: Pharmacist credentials required.");
        localStorage.clear();
        window.location.href = "index.html"; 
        return;
    }

    const userName = localStorage.getItem("user_name") || "Pharmacist";
    document.getElementById("welcomeText").innerText = `Logged in: ${userName}`;

    loadInventoryData();
    loadStockAlerts();
    loadPendingPrescriptions();

    const addForm = document.getElementById("addDrugForm");
    if (addForm) addForm.addEventListener("submit", handleCreateDrug);

    const restockForm = document.getElementById("restockForm");
    if (restockForm) restockForm.addEventListener("submit", handleRestock);
});

// 1. FETCH INVENTORY
async function loadInventoryData() {
    try {
        const response = await fetchWithAuth("/drugs");
        if (!response.ok) throw new Error("Failed to pull down stock ledger.");

        const payload = await response.json();
        const drugList = payload.items || payload.data || (Array.isArray(payload) ? payload : []);

        const tbody = document.getElementById("inventoryTableBody");
        tbody.innerHTML = ""; 

        if (drugList.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align: center;">No drugs registered in the database.</td></tr>`;
            return;
        }

        drugList.forEach(item => {
            const id = item.id || "";
            const drugName = item.name || "Unknown Item";
            const category = item.description || "General";
            const quantity = item.stockQuantity !== undefined ? item.stockQuantity : 0;
            const expiry = item.expiryDate ? new Date(item.expiryDate).toLocaleDateString() : "N/A";

            const row = `
                <tr>
                    <td><strong>${drugName}</strong></td>
                    <td>${category}</td>
                    <td><strong>${quantity}</strong> units</td>
                    <td>${expiry}</td>
                    <td style="text-align: center;">
                        <button class="btn-sm btn-patch" onclick="openRestockModal('${id}', '${drugName}', ${quantity})">Update Stock</button>
                        <button class="btn-sm btn-delete" onclick="deleteDrug('${id}', '${drugName}')">Delete</button>
                    </td>
                </tr>
            `;
            tbody.innerHTML += row;
        });

    } catch (error) {
        console.error("Inventory Fetch Error:", error);
        document.getElementById("inventoryTableBody").innerHTML = 
            `<tr><td colspan="5" style="text-align: center; color: #ff4757;">Error loading data: ${error.message}</td></tr>`;
    }
}

// 2. FETCH LOW STOCK ALERTS
async function loadStockAlerts() {
    try {
        const response = await fetchWithAuth("/drugs/low-stock");
        if (!response.ok) throw new Error("Failed to process stock alerts.");

        const alerts = await response.json();
        const alertList = alerts.items || alerts.data || (Array.isArray(alerts) ? alerts : []);
        const container = document.getElementById("alertsContainer");
        container.innerHTML = ""; 

        if (alertList.length === 0) {
            container.innerHTML = `<p style="color: #2ed573; font-weight: 600;">✅ All stock levels are within safe limits.</p>`;
            return;
        }

        alertList.forEach(alertItem => {
            const drugName = alertItem.name || "Item";
            const qty = alertItem.stockQuantity !== undefined ? alertItem.stockQuantity : 0;
            
            container.innerHTML += `
                <div style="background: white; padding: 10px; margin-bottom: 10px; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                    <span style="background-color: #ffe0e3; color: #ff4757; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: bold;">LOW STOCK</span>
                    <p style="margin: 5px 0 0 0; font-weight: 600; color: #333;">${drugName}</p>
                    <small style="color: #666;">Only <strong>${qty}</strong> left in storage.</small>
                </div>
            `;
        });

    } catch (error) {
        console.error("Alerts Fetch Error:", error);
        document.getElementById("alertsContainer").innerHTML = `<p style="color: #ff4757;">Failed to look up alerts.</p>`;
    }
}

// 3. CREATE DRUG
async function handleCreateDrug(e) {
    e.preventDefault();

    const rawExpiry = document.getElementById("addExpiry").value;
    const formattedExpiry = rawExpiry ? new Date(rawExpiry).toISOString() : new Date().toISOString();

    const payload = {
        name: document.getElementById("addName").value.trim(),
        description: document.getElementById("addDesc").value.trim(),
        price: parseFloat(document.getElementById("addPrice").value) || 0,
        stockQuantity: parseInt(document.getElementById("addQty").value) || 0,
        minimumStockLevel: parseInt(document.getElementById("addMin").value) || 5,
        expiryDate: formattedExpiry,
        supplier: "Main Pharmacy Supplier"
    };

    try {
        const response = await fetchWithAuth("/drugs", {
            method: "POST",
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.message || `Server returned HTTP ${response.status}`);
        }

        alert("✅ Success: Drug added to database!");
        closeAddModal();
        document.getElementById("addDrugForm").reset();
        loadInventoryData();
        loadStockAlerts();

    } catch (error) {
        console.error("Create Drug Error:", error);
        alert(`Failed to add drug: ${error.message}`);
    }
}

// 4. RESTOCK / UPDATE STOCK
async function handleRestock(e) {
    e.preventDefault();

    const drugId = document.getElementById("restockDrugId").value.trim();
    const newQuantity = parseInt(document.getElementById("restockQty").value, 10);

    if (!drugId) {
        alert("Error: Missing Drug GUID identifier.");
        return;
    }

    // Retrieve user GUID or extract from stored JWT token payload
    let loggedInUserId = localStorage.getItem("user_id") || localStorage.getItem("userId");

    if (!loggedInUserId || loggedInUserId === "00000000-0000-0000-0000-000000000000") {
        const token = localStorage.getItem("jwt_token");
        if (token) {
            try {
                const base64Url = token.split('.')[1];
                const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
                const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => 
                    '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
                ).join(''));
                const decoded = JSON.parse(jsonPayload);
                loggedInUserId = decoded.nameid || decoded.sub || decoded.UserId || decoded.id;
            } catch (err) {
                console.warn("Could not decode JWT payload:", err);
            }
        }
    }

    const payload = {
        newQuantity: newQuantity,
        reason: "Routine stock update via pharmacist portal",
        updatedBy: loggedInUserId
    };

    try {
        const response = await fetchWithAuth(`/drugs/${drugId}/stock`, {
            method: "PATCH",
            body: JSON.stringify(payload)
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            console.error("Backend Stock Update Error:", data);
            throw new Error(data.message || `Server returned HTTP ${response.status}`);
        }

        alert("✅ Success: Stock balance updated!");
        closeRestockModal();
        loadInventoryData();
        loadStockAlerts();

    } catch (error) {
        console.error("Restock Exception:", error);
        alert(`Update Failed: ${error.message}`);
    }
}

// 5. DELETE DRUG
async function deleteDrug(id, name) {
    const userRole = (localStorage.getItem("user_role") || "").toLowerCase();

    if (userRole !== "admin" && userRole !== "pharmacist") {
        alert("Access Denied: Deleting drugs requires Administrator or Pharmacist clearance.");
        return;
    }

    if (!confirm(`Are you sure you want to delete ${name}?`)) return;

    try {
        const response = await fetchWithAuth(`/drugs/${id}`, {
            method: "DELETE"
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.message || `Server returned HTTP ${response.status}`);
        }

        alert(`✅ ${name} deleted successfully.`);
        loadInventoryData();
        loadStockAlerts();

    } catch (error) {
        console.error("Delete Error:", error);
        alert(`Delete Failed: ${error.message}`);
    }
}

function openAddModal() { document.getElementById("addModal").style.display = "flex"; }
function closeAddModal() { document.getElementById("addModal").style.display = "none"; }

function openRestockModal(id, name, currentQty) {
    document.getElementById("restockDrugId").value = id;
    document.getElementById("restockDrugLabel").innerText = `${name} (Current: ${currentQty})`;
    document.getElementById("restockQty").value = currentQty;
    document.getElementById("restockModal").style.display = "flex";
}
function closeRestockModal() { document.getElementById("restockModal").style.display = "none"; }

// Append this call inside your DOMContentLoaded listener in inventory.js:
// loadPendingPrescriptions();

let currentPrescriptionToFill = null;

async function loadPendingPrescriptions() {
    const tbody = document.getElementById("prescriptionsQueueBody");
    if (!tbody) return;

    try {
        const response = await fetchWithAuth("/prescriptions/pending");
        if (!response.ok) throw new Error("Could not retrieve prescription queue.");

        const data = await response.json();
        const orders = Array.isArray(data) ? data : (data.items || []);

        tbody.innerHTML = "";

        if (orders.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 15px; color: #2ed573; font-weight: 600;">No pending prescription orders in queue.</td></tr>`;
            return;
        }

        orders.forEach(order => {
            const orderId = order.id || order.prescriptionId;
            const row = `
                <tr style="border-bottom: 1px solid #eee;">
                    <td style="padding: 10px;"><strong>#${orderId.substring(0, 8)}...</strong></td>
                    <td style="padding: 10px;">${order.itemsCount || 1} item(s)</td>
                    <td style="padding: 10px;">$${(order.totalAmount || 0).toFixed(2)}</td>
                    <td style="padding: 10px;"><span style="background: #fff3cd; color: #856404; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 12px;">${order.status}</span></td>
                    <td style="padding: 10px;">${new Date(order.createdAt).toLocaleDateString()}</td>
                    <td style="padding: 10px; text-align: center;">
                        <button class="btn-sm btn-patch" onclick="openDispenseModal('${orderId}')">Dispense Order</button>
                    </td>
                </tr>
            `;
            tbody.innerHTML += row;
        });
    } catch (err) {
        console.error("Queue error:", err);
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 15px; color: #ff4757;">Failed to load queue.</td></tr>`;
    }
}

async function openDispenseModal(prescriptionId) {
    try {
        const response = await fetchWithAuth(`/prescriptions/${prescriptionId}`);
        if (!response.ok) throw new Error("Failed to load order details.");

        const order = await response.json();
        currentPrescriptionToFill = order;

        document.getElementById("dispenseModalInfo").innerText = `Order ID: ${order.id}\nPatient GUID: ${order.patientId}`;
        
        const itemsList = document.getElementById("dispenseItemsList");
        itemsList.innerHTML = order.items.map(item => `
            <div style="background: #f8f9fa; padding: 8px; margin-bottom: 6px; border-radius: 4px;">
                <strong>${item.drugName}</strong>: Qty ${item.quantityPrescribed} 
                <br><small style="color: #666;">Instructions: ${item.instructions || 'N/A'}</small>
            </div>
        `).join('');

        document.getElementById("confirmDispenseBtn").onclick = () => executeDispense(order);
        document.getElementById("dispenseModal").style.display = "flex";
    } catch (err) {
        alert(`Error opening modal: ${err.message}`);
    }
}

function closeDispenseModal() {
    document.getElementById("dispenseModal").style.display = "none";
    currentPrescriptionToFill = null;
}

async function executeDispense(order) {
    const pharmacistId = localStorage.getItem("user_id");

    const payload = {
        pharmacistId: pharmacistId,
        items: order.items.map(i => ({
            itemId: i.id,
            quantityFilled: i.quantityPrescribed
        }))
    };

    try {
        const response = await fetchWithAuth(`/prescriptions/${order.id}/fill`, {
            method: "POST",
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.message || `Server returned HTTP ${response.status}`);
        }

        alert("✅ Prescription filled! Drug stock quantities updated automatically.");
        closeDispenseModal();
        loadInventoryData();
        loadStockAlerts();
        loadPendingPrescriptions();
    } catch (err) {
        console.error("Dispense failure:", err);
        alert(`Dispense Failed: ${err.message}`);
    }
}