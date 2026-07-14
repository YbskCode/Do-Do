const allTimersDisplays = document.querySelectorAll('.timer-display');
const allButtons = document.querySelectorAll('button[id$="-session"]');
const startButton = document.getElementById('start');
const alarmSound = document.getElementById('alarm-sound');
const stopAlarmBtn = document.getElementById('stop-alarm-btn');
const taskSelect = document.getElementById("activeTaskSelect");
const taskTimeDisplay = document.getElementById("taskTimeDisplay")
const timeSpentValue = document.getElementById("timeSpentValue");

const goBackBtn = document.getElementById("goBackBtn");

/** Flip the single control between go (play) and stop icons. */
function setTimerControlMode(mode) {
    if (!startButton) return;
    const isStop = mode === "stop";
    const label = isStop ? "Stop" : "Go";
    const icon = isStop ? "fa-stop" : "fa-play";
    startButton.dataset.mode = isStop ? "stop" : "go";
    startButton.title = label;
    startButton.setAttribute("aria-label", label);
    startButton.innerHTML = `<i class="fa-solid ${icon}" aria-hidden="true"></i>`;
    startButton.disabled = false;
    startButton.style.opacity = "1";
    startButton.style.pointerEvents = "auto";
}

if (goBackBtn) {
    goBackBtn.addEventListener("click", () => {
        // This mimics the browser's "Back" button
        window.location.href = "directing.html"
    });
}

//Get the current user to find their specific tasks
let currentUser = null;
try {
    currentUser = JSON.parse(localStorage.getItem("loggedInUser"));
} catch (e) {
    console.error("Error parsing loggedInUser from localStorage:", e);
    localStorage.removeItem("loggedInUser");
}

const guestMode = typeof isGuestSession === "function" && isGuestSession();

// Wrapper around fetch that attaches the auth token and handles expired sessions
async function authFetch(url, options = {}) {
    const token = localStorage.getItem("authToken");
    const headers = { ...(options.headers || {}), "Authorization": `Bearer ${token}` };
    const response = await fetch(url, { ...options, headers });
    if (response.status === 401) {
        localStorage.removeItem("loggedInUser");
        localStorage.removeItem("authToken");
        if (typeof GUEST_FLAG_KEY !== "undefined") {
            localStorage.removeItem(GUEST_FLAG_KEY);
        }
        window.location.href = "login.html";
    }
    return response;
}

let timerInterval = null;
let isRunning = false;
let endTime = null;

let currentTimerElement = document.getElementById('pomodoro-timer');
let timeLeft = parseInt(currentTimerElement.dataset.duration) * 60;

const POMODORO_MIN_MINUTES = 1;
const BREAK_MIN_MINUTES = 5;
const POMODORO_DURATION_KEY = 'pomodoroDurationMinutes';
const BREAK_DURATION_KEY = 'breakDurationMinutes';

const editDurationBtn = document.getElementById('editDurationBtn');
const durationModal = document.getElementById('durationModal');
const durationModalTitle = document.getElementById('durationModalTitle');
const durationModalInput = document.getElementById('durationModalInput');
const durationModalError = document.getElementById('durationModalError');
const closeDurationBtn = document.getElementById('closeDurationBtn');
const saveDurationBtn = document.getElementById('saveDurationBtn');

function getMinDurationForTimer(timerId) {
    return timerId === 'pomodoro-timer' ? POMODORO_MIN_MINUTES : BREAK_MIN_MINUTES;
}

function getStorageKeyForTimer(timerId) {
    return timerId === 'pomodoro-timer' ? POMODORO_DURATION_KEY : BREAK_DURATION_KEY;
}

function clampDuration(minutes, timerId) {
    const min = getMinDurationForTimer(timerId);
    const parsed = parseInt(minutes, 10);
    if (Number.isNaN(parsed)) return min;
    return Math.max(min, parsed);
}

function setTimerDuration(timerId, minutes) {
    const timerEl = document.getElementById(timerId);
    if (!timerEl) return;

    const validMinutes = clampDuration(minutes, timerId);
    timerEl.dataset.duration = validMinutes;
    localStorage.setItem(getStorageKeyForTimer(timerId), validMinutes);

    if (currentTimerElement.id === timerId && !isRunning) {
        timeLeft = validMinutes * 60;
        updateDisplay(timeLeft);
    }
}

function loadSavedDurations() {
    const savedPomodoro = localStorage.getItem(POMODORO_DURATION_KEY);
    const savedBreak = localStorage.getItem(BREAK_DURATION_KEY);

    setTimerDuration('pomodoro-timer', savedPomodoro ?? POMODORO_MIN_MINUTES);
    setTimerDuration('break-timer', savedBreak ?? BREAK_MIN_MINUTES);
}

function hideDurationModalError() {
    if (!durationModalError) return;
    durationModalError.style.display = 'none';
    durationModalError.textContent = '';
}

function showDurationModalError(message) {
    if (!durationModalError) return;
    durationModalError.textContent = message;
    durationModalError.style.display = 'block';
}

function openDurationModal() {
    if (!durationModal || !durationModalInput || isRunning) return;

    const isPomodoro = currentTimerElement.id === 'pomodoro-timer';
    const min = getMinDurationForTimer(currentTimerElement.id);
    const currentMinutes = parseInt(currentTimerElement.dataset.duration, 10);

    if (durationModalTitle) {
        durationModalTitle.textContent = isPomodoro ? 'Edit Pomodoro' : 'Edit Break';
    }

    durationModalInput.min = min;
    durationModalInput.value = currentMinutes;
    hideDurationModalError();
    durationModal.style.display = 'flex';
    durationModalInput.focus();
    durationModalInput.select();
}

