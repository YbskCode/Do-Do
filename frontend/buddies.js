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

let buddyPollTimer = null;
let currentBuddies = [];

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
            <div class="buddy-actions">
                <button class="buddy-message-btn" data-user-id="${buddy.id}" title="Message">
                    <i class="fa-solid fa-comment"></i>
                </button>
                <button class="buddy-remove-btn" data-user-id="${buddy.id}" title="Remove buddy">
                    <i class="fa-solid fa-user-minus"></i>
                </button>
            </div>
        </li>
    `).join("");

    buddiesList.querySelectorAll(".buddy-message-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            window.location.href = `messages.html?user=${btn.dataset.userId}`;
        });
    });

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

async function refreshAll() {
    await Promise.all([loadBuddies(), loadRequests()]);
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
    if (!localStorage.getItem("authToken") || (typeof isGuestSession === "function" && isGuestSession())) {
        window.location.href = typeof isGuestSession === "function" && isGuestSession()
            ? "directing.html"
            : "login.html";
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
