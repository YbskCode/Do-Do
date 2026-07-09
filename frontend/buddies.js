const goBackBtn = document.getElementById("goBackBtn");
const addBuddyForm = document.getElementById("addBuddyForm");
const buddyIdentifierInput = document.getElementById("buddyIdentifierInput");
const addBuddyBtn = document.getElementById("addBuddyBtn");
const requestsSection = document.getElementById("requestsSection");
const requestsList = document.getElementById("requestsList");
const buddiesList = document.getElementById("buddiesList");
const showPresenceToggle = document.getElementById("showPresenceToggle");
const showTaskNameToggle = document.getElementById("showTaskNameToggle");
const savePrivacyBtn = document.getElementById("savePrivacyBtn");
const myUsername = document.getElementById("myUsername");
const myFriendCode = document.getElementById("myFriendCode");

const sessionsList = document.getElementById("sessionsList");
const newSessionBtn = document.getElementById("newSessionBtn");
const sessionModal = document.getElementById("sessionModal");
const closeSessionBtn = document.getElementById("closeSessionBtn");
const sessionLabelInput = document.getElementById("sessionLabelInput");
const sessionDurationInput = document.getElementById("sessionDurationInput");
const sessionBuddyPicker = document.getElementById("sessionBuddyPicker");
const sessionModalError = document.getElementById("sessionModalError");
const createSessionBtn = document.getElementById("createSessionBtn");

let buddyPollTimer = null;
let currentBuddies = [];
let editingSessionId = null;

if (goBackBtn) {
    goBackBtn.addEventListener("click", () => {
        window.location.href = "directing.html";
    });
}

function formatUserTag(user) {
    return `@${user.username}`;
}

function formatUserMeta(user) {
    return `${formatUserTag(user)} · #${user.friendCode}`;
}

function statusClass(status) {
    return `buddy-status buddy-status--${status || "offline"}`;
}

function formatStatusLabel(buddy) {
    const label = DoDoPresence.STATUS_LABELS[buddy.status] || "Offline";
    if (buddy.status === "focusing" && buddy.currentTaskName) {
        return `${label} · ${buddy.currentTaskName}`;
    }
    if (buddy.sessionEndsAt && (buddy.status === "focusing" || buddy.status === "on_break")) {
        const ends = new Date(buddy.sessionEndsAt);
        const mins = Math.max(0, Math.ceil((ends - Date.now()) / 60000));
        return `${label} · ${mins}m left`;
    }
    return label;
}

function renderBuddies(buddies) {
    if (!buddies.length) {
        buddiesList.innerHTML = '<li class="buddy-empty">No study buddies yet. Add someone by username or friend code!</li>';
        return;
    }

    buddiesList.innerHTML = buddies.map((buddy) => `
        <li class="buddy-item">
            <div class="buddy-info">
                <span class="${statusClass(buddy.status)}" title="${DoDoPresence.STATUS_LABELS[buddy.status]}"></span>
                <div>
                    <strong>${escapeHtml(buddy.name)}</strong>
                    <span class="buddy-meta">${escapeHtml(formatUserMeta(buddy))}</span>
                    <span class="buddy-status-text">${escapeHtml(formatStatusLabel(buddy))}</span>
                </div>
            </div>
            <button class="buddy-remove-btn" data-user-id="${buddy.id}" title="Remove buddy">
                <i class="fa-solid fa-user-minus"></i>
            </button>
        </li>
    `).join("");

    buddiesList.querySelectorAll(".buddy-remove-btn").forEach((btn) => {
        btn.addEventListener("click", () => removeBuddy(btn.dataset.userId));
    });
}