function closeDurationModal() {
    if (!durationModal) return;
    durationModal.style.display = 'none';
    hideDurationModalError();
}

function saveDurationFromModal() {
    if (!durationModalInput || isRunning) return;

    const min = getMinDurationForTimer(currentTimerElement.id);
    const entered = parseInt(durationModalInput.value, 10);

    if (Number.isNaN(entered) || entered < min) {
        showDurationModalError(`Minimum ${min} minutes`);
        return;
    }

    setTimerDuration(currentTimerElement.id, entered);
    closeDurationModal();

    // Keep a waiting Study Together session in sync with the pomodoro duration
    const pendingHost = getPendingHostSession();
    if (pendingHost && currentTimerElement?.id === "pomodoro-timer") {
        syncPendingSessionDuration(pendingHost.id, entered);
    }
}

function setEditDurationEnabled(enabled) {
    if (editDurationBtn) {
        editDurationBtn.disabled = !enabled;
    }
}

loadSavedDurations();

if (editDurationBtn) {
    editDurationBtn.addEventListener('click', openDurationModal);
}

if (closeDurationBtn) {
    closeDurationBtn.addEventListener('click', closeDurationModal);
}

if (saveDurationBtn) {
    saveDurationBtn.addEventListener('click', saveDurationFromModal);
}

if (durationModal) {
    durationModal.addEventListener('click', (e) => {
        if (e.target === durationModal) {
            closeDurationModal();
        }
    });
}

if (durationModalInput) {
    durationModalInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            saveDurationFromModal();
        }
    });
}


//Load tasks into the dropdown
async function loadTasksIntoDropdown() {
    if (!currentUser) {
        return;
    }

    taskSelect.disabled = true;
    taskSelect.innerHTML = '<option value="">Loading tasks...</option>';

    try {
        const savedTasks = guestMode
            ? getGuestTasks()
            : await (async () => {
                const response = await authFetch(apiUrl("/tasks"));
                return response.json();
            })();

        // Clear existing options
        taskSelect.innerHTML = '<option value="">-- No Task Selected --</option>';

        savedTasks.forEach(task => {
            if (task.task_archived || task.task_completed) return;

            const option = document.createElement("option");
            option.value = task.id; // 👈 now using database ID instead of array index
            option.textContent = task.task_name; // 👈 updated field name
            option.dataset.timeSpent = task.time_spent; // 👈 updated field name

            taskSelect.appendChild(option);
        });

    } catch (err) {
        console.error("Failed to load tasks into dropdown:", err);
    } finally {
        // Always re-enable dropdown when done
        taskSelect.disabled = false;
    }
};

loadTasksIntoDropdown();

taskSelect.addEventListener("change", (e) => {
    const selectedOption = taskSelect.options[taskSelect.selectedIndex];

    if (taskSelect.value === "") {
        //If they select the default, hide the time
        taskTimeDisplay.style.display = "none";
    } else {
        //Show the time spent for the chosen task
        taskTimeDisplay.style.display = "block";

        //Grab the time data we attached to the option
        const minutesSpent = selectedOption.dataset.timeSpent || 0;
        timeSpentValue.textContent = minutesSpent;
    }
});

async function addTimeToSelectedTask() {
    const selectedTaskId = taskSelect.value;

    if (selectedTaskId === "") return;
    if (!currentUser) return;

    const minutesCompleted = parseInt(currentTimerElement.dataset.duration);

    // Get current time spent from the selected option
    const selectedOption = taskSelect.options[taskSelect.selectedIndex];
    const currentTimeSpent = parseInt(selectedOption.dataset.timeSpent) || 0;
    const newTimeSpent = currentTimeSpent + minutesCompleted;



    try {
        if (guestMode) {
            const tasks = getGuestTasks();
            const index = tasks.findIndex((t) => String(t.id) === String(selectedTaskId));
            if (index !== -1) {
                tasks[index].time_spent = newTimeSpent;
                saveGuestTasks(tasks);
            }
        } else {
            // Update time_spent in database
            await authFetch(apiUrl(`/tasks/${selectedTaskId}`), {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    task_name: selectedOption.textContent,
                    task_completed: false,
                    time_spent: newTimeSpent
                })
            });
        }

        // Refresh dropdown
        await loadTasksIntoDropdown();

        // Keep the same task selected
        taskSelect.value = selectedTaskId;

        // Update the time display
        if (timeSpentValue) {
            timeSpentValue.textContent = newTimeSpent;
        }

    } catch (err) {
        console.error("Failed to update time:", err);
    }
}

/**
 * Updates the text content of the currently active timer display.
 * @param {number} timeInSeconds - The time to display.
 */
