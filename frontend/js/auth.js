const API_BASE_URL = "http://localhost:5000/api";

// 1. LOGIN FUNCTION
async function loginUser(email, password) {
    try {
        console.log("Attempting to connect to:", `${API_BASE_URL}/auth/login`);

        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ email: email, password: password })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || "Unauthorized: Check your credentials.");
        }

        const data = await response.json();
        console.log("=== API LOGIN RESPONSE ===", data);
        
        localStorage.setItem("jwt_token", data.token);
        localStorage.setItem("user_role", data.user.role); 
        
        const emailFallbackName = data.user.email ? data.user.email.split('@')[0] : "User";
        const realName = (data.user.firstName || data.user.lastName) 
            ? `${data.user.firstName} ${data.user.lastName}`.trim() 
            : emailFallbackName;
            
        localStorage.setItem("user_name", realName);
        localStorage.setItem("user_id", data.user.id);

        redirectUserByRole(data.user.role);

    } catch (error) {
        console.error("Authentication Error:", error.message);
        alert(error.message);
    }
}

// 2. ROLE-BASED ACCESS ROUTER
function redirectUserByRole(role) {
    const checkRole = (role || "").trim().toLowerCase();
    if (checkRole === "pharmacist") {
        window.location.href = "inventory.html";
    } else if (checkRole === "doctor") {
        window.location.href = "prescriptions.html";
    } else if (checkRole === "admin") {
        window.location.href = "admin.html";
    } else {
        window.location.href = "patient.html"; 
    }
}

// 3. SECURE AUTHENTICATED REQUESTS
async function fetchWithAuth(endpoint, options = {}) {
    const token = localStorage.getItem("jwt_token");

    if (!token) {
        window.location.href = "index.html"; 
        return;
    }

    options.headers = {
        ...options.headers,
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
    };

    const response = await fetch(`${API_BASE_URL}${endpoint}`, options);

    if (response.status === 401 || response.status === 403) {
        console.warn("Session expired or access unauthorized.");
    }

    return response;
}

function logoutUser() {
    localStorage.clear();
    window.location.href = "index.html";
}