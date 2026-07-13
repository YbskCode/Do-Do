/**
 * Shared presence & auth helpers for Study Buddies.
 * Include after config.js on authenticated pages.
 */
const DoDoPresence = (() => {
    let heartbeatTimer = null;
    let currentStatus = "online";

    async function authFetch(url, options = {}) {
        const token = localStorage.getItem("authToken");
        const headers = { ...(options.headers || {}), "Authorization": `Bearer ${token}` };
        const response = await fetch(url, { ...options, headers });
        if (response.status === 401) {
            localStorage.removeItem("loggedInUser");
            localStorage.removeItem("authToken");
            window.location.href = "login.html";
        }
        return response;
    }

    async function updatePresence(status, extras = {}) {
        if (!localStorage.getItem("authToken")) return;
        currentStatus = status;

        const body = {
            status,
            currentTaskName: extras.currentTaskName || null,
            sessionEndsAt: extras.sessionEndsAt || null
        };

        try {
            await authFetch(apiUrl("/presence"), {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });
        } catch (err) {
            console.error("Failed to update presence:", err);
        }
    }

    function syncFromTimer(isRunning, timerElementId, endTimeMs, taskName) {
        if (!isRunning) {
            updatePresence("online");
            return;
        }

        const isPomodoro = timerElementId === "pomodoro-timer";
        const status = isPomodoro ? "focusing" : "on_break";
        const sessionEndsAt = endTimeMs ? new Date(endTimeMs).toISOString() : null;

        updatePresence(status, {
            currentTaskName: isPomodoro ? taskName : null,
            sessionEndsAt
        });
    }

    function startHeartbeat() {
        if (heartbeatTimer) return;

        updatePresence("online");
        heartbeatTimer = setInterval(() => {
            updatePresence(currentStatus);
        }, 45000);

        window.addEventListener("beforeunload", markOffline);
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") {
                updatePresence(currentStatus);
            }
        });
    }

    function stopHeartbeat() {
        if (heartbeatTimer) {
            clearInterval(heartbeatTimer);
            heartbeatTimer = null;
        }
        window.removeEventListener("beforeunload", markOffline);
    }

    function markOffline() {
        const token = localStorage.getItem("authToken");
        if (!token) return;
        fetch(apiUrl("/presence"), {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ status: "offline" }),
            keepalive: true
        });
    }

    const STATUS_LABELS = {
        offline: "Offline",
        online: "Online",
        focusing: "In focus session",
        on_break: "On break"
    };

    async function parseJsonResponse(response) {
        const text = await response.text();
        try {
            return text ? JSON.parse(text) : {};
        } catch {
            if (response.status === 404) {
                return { message: "Study Buddies API not found. Deploy the latest backend to Railway." };
            }
            return { message: "Unexpected server response" };
        }
    }

    return {
        authFetch,
        parseJsonResponse,
        updatePresence,
        syncFromTimer,
        startHeartbeat,
        stopHeartbeat,
        getStatus: () => currentStatus,
        STATUS_LABELS
    };
})();