function updateDisplay(timeInSeconds) {
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = timeInSeconds % 60;

    // Add leading zeros (e.g., "5:9" becomes "05:09")
    const formattedTime =
        `${minutes < 10 ? '0' : ''}${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

    currentTimerElement.textContent = formattedTime;

    // Tab Title Feature for #5 issue. 
    document.title = `(${formattedTime}) Do!Do!`;
}


/**
 * Stops any running timer and resets the control to Go.
 */
function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
    }
    isRunning = false;
    setTimerControlMode("go");

    setEditDurationEnabled(true);

    if (typeof DoDoPresence !== "undefined") {
        DoDoPresence.syncFromTimer(false, currentTimerElement?.id);
    }
}


/**
 * Hides all timers and shows only the target element.
 * @param {string} targetElementId - The ID of the timer element to show.
 */
function showOnly(targetElementId) {
    // 1. Stop the current timer before switching
    stopTimer();

    // 2. Hide all timer elements
    allTimersDisplays.forEach(timer => {
        timer.style.display = "none";
    });

    // 3. Find and display the specific timer
    const targetTimer = document.getElementById(targetElementId);
    if (targetTimer) {
        targetTimer.style.display = "block";
        currentTimerElement = targetTimer; // Update the global target reference

        // 4. Reset timeLeft to the new timer's initial duration
        timeLeft = parseInt(currentTimerElement.dataset.duration) * 60;
        updateDisplay(timeLeft);
    }
}

// --- Countdown Logic (Starting) ---

/**
 * The core function executed every second.
 */
function countdown() {

    // 1. Calculate the REAL time left by comparing Now vs. Target
    const now = Date.now();
    const secondsLeft = Math.ceil((endTime - now) / 1000);

    // 2. Sync it with your global variable so the pause button still works
    timeLeft = secondsLeft;


    if (timeLeft <= 0) {

        // Update the task before stopping the timer but only if it is pomodoro timeri
        if (currentTimerElement.id === "pomodoro-timer") {

            addTimeToSelectedTask();
            if (!guestMode) {
                recordStreakCompletion();
            }

        }
        

        stopTimer(); // Clear interval and reset state
        updateDisplay(0);

        alarmSound.play();

        stopAlarmBtn.style.display = "block";

        startButton.style.display = "none";

        return;
    }

    // Decrease time and update display
    updateDisplay(timeLeft);
}

/**
 * Initializes and starts the countdown for the currently selected timer.
 */
async function startCountdown() {
    // In a shared session the START/RESUME button controls the shared timer for everyone
    if (activeSharedSessionId) {
        resumeSharedSession();
        return;
    }

    // Host starts Study Together by pressing the normal Go button
    const pendingHost = getPendingHostSession();
    if (pendingHost) {
        await startPendingSharedSession(pendingHost.id);
        return;
    }

    // Guests waiting for the host should not start a solo timer
    const pendingJoined = getPendingJoinedSession();
    if (pendingJoined && !pendingJoined.isHost) {
        return;
    }

    if (isRunning) {
        return; // Already running
    }

    // --- NEW LOGIC START ---
    // Calculate exactly when the timer should end based on current timeLeft
    // Date.now() gives milliseconds, so we multiply timeLeft by 1000
    endTime = Date.now() + (timeLeft * 1000);
    // --- NEW LOGIC END ---

    // Set state and flip control to Stop
    isRunning = true;
    setTimerControlMode("stop");

    setEditDurationEnabled(false);

    if (typeof DoDoPresence !== "undefined") {
        const taskName = taskSelect?.selectedOptions?.[0]?.textContent?.trim() || null;
        DoDoPresence.syncFromTimer(true, currentTimerElement.id, endTime, taskName);
    }

    // Start the interval
    timerInterval = setInterval(countdown, 1000);
}

function pauseCountdown() {
    // In a shared session, stopping freezes the timer for every participant
    if (activeSharedSessionId) {
        pauseSharedSession();
        return;
    }
    stopTimer();
}

function handleTimerControlClick() {
    if (isRunning) {
        pauseCountdown();
    } else {
        startCountdown();
    }
}

function dismissAlarm() {
    // 1. Pause the audio
    alarmSound.pause();

    // 2. Rewind audio to the start (so it's ready for next time)
    alarmSound.currentTime = 0;

    // 3. Hide the Stop Alarm button
    stopAlarmBtn.style.display = "none";

    // 4. Show the toggle control again
    startButton.style.display = "";
    setTimerControlMode("go");

    // 5. Reset the timer value (rewind the clock)
    timeLeft = parseInt(currentTimerElement.dataset.duration) * 60;
    updateDisplay(timeLeft);
    setEditDurationEnabled(true);
}

// --- Event Handlers ---

// 1. Attach listener to all Display buttons (Switching logic)
allButtons.forEach(button => {
    button.addEventListener("click", (event) => {
        const targetId = event.currentTarget.dataset.targetId;
        showOnly(targetId);
    })
});

// 2. Single go / stop toggle
if (startButton) {
    startButton.addEventListener('click', handleTimerControlClick);
}

updateDisplay(timeLeft);

// Don't forget to listen for the click!
if (stopAlarmBtn) {
    stopAlarmBtn.addEventListener('click', dismissAlarm);
}

// Analytics *Start*
document.addEventListener("DOMContentLoaded", () => {
    const openAnalyticsBtn = document.getElementById("openAnalyticsBtn");
    const closeAnalyticsBtn = document.getElementById("closeAnalyticsBtn");
    const analyticsModal = document.getElementById("analyticsModal");

    // 🕵️ DEBUGGING: Let's ask the browser what it found
    console.log("Open Button:", openAnalyticsBtn);
    console.log("Close Button:", closeAnalyticsBtn);
    console.log("Modal:", analyticsModal);

    if (openAnalyticsBtn && closeAnalyticsBtn && analyticsModal) {
        // Open the modal
        openAnalyticsBtn.addEventListener('click', (e) => {
            e.preventDefault(); // Good practice: stops any weird button defaults

            // Show modal immediately with loading state
            analyticsModal.style.display = "flex";

            // Disable button while loading
            openAnalyticsBtn.disabled = true;
            openAnalyticsBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

            generateAnalytics().finally(() => {
                // Re-enable button when done
                openAnalyticsBtn.disabled = false;
                openAnalyticsBtn.innerHTML = '<i class="fa-solid fa-chart-simple"></i>';

            })

            analyticsModal.style.display = 'flex';
        });

        closeAnalyticsBtn.addEventListener('click', () => {
            analyticsModal.style.display = 'none';
        });

        analyticsModal.addEventListener('click', (e) => {
            if (e.target === analyticsModal) {
                analyticsModal.style.display = 'none';
            }
        });
    } else {
        // If one of them is missing, it will shout at us in red!
        console.error("🚨 ERROR: One of the Analytics elements is missing from the DOM!");
    }
});


// Variable to remember the chart so we can erase it and redraw it cleanly
let focusChartInstance = null;

async function generateAnalytics() {
    if (!currentUser) return;

    const spinner = document.getElementById("analyticsLoadingSpinner");
    const canvas = document.getElementById("focusChart");
    const guestPrompt = document.getElementById("analyticsGuestPrompt");
    const registeredContent = document.getElementById("analyticsRegisteredContent");

    if (guestMode) {
        if (spinner) spinner.style.display = "none";
        if (registeredContent) registeredContent.style.display = "none";
        if (guestPrompt) guestPrompt.style.display = "flex";
        return;
    }

    if (guestPrompt) guestPrompt.style.display = "none";
    if (registeredContent) registeredContent.style.display = "block";

    // Show spinner hide chart
    if (spinner) spinner.style.display = "flex";
    if (canvas) canvas.style.display = "none";

    try {
        const response = await authFetch(apiUrl("/analytics"));
        const { totalFocusMinutes, tasks: savedTasks } = await response.json();

        const taskNames = [];
        const taskTimes = [];

        let maxTaskName = "No tasks yet";
        let maxTaskTime = 0;

        savedTasks.forEach(task => {
            const time = parseInt(task.time_spent) || 0;

            if (time > 0) {
                taskNames.push(task.task_name);
                taskTimes.push(time);
            }

            if (time > maxTaskTime) {
                maxTaskTime = time;
                maxTaskName = task.task_name;
            }
        });

        // Top 5 logic
        const combined = taskNames.map((name, i) => ({ name, time: taskTimes[i] }));
        combined.sort((a, b) => b.time - a.time);
        const top5 = combined.slice(0, 5);
        const chartNames = top5.map(t => t.name);
        const chartTimes = top5.map(t => t.time);

        // Update KPI scoreboards
        const totalDisplay = document.getElementById("totalFocusTimeDisplay");
        if (totalDisplay) {
            totalDisplay.textContent = `${totalFocusMinutes} minute${totalFocusMinutes === 1 ? '' : 's'}`;
        }

        const mostTimeDisplay = document.getElementById("mostTimeSpentTask");
        const mostTimeDisplayTime = document.getElementById("mostTimeSpentTaskTime");
        if (mostTimeDisplay) {
            if (maxTaskTime > 0) {
                mostTimeDisplay.textContent = `Task Name: ${maxTaskName}`;
                mostTimeDisplayTime.textContent = `Task Duration: ${maxTaskTime} minutes`;
            } else {
                mostTimeDisplay.textContent = "No tasks yet";
            }
        }

        // Draw chart
        if (!canvas) return;

        const ctx = canvas.getContext("2d");

        if (focusChartInstance) {
            focusChartInstance.destroy();
        }

        focusChartInstance = new Chart(ctx, {
            type: "bar",
            data: {
                labels: chartNames,
                datasets: [{
                    label: "Minutes Focused",
                    data: chartTimes,
                    backgroundColor: "rgb(222, 134, 124, 0.5)",
                    borderColor: "rgb(222, 134, 124, 1)",
                    borderWidth: 1,
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: "rgb(255, 255, 255, 0.1)" },
                        ticks: { color: "#e0e0e0", stepSize: 5 }
                    },
                    x: {
                        grid: { display: false },
                        ticks: {
                            color: "#e0e0e0",
                            maxRotation: 0,
                            minRotation: 0,
                            callback: function (value) {
                                const label = this.getLabelForValue(value);
                                return label.length > 12 ? label.substring(0, 12) + "..." : label;
                            }
                        }
                    }
                },
                plugins: {
                    legend: { display: false }
                }
            }
        });

    } catch (err) {
        console.error("Failed to generate analytics:", err);
    } finally {
        // Always hide spinner and show chart when it is done
        if (spinner) spinner.style.display = "none";
        if (canvas) canvas.style.display = "block";
    }
}


// Activated Timer
const pomodoroTimerBtn = document.getElementById("pomodoro-session");
const breakBtn = document.getElementById("break-session");

const activeTimerBtn = (clickedButton) => {

    // Remove activeFilter class from every button
    allButtons.forEach(btn => btn.classList.remove("activeFilter"));

    // Add activeFilter class only to recently clicked button
    clickedButton.classList.add("activeFilter");
}

if (pomodoroTimerBtn && breakBtn) {
    pomodoroTimerBtn.addEventListener("click", () => activeTimerBtn(pomodoroTimerBtn));
    breakBtn.addEventListener("click", () => activeTimerBtn(breakBtn));
}

// Record streak/focus minutes when a pomodoro finishes (UI lives on directing.html)
async function recordStreakCompletion() {
    if (!currentUser || guestMode) return;

    const pomodoroTimer = document.getElementById("pomodoro-timer");
    const minutes = parseInt(pomodoroTimer?.dataset.duration) || 25;

    try {
        await authFetch(apiUrl("/streak/complete"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ minutes })
        });
    } catch (err) {
        console.error("Failed to record streak:", err);
    }
}

// --- Focus Mode ---
const focusModeBtn = document.getElementById("focusModeBtn");
const focusModeContainer = document.querySelector(".focusModeContainer");
const pomodoroLeftPanel = document.querySelector(".pomodoroLeftPanel");
const FOCUS_MODE_KEY = "pomodoroFocusMode";

function setFocusMode(enabled) {
    document.body.classList.toggle("focus-mode", enabled);
    localStorage.setItem(FOCUS_MODE_KEY, enabled ? "true" : "false");

    if (focusModeContainer && pomodoroLeftPanel) {
        if (enabled) {
            document.body.appendChild(focusModeContainer);
        } else {
            pomodoroLeftPanel.insertBefore(focusModeContainer, pomodoroLeftPanel.firstChild);
        }
    }

    if (focusModeBtn) {
        focusModeBtn.innerHTML = enabled
            ? '<i class="fa-solid fa-xmark"></i> Exit Focus Mode'
            : '<i class="fa-solid fa-bullseye"></i> Focus Mode';
    }
}

if (focusModeBtn) {
    focusModeBtn.addEventListener("click", () => {
        setFocusMode(!document.body.classList.contains("focus-mode"));
    });

    if (localStorage.getItem(FOCUS_MODE_KEY) === "true") {
        setFocusMode(true);
    }
}

if (typeof DoDoPresence !== "undefined" && localStorage.getItem("authToken") && !guestMode) {
    DoDoPresence.startHeartbeat();
}

function applyGuestPomodoroRestrictions() {
    if (!guestMode) return;

    const studyTogether = document.querySelector(".studyTogetherContainer");
    if (studyTogether) studyTogether.style.display = "none";

    const sessionModal = document.getElementById("sessionModal");
    if (sessionModal) sessionModal.style.display = "none";

    const analyticsLoginBtn = document.getElementById("analyticsLoginBtn");
    if (analyticsLoginBtn) {
        analyticsLoginBtn.addEventListener("click", () => {
            if (typeof clearGuestSession === "function") {
                clearGuestSession();
            } else {
                localStorage.removeItem("isGuest");
                localStorage.removeItem("loggedInUser");
                localStorage.removeItem("authToken");
            }
            window.location.href = "login.html";
        });
    }
}

applyGuestPomodoroRestrictions();

// --- Shared Study Session sync + management (pomodoro is the control surface) ---
// Host creates/invites/starts/ends here. Guests leave without affecting others.
// Mid-join after the countdown starts is blocked on the backend.
// Unavailable in guest mode.

let activeSharedSessionId = null;
let sharedSessionBanner = null;
let sharedPauseInFlight = false;
let sessionBuddies = [];
let invitingSessionId = null;
let knownMineSessions = [];

const sessionsList = document.getElementById("sessionsList");
const newSessionBtn = document.getElementById("newSessionBtn");
const sessionModal = document.getElementById("sessionModal");
const sessionModalTitle = document.getElementById("sessionModalTitle");
const closeSessionBtn = document.getElementById("closeSessionBtn");
const sessionLabelInput = document.getElementById("sessionLabelInput");
const sessionDurationInput = document.getElementById("sessionDurationInput");
const sessionBuddyPicker = document.getElementById("sessionBuddyPicker");
const sessionBuddyField = document.getElementById("sessionBuddyField");
const sessionBuddyFieldLabel = document.getElementById("sessionBuddyFieldLabel");
const sessionLabelField = document.getElementById("sessionLabelField");
const sessionDurationField = document.getElementById("sessionDurationField");
const sessionModalError = document.getElementById("sessionModalError");
const createSessionBtn = document.getElementById("createSessionBtn");

const SESSION_STATUS_LABELS = {
    pending: "Waiting to start",
    active: "In progress"
};

function escapeSessionHtml(text) {
    return String(text ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function ensureSharedSessionBanner() {
    if (sharedSessionBanner) return sharedSessionBanner;
    const app = document.querySelector(".pomodoroApp");
    if (!app) return null;
    sharedSessionBanner = document.createElement("div");
    sharedSessionBanner.className = "sharedSessionBanner focus-mode-content";
    sharedSessionBanner.style.display = "none";
    app.insertBefore(sharedSessionBanner, app.firstChild);
    return sharedSessionBanner;
}

function showSharedSessionBanner(session) {
    const banner = ensureSharedSessionBanner();
    if (!banner) return;

    const others = session.participants
        .filter((p) => p.status === "joined")
        .map((p) => (p.isHost ? `${p.name} (host)` : p.name));

    const prefix = session.label ? `${session.label} · ` : "";
    let statusNote = "";
    if (session.status === "pending") {
        statusNote = session.isHost ? " · Waiting to start" : " · Waiting for host";
    } else if (session.isPaused) {
        statusNote = " · Paused";
    }

    banner.classList.toggle("sharedSessionBanner--paused", !!session.isPaused || session.status === "pending");
    banner.innerHTML = "";

    const textWrap = document.createElement("div");
    textWrap.className = "sharedSessionBannerText";
    textWrap.innerHTML = `<i class="fa-solid ${session.isPaused || session.status === "pending" ? "fa-pause" : "fa-people-group"}"></i>`;
    const span = document.createElement("span");
    span.textContent = `${prefix}Studying with ${others.join(", ") || "your buddies"}${statusNote}`;
    textWrap.appendChild(span);
    banner.appendChild(textWrap);

    const actions = document.createElement("div");
    actions.className = "sharedSessionBannerActions";

    if (session.isHost) {
        const endBtn = document.createElement("button");
        endBtn.type = "button";
        endBtn.className = "session-end-btn";
        endBtn.textContent = "End session";
        endBtn.addEventListener("click", () => handleSessionAction("cancel", session.id, endBtn));
        actions.appendChild(endBtn);
    } else {
        const leaveBtn = document.createElement("button");
        leaveBtn.type = "button";
        leaveBtn.className = "session-leave-btn";
        leaveBtn.textContent = "Leave";
        leaveBtn.addEventListener("click", () => handleSessionAction("leave", session.id, leaveBtn));
        actions.appendChild(leaveBtn);
    }

    banner.appendChild(actions);
    banner.style.display = "flex";
}

function hideSharedSessionBanner() {
    if (sharedSessionBanner) sharedSessionBanner.style.display = "none";
}

function getMySessionStatus(session) {
    if (session.myStatus) return session.myStatus;
    const mine = session.participants?.find(
        (p) => Number(p.userId) === Number(currentUser?.id)
    );
    return mine?.status || null;
}

function renderSessionButtons(session) {
    const buttons = [];
    const myStatus = getMySessionStatus(session);

    if (session.isHost) {
        if (session.status === "pending") {
            buttons.push(`<button class="session-edit-btn" data-session-action="invite" data-session-id="${session.id}">Invite</button>`);
        }
        buttons.push(`<button class="session-leave-btn" data-session-action="cancel" data-session-id="${session.id}">End</button>`);
    } else if (myStatus === "invited" && session.status === "pending") {
        // Must explicitly accept before becoming a joined participant
        buttons.push(`<button class="session-start-btn" data-session-action="join" data-session-id="${session.id}">Accept</button>`);
        buttons.push(`<button class="session-leave-btn" data-session-action="decline" data-session-id="${session.id}">Decline</button>`);
    } else if (myStatus === "joined" && (session.status === "pending" || session.status === "active")) {
        buttons.push(`<button class="session-leave-btn" data-session-action="leave" data-session-id="${session.id}">Leave</button>`);
    }

    return buttons.join("");
}

function renderSessions(sessions) {
    if (!sessionsList) return;
    knownMineSessions = sessions;

    if (!sessions.length) {
        sessionsList.innerHTML = '<li class="buddy-empty">No study sessions yet. Create one to focus with buddies.</li>';
        return;
    }

    sessionsList.innerHTML = sessions.map((session) => {
        const myStatus = getMySessionStatus(session);
        const joined = session.participants.filter((p) => p.status === "joined");
        const invited = session.participants.filter((p) => p.status === "invited");
        const names = joined.map((p) => escapeSessionHtml(p.isHost ? `${p.name} (host)` : p.name)).join(", ");
        const statusLabel = myStatus === "invited"
            ? "Invite pending"
            : (SESSION_STATUS_LABELS[session.status] || session.status);
        const title = session.label ? escapeSessionHtml(session.label) : "Study session";

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

async function handleSessionAction(action, sessionId, btn) {
    if (action === "invite") {
        await loadSessionBuddies();
        openSessionModalForInvite(sessionId);
        return;
    }
    if (action === "cancel" && !confirm("End this study session for everyone?")) return;
    if (action === "leave" && !confirm("Leave this study session?")) return;
    if (action === "decline" && !confirm("Decline this study session invite?")) return;

    if (btn) btn.disabled = true;
    try {
        const response = await authFetch(apiUrl(`/sessions/${sessionId}/${action}`), { method: "PUT" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            alert(data.message || "Session action failed");
            if (btn) btn.disabled = false;
            return;
        }

        if (action === "cancel" || action === "leave" || action === "decline") {
            if (String(activeSharedSessionId) === String(sessionId)) {
                clearActiveSession();
            }
            hideSharedSessionBanner();
        }

        await loadMineSessions();
        await pollActiveSession();

        if (typeof DoDoNotify !== "undefined" && typeof DoDoNotify.refresh === "function") {
            DoDoNotify.refresh();
        }
    } catch (err) {
        console.error("Session action failed:", err);
        if (btn) btn.disabled = false;
    }
}

function getPendingJoinedSession() {
    return knownMineSessions.find((s) =>
        s.status === "pending" && getMySessionStatus(s) === "joined"
    ) || null;
}

function getPendingHostSession() {
    const session = getPendingJoinedSession();
    return session?.isHost ? session : null;
}

async function syncPendingSessionDuration(sessionId, durationMinutes) {
    try {
        const response = await authFetch(apiUrl(`/sessions/${sessionId}`), {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ durationMinutes })
        });
        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            console.error("Failed to sync session duration:", data.message || response.status);
            return;
        }
        await loadMineSessions();
    } catch (err) {
        console.error("Failed to sync session duration:", err);
    }
}

async function startPendingSharedSession(sessionId) {
    try {
        const durationMinutes = parseInt(currentTimerElement?.dataset.duration, 10);
        if (!Number.isNaN(durationMinutes)) {
            const updateResponse = await authFetch(apiUrl(`/sessions/${sessionId}`), {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ durationMinutes })
            });
            if (!updateResponse.ok) {
                const data = await updateResponse.json().catch(() => ({}));
                alert(data.message || "Could not update session duration before starting.");
                return;
            }
        }

        const response = await authFetch(apiUrl(`/sessions/${sessionId}/start`), { method: "PUT" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            alert(data.message || "Could not start the study session.");
            return;
        }

        await pollActiveSession();
        await loadMineSessions();
    } catch (err) {
        console.error("Failed to start shared session:", err);
        alert("Could not reach the server to start the study session.");
    }
}

async function loadMineSessions() {
    if (!currentUser || !sessionsList) return;
    try {
        const response = await authFetch(apiUrl("/sessions/mine"));
        const data = await response.json();
        if (!response.ok) return;

        renderSessions(data);

        // Only after Accept (joined) — invited users must not enter the waiting room yet
        const pendingJoined = data.find((s) =>
            s.status === "pending" && getMySessionStatus(s) === "joined"
        );
        if (pendingJoined && !activeSharedSessionId) {
            showSharedSessionBanner(pendingJoined);
            // Host can still edit duration before pressing Go; guests wait
            setEditDurationEnabled(!!pendingJoined.isHost);
            const pomodoroEl = document.getElementById("pomodoro-timer");
            if (pomodoroEl) {
                pomodoroEl.dataset.duration = pendingJoined.durationMinutes;
                if (currentTimerElement === pomodoroEl && !isRunning) {
                    timeLeft = pendingJoined.durationMinutes * 60;
                    updateDisplay(timeLeft);
                }
            }
        } else if (!activeSharedSessionId && !pendingJoined) {
            hideSharedSessionBanner();
        }
    } catch (err) {
        console.error("Failed to load sessions:", err);
    }
}

async function loadSessionBuddies() {
    try {
        const response = await authFetch(apiUrl("/buddies"));
        const data = await response.json();
        if (response.ok && Array.isArray(data)) {
            sessionBuddies = data;
        }
    } catch (err) {
        console.error("Failed to load buddies for invites:", err);
    }
}

function renderBuddyPicker(excludeIds = []) {
    if (!sessionBuddyPicker) return;
    const exclude = new Set(excludeIds.map(Number));
    const available = sessionBuddies.filter((buddy) => !exclude.has(Number(buddy.id)));

    if (!available.length) {
        sessionBuddyPicker.innerHTML = '<p class="buddy-empty">No buddies available to invite.</p>';
        return;
    }

    sessionBuddyPicker.innerHTML = available.map((buddy) => `
        <label class="session-buddy-option">
            <input type="checkbox" value="${buddy.id}">
            <span>${escapeSessionHtml(buddy.name)} <span class="buddy-meta">@${escapeSessionHtml(buddy.username)}</span></span>
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

function setSessionModalMode(mode) {
    const isInvite = mode === "invite";
    if (sessionLabelField) sessionLabelField.style.display = isInvite ? "none" : "";
    if (sessionDurationField) sessionDurationField.style.display = isInvite ? "none" : "";
    if (sessionBuddyField) sessionBuddyField.style.display = "";
    if (sessionBuddyFieldLabel) {
        sessionBuddyFieldLabel.textContent = isInvite ? "Invite more buddies" : "Invite buddies";
    }
    if (sessionModalTitle) {
        sessionModalTitle.textContent = isInvite ? "Invite Buddies" : "New Study Session";
    }
    if (createSessionBtn) {
        createSessionBtn.textContent = isInvite ? "Send Invites" : "Create Session";
    }
}

function openSessionModalForCreate() {
    invitingSessionId = null;
    hideSessionModalError();
    if (sessionLabelInput) sessionLabelInput.value = "";
    if (sessionDurationInput) sessionDurationInput.value = 25;
    setSessionModalMode("create");
    renderBuddyPicker();
    if (sessionModal) sessionModal.style.display = "flex";
}

function openSessionModalForInvite(sessionId) {
    hideSessionModalError();
    authFetch(apiUrl(`/sessions/${sessionId}`))
        .then((r) => r.json())
        .then((session) => {
            if (!session || !session.id) return;
            if (session.status !== "pending") {
                alert("Invites are only allowed before the session starts.");
                return;
            }
            invitingSessionId = session.id;
            const alreadyIn = session.participants
                .filter((p) => p.status === "joined" || p.status === "invited")
                .map((p) => p.userId);
            setSessionModalMode("invite");
            renderBuddyPicker(alreadyIn);
            if (sessionModal) sessionModal.style.display = "flex";
        })
        .catch((err) => console.error("Failed to load session for invite:", err));
}

function closeSessionModal() {
    if (sessionModal) sessionModal.style.display = "none";
    invitingSessionId = null;
}

async function submitSession() {
    createSessionBtn.disabled = true;
    hideSessionModalError();

    try {
        let response;

        if (invitingSessionId) {
            const buddyIds = Array.from(
                sessionBuddyPicker.querySelectorAll("input[type=checkbox]:checked")
            ).map((cb) => parseInt(cb.value, 10));

            if (!buddyIds.length) {
                showSessionModalError("Select at least one buddy to invite.");
                return;
            }

            response = await authFetch(apiUrl(`/sessions/${invitingSessionId}/invite`), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ buddyIds })
            });
        } else {
            const duration = parseInt(sessionDurationInput.value, 10);
            if (Number.isNaN(duration) || duration < 25 || duration > 180) {
                showSessionModalError("Duration must be between 25 and 180 minutes.");
                return;
            }
            const label = sessionLabelInput.value.trim();
            const buddyIds = Array.from(
                sessionBuddyPicker.querySelectorAll("input[type=checkbox]:checked")
            ).map((cb) => parseInt(cb.value, 10));

            response = await authFetch(apiUrl("/sessions"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ label, durationMinutes: duration, buddyIds })
            });
        }

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            showSessionModalError(data.message || "Could not save session.");
            return;
        }

        closeSessionModal();
        await loadMineSessions();
    } catch (err) {
        console.error("Failed to save session:", err);
        showSessionModalError("Could not reach the server.");
    } finally {
        createSessionBtn.disabled = false;
    }
}