function renderRequests(requests) {
    if (!requests.length) {
        requestsSection.style.display = "none";
        requestsList.innerHTML = "";
        return;
    }

    requestsSection.style.display = "block";
    requestsList.innerHTML = requests.map((req) => `
        <li class="buddy-item">
            <div class="buddy-info">
                <div>
                    <strong>${escapeHtml(req.name)}</strong>
                    <span class="buddy-meta">${escapeHtml(formatUserMeta(req))}</span>
                </div>
            </div>
            <div class="buddy-request-actions">
                <button class="buddy-accept-btn" data-request-id="${req.id}">Accept</button>
                <button class="buddy-decline-btn" data-request-id="${req.id}">Decline</button>
            </div>
        </li>
    `).join("");

    requestsList.querySelectorAll(".buddy-accept-btn").forEach((btn) => {
        btn.addEventListener("click", () => respondToRequest(btn.dataset.requestId, "accept"));
    });
    requestsList.querySelectorAll(".buddy-decline-btn").forEach((btn) => {
        btn.addEventListener("click", () => respondToRequest(btn.dataset.requestId, "decline"));
    });
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

async function loadMyProfile() {
    const cached = JSON.parse(localStorage.getItem("loggedInUser") || "null");
    if (cached?.username) {
        myUsername.textContent = `@${cached.username}`;
        myFriendCode.textContent = cached.friendCode || "—";
    }

    try {
        const response = await DoDoPresence.authFetch(apiUrl("/users/me"));
        const data = await DoDoPresence.parseJsonResponse(response);
        if (response.ok) {
            myUsername.textContent = `@${data.username}`;
            myFriendCode.textContent = data.friendCode;
            if (cached) {
                localStorage.setItem("loggedInUser", JSON.stringify({
                    ...cached,
                    username: data.username,
                    friendCode: data.friendCode
                }));
            }
        }
    } catch (err) {
        console.error("Failed to load profile:", err);
    }
}

async function loadBuddies() {
    try {
        const response = await DoDoPresence.authFetch(apiUrl("/buddies"));
        const data = await DoDoPresence.parseJsonResponse(response);
        if (response.ok) {
            currentBuddies = data;
            renderBuddies(data);
        }
    } catch (err) {
        console.error("Failed to load buddies:", err);
    }
}

async function loadRequests() {
    try {
        const response = await DoDoPresence.authFetch(apiUrl("/buddies/requests"));
        const data = await DoDoPresence.parseJsonResponse(response);
        if (response.ok) {
            renderRequests(data);
        }
    } catch (err) {
        console.error("Failed to load requests:", err);
    }
}

async function loadPrivacySettings() {
    try {
        const response = await DoDoPresence.authFetch(apiUrl("/presence/settings"));
        const data = await DoDoPresence.parseJsonResponse(response);
        if (response.ok) {
            showPresenceToggle.checked = data.showPresence;
            showTaskNameToggle.checked = data.showTaskName;
        }
    } catch (err) {
        console.error("Failed to load privacy settings:", err);
    }
}

// --- Study Together sessions ---

const SESSION_STATUS_LABELS = {
    pending: "Waiting to start",
    active: "In progress"
};

function renderSessions(sessions) {
    if (!sessions.length) {
        sessionsList.innerHTML = '<li class="buddy-empty">No active study sessions. Start one to focus with your buddies!</li>';
        return;
    }

    sessionsList.innerHTML = sessions.map((session) => {
        const joined = session.participants.filter((p) => p.status === "joined");
        const invited = session.participants.filter((p) => p.status === "invited");
        const names = joined.map((p) => escapeHtml(p.isHost ? `${p.name} (host)` : p.name)).join(", ");
        const statusLabel = SESSION_STATUS_LABELS[session.status] || session.status;
        const title = session.label ? escapeHtml(session.label) : "Study session";

        let timeInfo = `${session.durationMinutes}m`;
        if (session.status === "active" && session.secondsRemaining > 0) {
            timeInfo = `${Math.ceil(session.secondsRemaining / 60)}m left`;
        }

        return `
        <li class="buddy-item session-item">
            <div class="buddy-info">
                <span class="session-status-dot session-status-dot--${session.status}"></span>
                <div>
                    <strong>${title} · ${timeInfo}</strong>
                    <span class="buddy-meta">${statusLabel} · ${joined.length} in${invited.length ? ` · ${invited.length} invited` : ""}</span>
                    <span class="buddy-status-text">${names || "No one joined yet"}</span>
                </div>
            </div>
            <div class="session-actions">
                ${renderSessionButtons(session)}
            </div>
        </li>`;
    }).join("");

    sessionsList.querySelectorAll("button[data-session-action]").forEach((btn) => {
        btn.addEventListener("click", () => handleSessionAction(
            btn.dataset.sessionAction,
            btn.dataset.sessionId,
            btn
        ));
    });
}

function renderSessionButtons(session) {
    const buttons = [];

    if (session.status === "active") {
        buttons.push(`<button class="session-go-btn" data-session-action="go" data-session-id="${session.id}">Go to Timer</button>`);
    }

    if (session.isHost) {
        if (session.status === "pending") {
            buttons.push(`<button class="session-start-btn" data-session-action="start" data-session-id="${session.id}">Start</button>`);
            buttons.push(`<button class="session-edit-btn" data-session-action="edit" data-session-id="${session.id}">Edit</button>`);
        }
        buttons.push(`<button class="session-leave-btn" data-session-action="cancel" data-session-id="${session.id}">Cancel</button>`);
    } else {
        buttons.push(`<button class="session-leave-btn" data-session-action="leave" data-session-id="${session.id}">Leave</button>`);
    }

    return buttons.join("");
}

async function handleSessionAction(action, sessionId, btn) {
    if (action === "go") {
        window.location.href = "pomodoro.html";
        return;
    }
    if (action === "edit") {
        openSessionModalForEdit(sessionId);
        return;
    }
    if (action === "cancel" && !confirm("Cancel this study session for everyone?")) return;
    if (action === "leave" && !confirm("Leave this study session?")) return;

    btn.disabled = true;
    try {
        const response = await DoDoPresence.authFetch(apiUrl(`/sessions/${sessionId}/${action}`), { method: "PUT" });
        if (action === "start" && response.ok) {
            window.location.href = "pomodoro.html";
            return;
        }
        await loadSessions();
    } catch (err) {
        console.error("Session action failed:", err);
        btn.disabled = false;
    }
}

async function loadSessions() {
    if (!sessionsList) return;
    try {
        const response = await DoDoPresence.authFetch(apiUrl("/sessions/mine"));
        const data = await DoDoPresence.parseJsonResponse(response);
        if (response.ok) {
            renderSessions(data);
        }
    } catch (err) {
        console.error("Failed to load sessions:", err);
    }
}

function renderBuddyPicker() {
    if (!currentBuddies.length) {
        sessionBuddyPicker.innerHTML = '<p class="buddy-empty">Add buddies first to invite them.</p>';
        return;
    }
    sessionBuddyPicker.innerHTML = currentBuddies.map((buddy) => `
        <label class="session-buddy-option">
            <input type="checkbox" value="${buddy.id}">
            <span>${escapeHtml(buddy.name)} <span class="buddy-meta">@${escapeHtml(buddy.username)}</span></span>
        </label>
    `).join("");
}

function showSessionModalError(message) {
    if (!sessionModalError) return;
    sessionModalError.textContent = message;
    sessionModalError.style.display = "block";
}

function hideSessionModalError() {
    if (!sessionModalError) return;
    sessionModalError.style.display = "none";
    sessionModalError.textContent = "";
}

function openSessionModalForCreate() {
    editingSessionId = null;
    hideSessionModalError();
    sessionLabelInput.value = "";
    sessionDurationInput.value = 25;
    renderBuddyPicker();
    sessionBuddyPicker.parentElement.style.display = "";
    createSessionBtn.textContent = "Create Session";
    sessionModal.style.display = "flex";
}

function openSessionModalForEdit(sessionId) {
    hideSessionModalError();
    DoDoPresence.authFetch(apiUrl(`/sessions/${sessionId}`))
        .then((r) => DoDoPresence.parseJsonResponse(r))
        .then((session) => {
            if (!session || !session.id) return;
            editingSessionId = session.id;
            sessionLabelInput.value = session.label || "";
            sessionDurationInput.value = session.durationMinutes;
            // Invitees can't be changed after creation, so hide the picker in edit mode
            sessionBuddyPicker.parentElement.style.display = "none";
            createSessionBtn.textContent = "Save Changes";
            sessionModal.style.display = "flex";
        })
        .catch((err) => console.error("Failed to load session for edit:", err));
}

function closeSessionModal() {
    if (sessionModal) sessionModal.style.display = "none";
    editingSessionId = null;
}

async function submitSession() {
    const duration = parseInt(sessionDurationInput.value, 10);
    if (Number.isNaN(duration) || duration < 25 || duration > 180) {
        showSessionModalError("Duration must be between 25 and 180 minutes.");
        return;
    }

    const label = sessionLabelInput.value.trim();
    createSessionBtn.disabled = true;

    try {
        let response;
        if (editingSessionId) {
            response = await DoDoPresence.authFetch(apiUrl(`/sessions/${editingSessionId}`), {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ label, durationMinutes: duration })
            });
        } else {
            const buddyIds = Array.from(
                sessionBuddyPicker.querySelectorAll("input[type=checkbox]:checked")
            ).map((cb) => parseInt(cb.value, 10));

            response = await DoDoPresence.authFetch(apiUrl("/sessions"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ label, durationMinutes: duration, buddyIds })
            });
        }

        const data = await DoDoPresence.parseJsonResponse(response);
        if (!response.ok) {
            showSessionModalError(data.message || "Could not save session.");
            return;
        }

        closeSessionModal();
        await loadSessions();
    } catch (err) {
        console.error("Failed to save session:", err);
        showSessionModalError("Could not reach the server.");
    } finally {
        createSessionBtn.disabled = false;
    }
}

