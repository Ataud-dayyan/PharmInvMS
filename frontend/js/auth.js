const API_BASE_URL = "https://pharminvms.onrender.com/api";

// Uses the shared loading wrapper (js/loading.js) when it is on the page,
// otherwise falls back to plain fetch so nothing breaks if the script is missing.
function requestWithLoading(url, options, loadingConfig) {
    if (typeof fetchWithLoading === "function") {
        return fetchWithLoading(url, options, loadingConfig);
    }
    return fetch(url, options);
}

// Small helper for the status line on the login form
function setLoginStatus(message, type) {
    const el = document.getElementById("loginStatus");
    if (!el) return;
    if (!message) {
        el.hidden = true;
        el.textContent = "";
        return;
    }
    el.textContent = message;
    el.className = "login-status login-status--" + (type || "info");
    el.setAttribute("role", type === "error" ? "alert" : "status");
    el.hidden = false;
}

// 1. LOGIN FUNCTION
async function loginUser(email, password) {
    const loginButton = document.querySelector("#loginForm button[type='submit']");
    setLoginStatus("");

    try {
        console.log("Attempting to connect to:", `${API_BASE_URL}/auth/login`);

        const response = await requestWithLoading(
            `${API_BASE_URL}/auth/login`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ email: email, password: password })
            },
            {
                mode: "button",
                button: loginButton,
                buttonText: "Signing in\u2026",
                slowMessage: "Connecting to database\u2026",
                keepOnSuccess: true, // stay in loading state while we redirect
                onSlow: () => setLoginStatus(
                    "The server is waking up. This can take up to a minute, please wait.",
                    "info"
                )
            }
        );

        if (!response.ok) {
            let serverMessage = "";
            try {
                const errorData = await response.json();
                serverMessage = errorData.message || "";
            } catch (parseError) {
                // Non-JSON error body (e.g. a gateway error page from Render)
            }

            if (serverMessage) {
                throw new Error(serverMessage);
            }
            if (response.status >= 500) {
                throw new Error("The server is temporarily unavailable. Please try again in a moment.");
            }
            throw new Error("Unauthorized: Check your credentials.");
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
        // Make sure the button is usable again after any failure
        if (typeof PharmLoader !== "undefined") {
            PharmLoader.setButtonLoading(loginButton, false);
        }
        setLoginStatus(error.message, "error");
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
// `loading` is optional. Existing calls like fetchWithAuth("/drugs") behave exactly
// as before. Pass a config to opt in, e.g.
//   fetchWithAuth("/drugs", {}, { mode: "overlay", message: "Retrieving inventory..." })
async function fetchWithAuth(endpoint, options = {}, loading = null) {
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

    const url = `${API_BASE_URL}${endpoint}`;
    const response = loading
        ? await requestWithLoading(url, options, loading)
        : await fetch(url, options);

    if (response.status === 401 || response.status === 403) {
        console.warn("Session expired or access unauthorized.");
    }

    return response;
}

function logoutUser() {
    localStorage.clear();
    window.location.href = "index.html";
}