if (newSessionBtn) {
    newSessionBtn.addEventListener("click", async () => {
        await loadSessionBuddies();
        openSessionModalForCreate();
    });
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

// Timer is live: sync the local countdown to the shared server end time
function applyRunningSession(session) {
    endTime = new Date(session.endsAt).getTime();
    timeLeft = Math.ceil((endTime - Date.now()) / 1000);
    if (timeLeft <= 0) return;

    if (!isRunning) {
        isRunning = true;
        if (timerInterval) clearInterval(timerInterval);
        timerInterval = setInterval(countdown, 1000);

        if (typeof DoDoPresence !== "undefined") {
            DoDoPresence.syncFromTimer(true, "pomodoro-timer", endTime, session.label || null);
        }
    }

    setTimerControlMode("stop");

    updateDisplay(Math.max(0, timeLeft));
}

// Timer is frozen for everyone: stop counting and hold the remaining time
function applyPausedSession(session) {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    isRunning = false;
    timeLeft = session.secondsRemaining;
    updateDisplay(Math.max(0, timeLeft));

    setTimerControlMode("go");
}

function handleActiveSession(session) {
    // Don't let a poll restart the timer while a pause request is in flight
    if (sharedPauseInFlight && !session.isPaused) {
        showSharedSessionBanner({ ...session, isPaused: true });
        setEditDurationEnabled(false);
        activeSharedSessionId = session.id;
        return;
    }

    showSharedSessionBanner(session);
    setEditDurationEnabled(false);

    const isNewSession = activeSharedSessionId !== session.id;
    activeSharedSessionId = session.id;

    if (isNewSession) {
        const pomodoroEl = document.getElementById("pomodoro-timer");
        if (currentTimerElement !== pomodoroEl) {
            showOnly("pomodoro-timer");
        }
        pomodoroEl.dataset.duration = session.durationMinutes;
    }

    if (session.isPaused) {
        applyPausedSession(session);
    } else {
        applyRunningSession(session);
    }
}

function clearActiveSession() {
    if (activeSharedSessionId === null) return;
    activeSharedSessionId = null;
    hideSharedSessionBanner();
    if (isRunning) {
        stopTimer();
    }
    setEditDurationEnabled(true);
    setTimerControlMode("go");
}

function freezeLocalSharedTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    isRunning = false;
    if (endTime) {
        timeLeft = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
    }
    updateDisplay(Math.max(0, timeLeft));

    setTimerControlMode("go");
}

