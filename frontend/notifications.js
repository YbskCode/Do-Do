/**
 * Global notification widget for friend requests and study-session invites.
 * Loads on every authenticated page (after config.js + presence.js) so a
 * receiver can see and act on requests anywhere. Hidden during Focus Mode via CSS.
 */
const DoDoNotify = (() => {
    const POLL_INTERVAL_MS = 15000;

    let pollTimer = null;
    let panelOpen = false;
    let seenFriendIds = new Set();
    let seenSessionIds = new Set();
    let seenMessageIds = new Set();
    let firstLoad = true;

    let root = null;
    let panelEl = null;
    let badgeEl = null;
    let toastsEl = null;

    function escapeHtml(text) {
        const div = document.createElement("div");
        div.textContent = text == null ? "" : text;
        return div.innerHTML;
    }

    function buildWidget() {
        root = document.createElement("div");
        root.id = "doDoNotify";
        root.className = "doDoNotify";
        root.innerHTML = `
            <button type="button" class="doDoNotifyBell" aria-label="Notifications">
                <i class="fa-solid fa-bell"></i>
                <span class="doDoNotifyBadge" hidden>0</span>
            </button>
            <div class="doDoNotifyPanel" hidden>
                <div class="doDoNotifyPanelHeader">Notifications</div>
                <div class="doDoNotifyList"></div>
            </div>
        `;
        document.body.appendChild(root);

        toastsEl = document.createElement("div");
        toastsEl.className = "doDoNotifyToasts";
        document.body.appendChild(toastsEl);

        panelEl = root.querySelector(".doDoNotifyPanel");
        badgeEl = root.querySelector(".doDoNotifyBadge");

        root.querySelector(".doDoNotifyBell").addEventListener("click", togglePanel);
        document.addEventListener("click", (event) => {
            if (panelOpen && !root.contains(event.target)) {
                setPanelOpen(false);
            }
        });
    }

    function setPanelOpen(open) {
        panelOpen = open;
        panelEl.hidden = !open;
    }

    function togglePanel() {
        setPanelOpen(!panelOpen);
    }

    function updateBadge(count) {
        if (count > 0) {
            badgeEl.textContent = count > 9 ? "9+" : String(count);
            badgeEl.hidden = false;
            root.classList.add("hasNotifications");
        } else {
            badgeEl.hidden = true;
            root.classList.remove("hasNotifications");
        }
    }

    function showToast(message, iconClass = "fa-bell") {
        if (!toastsEl) return;
        const toast = document.createElement("div");
        toast.className = "doDoNotifyToast";
        toast.innerHTML = `<i class="fa-solid ${iconClass}"></i><span>${escapeHtml(message)}</span>`;
        toastsEl.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add("show"));
        setTimeout(() => {
            toast.classList.remove("show");
            setTimeout(() => toast.remove(), 400);
        }, 5000);
    }

    // A message notification is only shown when the receiver is:
    //  - outside the messages page, and
    //  - outside a pomodoro (focusing) session.
    // Rule 3 ("first message after the user's reply") is enforced server-side.
    function messageNotificationsSuppressed() {
        const onMessagesPage = window.location.pathname
            .toLowerCase()
            .endsWith("messages.html");
        const inPomodoroSession = typeof DoDoPresence !== "undefined"
            && typeof DoDoPresence.getStatus === "function"
            && DoDoPresence.getStatus() === "focusing";
        return onMessagesPage || inPomodoroSession;
    }

    function renderPanel(friendRequests, sessionInvites, messageNotifications) {
        const list = panelEl.querySelector(".doDoNotifyList");

        if (!friendRequests.length && !sessionInvites.length && !messageNotifications.length) {
            list.innerHTML = '<p class="doDoNotifyEmpty">You\'re all caught up.</p>';
            return;
        }

        const friendHtml = friendRequests.map((req) => `
            <div class="doDoNotifyItem" data-type="friend" data-id="${req.id}">
                <div class="doDoNotifyItemInfo">
                    <i class="fa-solid fa-user-plus doDoNotifyItemIcon"></i>
                    <div>
                        <strong>${escapeHtml(req.name)}</strong>
                        <span class="doDoNotifyItemMeta">@${escapeHtml(req.username)} wants to be your buddy</span>
                    </div>
                </div>
                <div class="doDoNotifyItemActions">
                    <button class="doDoNotifyAccept" data-action="friend-accept" data-id="${req.id}">Accept</button>
                    <button class="doDoNotifyDecline" data-action="friend-decline" data-id="${req.id}">Decline</button>
                </div>
            </div>
        `).join("");

        const sessionHtml = sessionInvites.map((invite) => {
            const detail = invite.label
                ? `${escapeHtml(invite.label)} · ${invite.durationMinutes}m`
                : `${invite.durationMinutes}m study session`;
            return `
            <div class="doDoNotifyItem" data-type="session" data-id="${invite.sessionId}">
                <div class="doDoNotifyItemInfo">
                    <i class="fa-solid fa-people-group doDoNotifyItemIcon"></i>
                    <div>
                        <strong>${escapeHtml(invite.hostName)} invited you</strong>
                        <span class="doDoNotifyItemMeta">${detail}</span>
                    </div>
                </div>
                <div class="doDoNotifyItemActions">
                    <button class="doDoNotifyAccept" data-action="session-join" data-id="${invite.sessionId}">Accept</button>
                    <button class="doDoNotifyDecline" data-action="session-decline" data-id="${invite.sessionId}">Decline</button>
                </div>
            </div>`;
        }).join("");

        const messageHtml = messageNotifications.map((note) => `
            <div class="doDoNotifyItem" data-type="message" data-id="${note.fromUserId}">
                <div class="doDoNotifyItemInfo">
                    <i class="fa-solid fa-comment doDoNotifyItemIcon"></i>
                    <div>
                        <strong>${escapeHtml(note.name)}</strong>
                        <span class="doDoNotifyItemMeta">${escapeHtml(note.preview)}</span>
                    </div>
                </div>
                <div class="doDoNotifyItemActions">
                    <button class="doDoNotifyAccept" data-action="message-reply" data-id="${note.fromUserId}">Reply</button>
                </div>
            </div>
        `).join("");

        list.innerHTML = friendHtml + sessionHtml + messageHtml;
        list.querySelectorAll("button[data-action]").forEach((btn) => {
            btn.addEventListener("click", () => handleAction(btn.dataset.action, btn.dataset.id, btn));
        });
    }

    async function handleAction(action, id, btn) {
        btn.disabled = true;
        try {
            if (action === "friend-accept") {
                await DoDoPresence.authFetch(apiUrl(`/buddies/requests/${id}/accept`), { method: "PUT" });
                if (typeof DoDoAchievements !== "undefined") {
                    DoDoAchievements.check();
                }
            } else if (action === "friend-decline") {
                await DoDoPresence.authFetch(apiUrl(`/buddies/requests/${id}/decline`), { method: "PUT" });
            } else if (action === "session-decline") {
                await DoDoPresence.authFetch(apiUrl(`/sessions/${id}/decline`), { method: "PUT" });
            } else if (action === "session-join") {
                const response = await DoDoPresence.authFetch(apiUrl(`/sessions/${id}/join`), { method: "PUT" });
                if (response.ok) {
                    window.location.href = "pomodoro.html";
                    return;
                }
                const data = await DoDoPresence.parseJsonResponse(response);
                alert(data.message || "Could not join this session.");
            } else if (action === "message-reply") {
                window.location.href = `messages.html?user=${id}`;
                return;
            }
            if (typeof window.loadBuddyData === "function") {
                window.loadBuddyData();
            }
            await refresh();
        } catch (err) {
            console.error("Notification action failed:", err);
            btn.disabled = false;
        }
    }

    async function refresh() {
        if (!localStorage.getItem("authToken")) return;
        try {
            const response = await DoDoPresence.authFetch(apiUrl("/notifications"));
            const data = await DoDoPresence.parseJsonResponse(response);
            if (!response.ok) return;

            const friendRequests = data.friendRequests || [];
            const sessionInvites = data.sessionInvites || [];
            // When suppressed, treat message notifications as absent so they
            // neither toast nor count, and stay "unseen" for later delivery.
            const messageNotifications = messageNotificationsSuppressed()
                ? []
                : (data.messageNotifications || []);

            const currentFriendIds = new Set(friendRequests.map((r) => r.id));
            const currentSessionIds = new Set(sessionInvites.map((s) => s.sessionId));
            const currentMessageIds = new Set(messageNotifications.map((m) => m.messageId));

            if (!firstLoad) {
                friendRequests
                    .filter((r) => !seenFriendIds.has(r.id))
                    .forEach((r) => showToast(`${r.name} sent you a buddy request`));
                sessionInvites
                    .filter((s) => !seenSessionIds.has(s.sessionId))
                    .forEach((s) => showToast(`${s.hostName} invited you to study together`));
                messageNotifications
                    .filter((m) => !seenMessageIds.has(m.messageId))
                    .forEach((m) => showToast(`${m.name} sent you a message`));
            }

            seenFriendIds = currentFriendIds;
            seenSessionIds = currentSessionIds;
            seenMessageIds = currentMessageIds;
            firstLoad = false;

            updateBadge(friendRequests.length + sessionInvites.length + messageNotifications.length);
            renderPanel(friendRequests, sessionInvites, messageNotifications);
        } catch (err) {
            console.error("Failed to load notifications:", err);
        }
    }

    function start() {
        if (!localStorage.getItem("authToken")) return;
        if (typeof DoDoPresence === "undefined") return;
        if (root) return;

        buildWidget();
        refresh();
        pollTimer = setInterval(refresh, POLL_INTERVAL_MS);
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") refresh();
        });
        window.addEventListener("beforeunload", () => {
            if (pollTimer) clearInterval(pollTimer);
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start);
    } else {
        start();
    }

    return { refresh, start, showToast };
})();
