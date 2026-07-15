const goBackBtn = document.getElementById("goBackBtn");
const conversationList = document.getElementById("conversationList");
const messagesLayout = document.querySelector(".messages-layout");
const threadBackBtn = document.getElementById("threadBackBtn");
const messagesTitle = document.querySelector(".messages-title");
const threadEmpty = document.getElementById("threadEmpty");
const threadActive = document.getElementById("threadActive");
const threadBuddyName = document.getElementById("threadBuddyName");
const threadBuddyMeta = document.getElementById("threadBuddyMeta");
const threadMessages = document.getElementById("threadMessages");
const messageForm = document.getElementById("messageForm");
const messageInput = document.getElementById("messageInput");
const sendMessageBtn = document.getElementById("sendMessageBtn");

let currentUser = null;
try {
    currentUser = JSON.parse(localStorage.getItem("loggedInUser"));
} catch (e) {
    currentUser = null;
}

let activeBuddyId = null;
let activeBuddyName = "";
let inboxPollTimer = null;
let threadPollTimer = null;
let lastRenderedMessageId = 0;

if (goBackBtn) {
    goBackBtn.addEventListener("click", () => {
        window.location.href = "directing.html";
    });
}

// On mobile the sidebar and thread swap; this returns to the buddy list.
function returnToConversationList() {
    if (messagesLayout) messagesLayout.classList.remove("thread-open");
    if (threadPollTimer) {
        clearInterval(threadPollTimer);
        threadPollTimer = null;
    }
    activeBuddyId = null;
}

if (threadBackBtn) {
    threadBackBtn.addEventListener("click", () => {
        returnToConversationList();
    });
}

// While in a conversation on mobile, tapping the "Messages" title banner
// returns to the buddy list.
if (messagesTitle) {
    messagesTitle.addEventListener("click", () => {
        if (
            window.matchMedia("(max-width: 600px)").matches &&
            messagesLayout &&
            messagesLayout.classList.contains("thread-open")
        ) {
            returnToConversationList();
        }
    });
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text == null ? "" : text;
    return div.innerHTML;
}

function renderConversations(conversations) {
    if (!conversations.length) {
        conversationList.innerHTML = '<li class="buddy-empty">No buddies yet. Add some on the Study Buddies page!</li>';
        return;
    }

    conversationList.innerHTML = conversations.map((conv) => {
        const preview = conv.lastMessage
            ? `${conv.lastMessage.fromMe ? "You: " : ""}${conv.lastMessage.body}`
            : "No messages yet";
        const unreadBadge = conv.unreadCount > 0
            ? `<span class="conversation-unread">${conv.unreadCount > 9 ? "9+" : conv.unreadCount}</span>`
            : "";
        const activeClass = conv.userId === activeBuddyId ? " conversation-item--active" : "";

        return `
        <li class="conversation-item${activeClass}" data-user-id="${conv.userId}" data-name="${escapeHtml(conv.name)}"
            data-username="${escapeHtml(conv.username)}">
            <div class="conversation-info">
                <strong>${escapeHtml(conv.name)}</strong>
                <span class="conversation-preview">${escapeHtml(preview)}</span>
            </div>
            ${unreadBadge}
        </li>`;
    }).join("");

    conversationList.querySelectorAll(".conversation-item").forEach((item) => {
        item.addEventListener("click", () => {
            openThread(
                parseInt(item.dataset.userId, 10),
                item.dataset.name,
                item.dataset.username
            );
        });
    });
}

async function loadConversations() {
    try {
        const response = await DoDoPresence.authFetch(apiUrl("/messages/conversations"));
        const data = await DoDoPresence.parseJsonResponse(response);
        if (response.ok) {
            renderConversations(data);
        }
    } catch (err) {
        console.error("Failed to load conversations:", err);
    }
}

function renderMessages(messages) {
    // Avoid clobbering the view if nothing new arrived
    const newest = messages.length ? messages[messages.length - 1].id : 0;
    const shouldScroll = newest !== lastRenderedMessageId;

    threadMessages.innerHTML = messages.map((msg) => `
        <div class="message-bubble ${msg.fromMe ? "message-bubble--me" : "message-bubble--them"}">
            <span class="message-body">${escapeHtml(msg.body)}</span>
        </div>
    `).join("");

    lastRenderedMessageId = newest;
    if (shouldScroll) {
        threadMessages.scrollTop = threadMessages.scrollHeight;
    }
}

async function loadThread() {
    if (!activeBuddyId) return;
    try {
        const response = await DoDoPresence.authFetch(apiUrl(`/messages/conversations/${activeBuddyId}`));
        const data = await DoDoPresence.parseJsonResponse(response);
        if (!response.ok) {
            console.error(data.message || "Failed to load thread");
            return;
        }
        renderMessages(data.messages);
    } catch (err) {
        console.error("Failed to load thread:", err);
    }
}

function openThread(userId, name, username) {
    activeBuddyId = userId;
    activeBuddyName = name;
    lastRenderedMessageId = 0;

    threadEmpty.style.display = "none";
    threadActive.style.display = "flex";
    if (messagesLayout) messagesLayout.classList.add("thread-open");
    threadBuddyName.textContent = name;
    threadBuddyMeta.textContent = username ? `@${username}` : "";
    threadMessages.innerHTML = "";

    // Highlight the active conversation
    conversationList.querySelectorAll(".conversation-item").forEach((item) => {
        item.classList.toggle(
            "conversation-item--active",
            parseInt(item.dataset.userId, 10) === userId
        );
    });

    loadThread().then(() => {
        // Reading the thread clears unread on the server; refresh inbox + bell
        loadConversations();
        if (typeof DoDoNotify !== "undefined") DoDoNotify.refresh();
    });

    if (threadPollTimer) clearInterval(threadPollTimer);
    threadPollTimer = setInterval(loadThread, 5000);
    messageInput.focus();
}

if (messageForm) {
    messageForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const body = messageInput.value.trim();
        if (!body || !activeBuddyId) return;

        sendMessageBtn.disabled = true;
        try {
            const response = await DoDoPresence.authFetch(apiUrl(`/messages/conversations/${activeBuddyId}`), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ body })
            });
            const data = await DoDoPresence.parseJsonResponse(response);
            if (!response.ok) {
                alert(data.message || "Could not send message");
                return;
            }
            messageInput.value = "";
            await loadThread();
            await loadConversations();
        } catch (err) {
            console.error("Failed to send message:", err);
            alert("Could not reach the server.");
        } finally {
            sendMessageBtn.disabled = false;
            messageInput.focus();
        }
    });
}

function getRequestedBuddyId() {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("user");
    const parsed = parseInt(raw, 10);
    return Number.isInteger(parsed) ? parsed : null;
}

document.addEventListener("DOMContentLoaded", () => {
    if (!localStorage.getItem("authToken") || (typeof isGuestSession === "function" && isGuestSession())) {
        window.location.href = typeof isGuestSession === "function" && isGuestSession()
            ? "directing.html"
            : "login.html";
        return;
    }

    DoDoPresence.startHeartbeat();

    loadConversations().then(() => {
        const requested = getRequestedBuddyId();
        if (requested) {
            const item = conversationList.querySelector(`.conversation-item[data-user-id="${requested}"]`);
            if (item) {
                openThread(requested, item.dataset.name, item.dataset.username);
            }
        }
    });

    inboxPollTimer = setInterval(loadConversations, 10000);
});

window.addEventListener("beforeunload", () => {
    if (inboxPollTimer) clearInterval(inboxPollTimer);
    if (threadPollTimer) clearInterval(threadPollTimer);
});