async function pauseSharedSession() {
    if (!activeSharedSessionId) return;

    // Freeze this client immediately so STOP always feels responsive
    sharedPauseInFlight = true;
    freezeLocalSharedTimer();

    try {
        const response = await authFetch(apiUrl(`/sessions/${activeSharedSessionId}/pause`), { method: "PUT" });
        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            console.error("Pause failed:", data.message || response.status);
            alert(data.message || "Could not pause the shared session. Deploy the latest backend and run railway-sessions-pause.sql on Railway.");
            sharedPauseInFlight = false;
            await pollActiveSession();
            return;
        }
        sharedPauseInFlight = false;
        await pollActiveSession();
    } catch (err) {
        console.error("Failed to pause session:", err);
        alert("Could not reach the server to pause the shared session.");
        sharedPauseInFlight = false;
        await pollActiveSession();
    }
}

async function resumeSharedSession() {
    if (!activeSharedSessionId) return;
    try {
        const response = await authFetch(apiUrl(`/sessions/${activeSharedSessionId}/resume`), { method: "PUT" });
        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            console.error("Resume failed:", data.message || response.status);
            alert(data.message || "Could not resume the shared session. Deploy the latest backend and run the pause migration on Railway.");
            return;
        }
        await pollActiveSession();
    } catch (err) {
        console.error("Failed to resume session:", err);
        alert("Could not reach the server to resume the shared session.");
    }
}

async function pollActiveSession() {
    if (!currentUser) return;
    try {
        const response = await authFetch(apiUrl("/sessions/active"));
        const session = await response.json();
        if (response.ok && session) {
            handleActiveSession(session);
        } else if (activeSharedSessionId !== null) {
            clearActiveSession();
        }
    } catch (err) {
        console.error("Failed to poll active session:", err);
    }
}

if (currentUser && !guestMode) {
    loadSessionBuddies();
    loadMineSessions();
    pollActiveSession();
    // Poll frequently so a pause/resume by one member freezes the timer for all quickly
    setInterval(pollActiveSession, 4000);
    setInterval(loadMineSessions, 8000);
}

// Let the notification widget refresh this page's session list after join/decline
window.loadBuddyData = () => {
    if (guestMode) return;
    loadMineSessions();
    pollActiveSession();
};