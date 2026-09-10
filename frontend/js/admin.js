document.addEventListener("DOMContentLoaded", function () {
    const rawRole = localStorage.getItem("user_role") || "";
    const role = rawRole.trim().toLowerCase();
    const token = localStorage.getItem("jwt_token");

    if (!token || role !== "admin") {
        alert("Access Denied: Admin privileges required.");
        localStorage.clear();
        window.location.href = "index.html"; 
        return;
    }

    document.getElementById("welcomeText").innerText = `Logged in: ${localStorage.getItem("user_name") || "Admin"}`;

    loadUserRegistry();

    const regForm = document.getElementById("registerStaffForm");
    if (regForm) regForm.addEventListener("submit", handleStaffRegistration);
});

async function loadUserRegistry() {
    try {
        const response = await fetchWithAuth("/users");

        if (!response || !response.ok) {
            throw new Error("Could not fetch users.");
        }

        const payload = await response.json();

        const userList =
            payload.items ||
            payload.data ||
            (Array.isArray(payload) ? payload : [payload]);

        renderUsersByRole(userList);

    } catch (error) {
        console.error("Load Users Error:", error);

        document.getElementById("staffTableBody").innerHTML =
            `<tr class="empty-row">
                <td colspan="3" style="color:#ff4757;">
                    Unable to load staff accounts: ${error.message}
                </td>
            </tr>`;

        document.getElementById("patientTableBody").innerHTML =
            `<tr class="empty-row">
                <td colspan="3" style="color:#ff4757;">
                    Unable to load patient accounts.
                </td>
            </tr>`;

        document.getElementById("adminTableBody").innerHTML =
            `<tr class="empty-row">
                <td colspan="3" style="color:#ff4757;">
                    Unable to load admin accounts.
                </td>
            </tr>`;
    }
}
async function handleStaffRegistration(e) {
    e.preventDefault();
    
    const email = document.getElementById("staffEmail").value.trim();
    const password = document.getElementById("staffPassword").value;
    const role = document.getElementById("staffRole").value;
    const emailPrefix = email.split('@')[0];

    const payload = {
        email: email,
        password: password,
        role: role,
        firstName: emailPrefix,
        lastName: role
    };

    try {
        const response = await fetchWithAuth("/users", {
            method: "POST",
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.message || `Server returned HTTP ${response.status}`);
        }

        alert(`✅ Account created successfully for ${email} as ${role}!`);
        document.getElementById("registerStaffForm").reset();
        loadUserRegistry();

    } catch (error) {
        console.error("Register Error:", error);
        alert(`Account Creation Failed: ${error.message}`);
    }
}

async function deactivateUser(userId, userName) {
    if (!confirm(`Are you sure you want to deactivate user: ${userName}?`)) return;

    try {
        const response = await fetchWithAuth(`/users/${userId}`, {
            method: "DELETE"
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.message || `HTTP ${response.status}`);
        }

        alert(`✅ User ${userName} has been deactivated.`);
        loadUsersTable(); // Re-fetch user table list
    } catch (error) {
        console.error("Deactivation error:", error);
        alert(`Failed to deactivate user: ${error.message}`);
    }
}