if (newSessionBtn) {
    newSessionBtn.addEventListener("click", openSessionModalForCreate);
}
if (closeSessionBtn) {
    closeSessionBtn.addEventListener("click", closeSessionModal);
}
if (createSessionBtn) {
    createSessionBtn.addEventListener("click", submitSession);
}
if (sessionModal) {
    sessionModal.addEventListener("click", (event) => {
        if (event.target === sessionModal) closeSessionModal();
    });
}

async function refreshAll() {
    await Promise.all([loadBuddies(), loadRequests(), loadSessions()]);
}

// Allow the global notification widget to refresh this page after actions
window.loadBuddyData = refreshAll;

if (addBuddyForm) {
    addBuddyForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const identifier = buddyIdentifierInput.value.trim();
        if (!identifier) return;

        addBuddyBtn.disabled = true;
        addBuddyBtn.textContent = "Sending...";

        try {
            const response = await DoDoPresence.authFetch(apiUrl("/buddies/request"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ identifier })
            });
            const data = await DoDoPresence.parseJsonResponse(response);

            if (!response.ok) {
                alert(data.message || "Could not send request");
                return;
            }

            buddyIdentifierInput.value = "";
            alert("Friend request sent!");
            await refreshAll();
        } catch (err) {
            console.error(err);
            alert("Could not reach the server. Check your connection and that the backend is deployed.");
        } finally {
            addBuddyBtn.disabled = false;
            addBuddyBtn.textContent = "Send Request";
        }
    });
}

