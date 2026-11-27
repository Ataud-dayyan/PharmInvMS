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

// Cache drugs in memory for modal lookups
let cachedDrugs = [];

// 1. FETCH INVENTORY
async function loadInventoryData() {
    try {
        const response = await fetchWithAuth("/drugs");
        if (!response.ok) throw new Error("Failed to pull down stock ledger.");

        const payload = await response.json();
        const drugList = payload.items || payload.data || (Array.isArray(payload) ? payload : []);
        cachedDrugs = drugList;

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
// FETCH LOW STOCK & EXPIRY ALERTS
async function loadStockAlerts() {
    try {
        const [lowStockRes, allDrugsRes] = await Promise.all([
            fetchWithAuth("/drugs/low-stock"),
            fetchWithAuth("/drugs")
        ]);

        const container = document.getElementById("alertsContainer");
        container.innerHTML = "";

        let alertCount = 0;

        // 1. Low Stock Alerts
        if (lowStockRes && lowStockRes.ok) {
            const alerts = await lowStockRes.json();
            const alertList = alerts.items || alerts.data || (Array.isArray(alerts) ? alerts : []);

            alertList.forEach(alertItem => {
                alertCount++;
                const drugName = alertItem.name || "Item";
                const qty = alertItem.stockQuantity !== undefined ? alertItem.stockQuantity : 0;
                
                container.innerHTML += `
                    <div style="background: white; padding: 10px; margin-bottom: 10px; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); border-left: 4px solid #ff4757;">
                        <span style="background-color: #ffe0e3; color: #ff4757; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: bold;">LOW STOCK</span>
                        <p style="margin: 5px 0 0 0; font-weight: 600; color: #333;">${drugName}</p>
                        <small style="color: #666;">Only <strong>${qty}</strong> left in storage.</small>
                    </div>
                `;
            });
        }

        // 2. Expiry Alerts (Expired or Expiring within 30 days)
        if (allDrugsRes && allDrugsRes.ok) {
            const drugPayload = await allDrugsRes.json();
            const allDrugs = drugPayload.items || drugPayload.data || (Array.isArray(drugPayload) ? drugPayload : []);
            
            const today = new Date();
            const thirtyDaysFromNow = new Date();
            thirtyDaysFromNow.setDate(today.getDate() + 30);

            allDrugs.forEach(drug => {
                if (!drug.expiryDate) return;
                const expDate = new Date(drug.expiryDate);

                if (expDate <= today) {
                    alertCount++;
                    container.innerHTML += `
                        <div style="background: white; padding: 10px; margin-bottom: 10px; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); border-left: 4px solid #d63031;">
                            <span style="background-color: #fab1a0; color: #d63031; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: bold;">EXPIRED</span>
                            <p style="margin: 5px 0 0 0; font-weight: 600; color: #333;">${drug.name}</p>
                            <small style="color: #d63031;">Expired on <strong>${expDate.toLocaleDateString()}</strong></small>
                        </div>
                    `;
                } else if (expDate <= thirtyDaysFromNow) {
                    alertCount++;
                    container.innerHTML += `
                        <div style="background: white; padding: 10px; margin-bottom: 10px; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); border-left: 4px solid #e17055;">
                            <span style="background-color: #ffeaa7; color: #d35400; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: bold;">EXPIRING SOON</span>
                            <p style="margin: 5px 0 0 0; font-weight: 600; color: #333;">${drug.name}</p>
                            <small style="color: #666;">Expires on <strong>${expDate.toLocaleDateString()}</strong></small>
                        </div>
                    `;
                }
            });
        }

        if (alertCount === 0) {
            container.innerHTML = `<p style="color: #2ed573; font-weight: 600;">✅ All stock levels and shelf lives are safe.</p>`;
        }

    } catch (error) {
        console.error("Alerts Fetch Error:", error);
        document.getElementById("alertsContainer").innerHTML = `<p style="color: #ff4757;">Failed to load alerts.</p>`;
    }
}

// RESTOCK & EDIT MEDICATION (Stock, Price, Expiry)
async function handleRestock(e) {
    e.preventDefault();

    const drugId = document.getElementById("restockDrugId").value.trim();
    const newQuantity = parseInt(document.getElementById("restockQty").value, 10);
    const priceInput = document.getElementById("updateDrugPrice");
    const newPrice = priceInput ? parseFloat(priceInput.value) : null;
    const expiryInput = document.getElementById("updateExpiryDate");
    const newExpiry = expiryInput && expiryInput.value
        ? new Date(expiryInput.value).toISOString()
        : null;

    if (!drugId) {
        alert("Error: Missing Drug GUID identifier.");
        return;
    }

    let loggedInUserId = localStorage.getItem("user_id") || localStorage.getItem("userId");

    const stockPayload = {
        newQuantity: newQuantity,
        reason: "Routine stock update via pharmacist portal",
        updatedBy: loggedInUserId
    };

    try {
        // 1. Update stock count via PATCH
        const stockResponse = await fetchWithAuth(`/drugs/${drugId}/stock`, {
            method: "PATCH",
            body: JSON.stringify(stockPayload)
        });

        if (!stockResponse.ok) {
            const data = await stockResponse.json().catch(() => ({}));
            throw new Error(data.message || `Server returned HTTP ${stockResponse.status}`);
        }

        // 2. Update price and/or expiry via PUT
        const targetDrug = cachedDrugs.find(d => d.id === drugId);
        if (targetDrug) {
            const updatePayload = {
                name: targetDrug.name,
                description: targetDrug.description,
                price: newPrice !== null && !isNaN(newPrice) ? newPrice : targetDrug.price,
                stockQuantity: newQuantity,
                minimumStockLevel: targetDrug.minimumStockLevel || 5,
                expiryDate: newExpiry || targetDrug.expiryDate,
                supplier: targetDrug.supplier || "Main Pharmacy Supplier"
            };

            await fetchWithAuth(`/drugs/${drugId}`, {
                method: "PUT",
                body: JSON.stringify(updatePayload)
            });
        }

        alert("✅ Success: Medication stock, price, and expiry details updated!");
        closeRestockModal();
        loadInventoryData();
        loadStockAlerts();

    } catch (error) {
        console.error("Restock Exception:", error);
        alert(`Update Failed: ${error.message}`);
    }
}
// LOAD PENDING ORDERS WITH DATE AND TIME 
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
            const count = Array.isArray(order.items) 
                ? order.items.length 
                : (order.itemsCount || order.itemCount || 1);

            // Parse creation timestamp
            const rawTimestamp = order.createdAt || order.CreatedAt;
            let formattedDate = "N/A";
            let formattedTime = "";

            if (rawTimestamp) {
                const dateObj = new Date(rawTimestamp);
                formattedDate = dateObj.toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric"
                });
                formattedTime = dateObj.toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                    hour12: true
                });
            }

            const row = `
                <tr style="border-bottom: 1px solid #eef0f5;">
                    <td style="padding: 12px;"><code style="font-weight: bold; color: #512BD4;">#${orderId.substring(0, 8)}...</code></td>
                    <td style="padding: 12px;">${count} item(s)</td>
                    <td style="padding: 12px; font-weight: 600;">₦${(order.totalAmount || 0).toFixed(2)}</td>
                    <td style="padding: 12px;"><span style="background: #fff3cd; color: #856404; padding: 3px 8px; border-radius: 4px; font-weight: bold; font-size: 11px;">${order.status}</span></td>
                    <td style="padding: 12px;">
                        <div style="font-weight: 600; color: #2b2d42;">${formattedDate}</div>
                        <small style="color: #6a3bd9; font-weight: 600;">🕒 ${formattedTime}</small>
                    </td>
                    <td style="padding: 12px; text-align: center;">
                        <button class="btn-sm btn-patch" onclick="openDispenseModal('${orderId}')">Dispense Order</button>
                    </td>
                </tr>
            `;
            tbody.innerHTML += row;
        });
    } catch (err) {
        console.error("Queue error:", err);
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 15px; color: #ff4757;">Failed to load queue: ${err.message}</td></tr>`;
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

function formatDateForInput(dateValue) {
    if (!dateValue) return "";
    // Extract YYYY-MM-DD directly from ISO strings to avoid timezone day-shifts
    if (typeof dateValue === "string" && dateValue.includes("T")) {
        return dateValue.split("T")[0];
    }
    const parsed = new Date(dateValue);
    if (isNaN(parsed.getTime())) return "";
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, "0");
    const day = String(parsed.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function openRestockModal(id, name, currentQty) {
    document.getElementById("restockDrugId").value = id;
    document.getElementById("restockDrugLabel").innerText = `${name} (Current: ${currentQty})`;
    document.getElementById("restockQty").value = currentQty;

    const targetDrug = cachedDrugs.find(d => d.id === id);

    const priceInput = document.getElementById("updateDrugPrice");
    if (priceInput) {
        priceInput.value = targetDrug && targetDrug.price !== undefined ? targetDrug.price : 0;
    }

    const expiryInput = document.getElementById("updateExpiryDate");
    if (expiryInput) {
        expiryInput.value = targetDrug ? formatDateForInput(targetDrug.expiryDate) : "";
    }

    document.getElementById("restockModal").style.display = "flex";
}

function closeRestockModal() {
    document.getElementById("restockForm").reset();
    document.getElementById("restockModal").style.display = "none";
}
// 6. PRESCRIPTIONS QUEUE & DISPENSING
let currentPrescriptionToFill = null;

//async function loadPendingPrescriptions() {
//    const tbody = document.getElementById("prescriptionsQueueBody");
//    if (!tbody) return;

//    try {
//        const response = await fetchWithAuth("/prescriptions/pending");
//        if (!response.ok) throw new Error("Could not retrieve prescription queue.");

//        const data = await response.json();
//        const orders = Array.isArray(data) ? data : (data.items || []);

//        tbody.innerHTML = "";

//        if (orders.length === 0) {
//            tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 15px; color: #2ed573; font-weight: 600;">No pending prescription orders in queue.</td></tr>`;
//            return;
//        }

//        orders.forEach(order => {
//            const orderId = order.id || order.prescriptionId;
//            const count = Array.isArray(order.items) 
//                ? order.items.length 
//                : (order.itemsCount || order.itemCount || 1);
//            const row = `
//                <tr style="border-bottom: 1px solid #eee;">
//                    <td style="padding: 10px;"><strong>#${orderId.substring(0, 8)}...</strong></td>
//                    <td style="padding: 10px;">${count} item(s)</td>
//                    <td style="padding: 10px;">₦${(order.totalAmount || 0).toFixed(2)}</td>
//                    <td style="padding: 10px;"><span style="background: #fff3cd; color: #856404; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 12px;">${order.status}</span></td>
//                    <td style="padding: 10px;">${new Date(order.createdAt).toLocaleDateString()}</td>
//                    <td style="padding: 10px; text-align: center;">
//                        <button class="btn-sm btn-patch" onclick="openDispenseModal('${orderId}')">Dispense Order</button>
//                    </td>
//                </tr>
//            `;
//            tbody.innerHTML += row;
//        });
//    } catch (err) {
//        console.error("Queue error:", err);
//        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 15px; color: #ff4757;">Failed to load queue.</td></tr>`;
//    }
//}

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