async function respondToRequest(requestId, action) {
    try {
        const response = await DoDoPresence.authFetch(apiUrl(`/buddies/requests/${requestId}/${action}`), {
            method: "PUT"
        });
        if (response.ok) {
            await refreshAll();
        }
    } catch (err) {
        console.error(err);
    }
}

async function removeBuddy(userId) {
    if (!confirm("Remove this study buddy?")) return;

    try {
        const response = await DoDoPresence.authFetch(apiUrl(`/buddies/${userId}`), {
            method: "DELETE"
        });
        if (response.ok) {
            await refreshAll();
        }
    } catch (err) {
        console.error(err);
    }
}

if (savePrivacyBtn) {
    savePrivacyBtn.addEventListener("click", async () => {
        savePrivacyBtn.disabled = true;
        try {
            const response = await DoDoPresence.authFetch(apiUrl("/presence/settings"), {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    showPresence: showPresenceToggle.checked,
                    showTaskName: showTaskNameToggle.checked
                })
            });
            if (response.ok) {
                savePrivacyBtn.textContent = "Saved!";
                setTimeout(() => { savePrivacyBtn.textContent = "Save Privacy Settings"; }, 1500);
            }
        } catch (err) {
            console.error(err);
        } finally {
            savePrivacyBtn.disabled = false;
        }
    });
}

document.addEventListener("DOMContentLoaded", () => {
    if (!localStorage.getItem("authToken")) {
        window.location.href = "login.html";
        return;
    }

    DoDoPresence.startHeartbeat();
    loadMyProfile();
    loadPrivacySettings();
    refreshAll();
    buddyPollTimer = setInterval(refreshAll, 20000);
});

window.addEventListener("beforeunload", () => {
    if (buddyPollTimer) clearInterval(buddyPollTimer);
});
