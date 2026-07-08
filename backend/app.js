require("dotenv").config();
const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

// Cost factor for bcrypt hashing
const SALT_ROUNDS = 10;

const app = express();
app.use(express.json());
app.use(cors());

// Secret used to sign/verify JWTs. MUST be set in .env for production.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.warn("WARNING: JWT_SECRET is not set in .env. Using an insecure development fallback.");
}
const ACTIVE_JWT_SECRET = JWT_SECRET || "dev-only-insecure-secret-change-me";

// Verifies the Bearer token and attaches the decoded user to req.user
function authenticateToken(req, res, next) {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.startsWith("Bearer ")
        ? authHeader.slice(7)
        : null;

    if (!token) {
        return res.status(401).json({ message: "Authentication required" });
    }

    jwt.verify(token, ACTIVE_JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(401).json({ message: "Invalid or expired token" });
        }
        req.user = user;
        next();
    });
}

// Database connection
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

db.connect((err) => {
    if (err) {
        console.error("Database connection failed:", err);
        return;
    }
    console.log("Connected to Do-Do database!");
});

function formatLocalDate(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function addDays(date, days) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
}

function formatDbDate(value) {
    if (!value) return null;
    if (value instanceof Date) {
        return formatLocalDate(value);
    }
    return String(value).slice(0, 10);
}

function getEffectiveCurrentStreak(currentStreak, lastStreakDate) {
    const lastDate = formatDbDate(lastStreakDate);
    if (!lastDate) {
        return 0;
    }

    const today = formatLocalDate();
    const yesterday = formatLocalDate(addDays(new Date(), -1));

    if (lastDate === today || lastDate === yesterday) {
        return currentStreak;
    }

    return 0;
}

function normalizeUsername(username) {
    return String(username || "").trim().toLowerCase();
}

function validateUsername(username) {
    const normalized = normalizeUsername(username);
    if (!/^[a-z0-9_]{3,20}$/.test(normalized)) {
        return {
            valid: false,
            message: "Username must be 3-20 characters and use letters, numbers, or underscores only"
        };
    }
    return { valid: true, normalized };
}

function generateUniqueFriendCode(callback) {
    const friendCode = String(Math.floor(100000 + Math.random() * 900000));
    db.query("SELECT id FROM users WHERE friend_code = ?", [friendCode], (err, results) => {
        if (err) {
            callback(err);
            return;
        }
        if (results.length > 0) {
            generateUniqueFriendCode(callback);
            return;
        }
        callback(null, friendCode);
    });
}

function findUserByIdentifier(identifier, callback) {
    const trimmed = String(identifier || "").trim();
    if (!trimmed) {
        callback(null, null);
        return;
    }

    if (/^\d{6}$/.test(trimmed)) {
        db.query(
            "SELECT id, name, username, friend_code FROM users WHERE friend_code = ?",
            [trimmed],
            (err, results) => callback(err, results[0] || null)
        );
        return;
    }

    const username = normalizeUsername(trimmed.replace(/^@/, ""));
    db.query(
        "SELECT id, name, username, friend_code FROM users WHERE username = ?",
        [username],
        (err, results) => callback(err, results[0] || null)
    );
}

function publicUserProfile(row) {
    return {
        id: row.id,
        name: row.name,
        username: row.username,
        friendCode: row.friend_code
    };
}

function getUserStreakStats(userId, res, onSuccess) {
    db.query(
        "SELECT current_streak, longest_streak, last_streak_date FROM users WHERE id = ?",
        [userId],
        (err, results) => {
            if (err) {
                console.error(err);
                res.status(500).json({ message: "Database error" });
                return;
            }

            if (results.length === 0) {
                res.status(404).json({ message: "User not found" });
                return;
            }

            const user = results[0];
            onSuccess({
                currentStreak: getEffectiveCurrentStreak(user.current_streak, user.last_streak_date),
                longestStreak: user.longest_streak || 0,
                lastStreakDate: formatDbDate(user.last_streak_date)
            });
        }
    );
}

// REGISTER
app.post("/register", (req, res) => {
    const { name, email, password, username } = req.body;
    const usernameCheck = validateUsername(username);

    if (!usernameCheck.valid) {
        res.status(400).json({ message: usernameCheck.message });
        return;
    }

    db.query("SELECT id FROM users WHERE email = ?", [email], (emailErr, emailResults) => {
        if (emailErr) {
            console.error(emailErr);
            res.status(500).json({ message: "Database error" });
            return;
        }
        if (emailResults.length > 0) {
            res.status(400).json({ message: "Email already registered" });
            return;
        }

        db.query(
            "SELECT id FROM users WHERE username = ?",
            [usernameCheck.normalized],
            (userErr, userResults) => {
                if (userErr) {
                    console.error(userErr);
                    res.status(500).json({ message: "Database error" });
                    return;
                }
                if (userResults.length > 0) {
                    res.status(400).json({ message: "Username already taken" });
                    return;
                }

                bcrypt.hash(password, SALT_ROUNDS, (hashErr, hashedPassword) => {
                    if (hashErr) {
                        console.error(hashErr);
                        res.status(500).json({ message: "Error securing password" });
                        return;
                    }

                    generateUniqueFriendCode((codeErr, friendCode) => {
                        if (codeErr) {
                            console.error(codeErr);
                            res.status(500).json({ message: "Database error" });
                            return;
                        }

                        db.query(
                            "INSERT INTO users (name, email, username, friend_code, password) VALUES (?, ?, ?, ?, ?)",
                            [name, email, usernameCheck.normalized, friendCode, hashedPassword],
                            (insertErr) => {
                                if (insertErr) {
                                    console.error(insertErr);
                                    res.status(500).json({ message: "Database error" });
                                    return;
                                }
                                res.status(201).json({
                                    message: "Registration successful!",
                                    username: usernameCheck.normalized,
                                    friendCode
                                });
                            }
                        );
                    });
                });
            }
        );
    });
});

// LOGIN
app.post("/login", (req,res) => {
    const { email, password } = req.body;

    // Find user by email, then verify the password against the stored hash
    db.query("SELECT * FROM users WHERE email = ?", 
        [email], 
        (err, results) => {
            if (err) {
                console.error(err);
                res.status(500).json({ message: "Database error" }, err)
                return;
            }

            if (results.length === 0) {
                res.status(401).json({ message: "Invalid email or password" });
                return;
            }

            const user = results[0];

            // Compare the provided password with the stored bcrypt hash
            bcrypt.compare(password, user.password, (compareErr, isMatch) => {
                if (compareErr) {
                    console.error(compareErr);
                    res.status(500).json({ message: "Database error" });
                    return;
                }

                if (!isMatch) {
                    res.status(401).json({ message: "Invalid email or password" });
                    return;
                }

                // Issue a signed token containing the user's identity
                const token = jwt.sign(
                    { id: user.id, name: user.name, username: user.username },
                    ACTIVE_JWT_SECRET,
                    { expiresIn: "7d" }
                );

                res.status(200).json({ 
                    message: "Login Successful!", 
                    token: token,
                    user: {
                        id: user.id,
                        name: user.name,
                        username: user.username,
                        friendCode: user.friend_code
                    }
                });
            });
        });
});

// Helper: ensure a task exists and belongs to the authenticated user before mutating it
function ensureTaskOwnership(taskId, userId, res, onOwned) {
    db.query("SELECT user_id FROM tasks WHERE id = ?", [taskId], (err, results) => {
        if (err) {
            console.error(err);
            res.status(500).json({ message: "Database error" });
            return;
        }
        if (results.length === 0) {
            res.status(404).json({ message: "Task not found" });
            return;
        }
        if (results[0].user_id !== userId) {
            res.status(403).json({ message: "You do not have access to this task" });
            return;
        }
        onOwned();
    });
}

// Get active tasks for the authenticated user
app.get("/tasks", authenticateToken, (req, res) => {
    db.query("SELECT * FROM tasks WHERE user_id = ? AND task_archived = false", 
        [req.user.id],
        (err, results) => {
            if (err) {
                console.error(err);
                res.status(500).json({ message: "Database error" });
                return;
            }
            res.status(200).json(results);
        }
    )
})

// Get ALL tasks (including archived) for analytics, for the authenticated user
app.get("/tasks/all", authenticateToken, (req, res) => {
    db.query("SELECT * FROM tasks WHERE user_id = ?", 
        [req.user.id],
        (err, results) => {
            if (err) {
                console.error(err);
                res.status(500).json({ message: "Database error" });
                return;
            }
            res.status(200).json(results);
        }
    );
});

// Get focus analytics: total time across all pomodoros + per-task breakdown
app.get("/analytics", authenticateToken, (req, res) => {
    db.query(
        "SELECT total_focus_minutes FROM users WHERE id = ?",
        [req.user.id],
        (err, userResults) => {
            if (err) {
                console.error(err);
                res.status(500).json({ message: "Database error" });
                return;
            }

            db.query(
                "SELECT * FROM tasks WHERE user_id = ?",
                [req.user.id],
                (tasksErr, tasks) => {
                    if (tasksErr) {
                        console.error(tasksErr);
                        res.status(500).json({ message: "Database error" });
                        return;
                    }

                    res.status(200).json({
                        totalFocusMinutes: userResults[0]?.total_focus_minutes || 0,
                        tasks
                    });
                }
            );
        }
    );
});

// Post a new task for the authenticated user
app.post("/tasks", authenticateToken, (req, res) => {
    const { task_name } = req.body;

    db.query("INSERT INTO tasks (user_id, task_name) VALUES (?, ?)", 
        [req.user.id, task_name],
        (err, results) => {
            if (err) {
                console.error(err);
                res.status(500).json({ message: "Database error" });
                return;
            }

            res.status(201).json({ message: "Task created!", id: results.insertId });
        }
    )
})

// Update a task (complete / edit) - only if owned by the authenticated user
app.put("/tasks/:id", authenticateToken, (req, res) => {
    const { id } = req.params;
    const { task_name, task_completed, time_spent } = req.body;

    ensureTaskOwnership(id, req.user.id, res, () => {
        db.query("UPDATE tasks SET task_name = ?, task_completed = ?, time_spent = ? WHERE id = ?", 
            [task_name, task_completed, time_spent, id],
            (err, results) => {
                if (err) {
                    console.error(err);
                    res.status(500).json({ message: "Database error" });
                    return;
                }
                res.status(200).json({ message: "Task Updated!" });
            });
    });
});

// Archive a task - only if owned by the authenticated user
app.put("/tasks/:id/archive", authenticateToken, (req, res) => {
    const { id } = req.params;

    ensureTaskOwnership(id, req.user.id, res, () => {
        db.query("UPDATE tasks SET task_archived = true WHERE id = ?", 
            [id],
            (err, results) => {
                if (err) {
                    console.error(err);
                    res.status(500).json({ message: "Database error" });
                    return;
                }
                res.status(200).json({ message: "Task archived" });
            });
    });
});

// Get streak stats and activity dates for heatmap
app.get("/streak", authenticateToken, (req, res) => {
    getUserStreakStats(req.user.id, res, (stats) => {
        db.query(
            "SELECT activity_date FROM streak_days WHERE user_id = ? ORDER BY activity_date ASC",
            [req.user.id],
            (err, results) => {
                if (err) {
                    console.error(err);
                    res.status(500).json({ message: "Database error" });
                    return;
                }

                res.status(200).json({
                    ...stats,
                    activityDates: results.map((row) => formatDbDate(row.activity_date))
                });
            }
        );
    });
});

// Record a completed pomodoro session (counts once per day toward streak)
app.post("/streak/complete", authenticateToken, (req, res) => {
    const userId = req.user.id;
    const minutes = Math.max(0, parseInt(req.body.minutes, 10) || 0);
    const today = formatLocalDate();
    const yesterday = formatLocalDate(addDays(new Date(), -1));

    function addFocusMinutes(onDone) {
        if (minutes <= 0) {
            onDone(null);
            return;
        }

        db.query(
            "UPDATE users SET total_focus_minutes = COALESCE(total_focus_minutes, 0) + ? WHERE id = ?",
            [minutes, userId],
            onDone
        );
    }

    function sendStreakResponse(streakData) {
        res.status(200).json({
            ...streakData,
            focusMinutesAdded: minutes
        });
    }

    db.query(
        "SELECT current_streak, longest_streak, last_streak_date FROM users WHERE id = ?",
        [userId],
        (err, results) => {
            if (err) {
                console.error(err);
                res.status(500).json({ message: "Database error" });
                return;
            }

            if (results.length === 0) {
                res.status(404).json({ message: "User not found" });
                return;
            }

            const user = results[0];
            const lastDate = formatDbDate(user.last_streak_date);

            addFocusMinutes((focusErr) => {
                if (focusErr) {
                    console.error(focusErr);
                    res.status(500).json({ message: "Database error" });
                    return;
                }

                if (lastDate === today) {
                    sendStreakResponse({
                        currentStreak: getEffectiveCurrentStreak(user.current_streak, user.last_streak_date),
                        longestStreak: user.longest_streak || 0,
                        alreadyRecorded: true
                    });
                    return;
                }

                let newStreak = 1;
                if (lastDate === yesterday) {
                    newStreak = (user.current_streak || 0) + 1;
                }

                const newLongest = Math.max(user.longest_streak || 0, newStreak);

                db.query(
                    "INSERT IGNORE INTO streak_days (user_id, activity_date) VALUES (?, ?)",
                    [userId, today],
                    (insertErr) => {
                        if (insertErr) {
                            console.error(insertErr);
                            res.status(500).json({ message: "Database error" });
                            return;
                        }

                        db.query(
                            "UPDATE users SET current_streak = ?, longest_streak = ?, last_streak_date = ? WHERE id = ?",
                            [newStreak, newLongest, today, userId],
                            (updateErr) => {
                                if (updateErr) {
                                    console.error(updateErr);
                                    res.status(500).json({ message: "Database error" });
                                    return;
                                }

                                sendStreakResponse({
                                    currentStreak: newStreak,
                                    longestStreak: newLongest,
                                    alreadyRecorded: false
                                });
                            }
                        );
                    }
                );
            });
        }
    );
});

// --- Study Buddies ---

const PRESENCE_OFFLINE_AFTER_MS = 2 * 60 * 1000;
const VALID_PRESENCE_STATUSES = new Set(["offline", "online", "focusing", "on_break"]);

function resolveEffectivePresence(presenceRow, privacyRow) {
    if (!presenceRow || !privacyRow?.show_presence) {
        return {
            status: "offline",
            currentTaskName: null,
            sessionEndsAt: null,
            lastSeenAt: presenceRow?.last_seen_at || null
        };
    }

    const lastSeen = presenceRow.last_seen_at ? new Date(presenceRow.last_seen_at).getTime() : 0;
    const isStale = !lastSeen || Date.now() - lastSeen > PRESENCE_OFFLINE_AFTER_MS;

    if (isStale) {
        return {
            status: "offline",
            currentTaskName: null,
            sessionEndsAt: null,
            lastSeenAt: presenceRow.last_seen_at
        };
    }

    return {
        status: presenceRow.status || "offline",
        currentTaskName: privacyRow.show_task_name ? presenceRow.current_task_name : null,
        sessionEndsAt: presenceRow.session_ends_at,
        lastSeenAt: presenceRow.last_seen_at
    };
}

function findFriendshipBetween(userA, userB, callback) {
    db.query(
        `SELECT * FROM friendships
         WHERE (requester_id = ? AND addressee_id = ?)
            OR (requester_id = ? AND addressee_id = ?)
         LIMIT 1`,
        [userA, userB, userB, userA],
        callback
    );
}

// List accepted study buddies with presence
app.get("/buddies", authenticateToken, (req, res) => {
    const userId = req.user.id;

    db.query(
        `SELECT
            f.id AS friendship_id,
            u.id,
            u.name,
            u.username,
            u.friend_code,
            u.show_presence,
            u.show_task_name,
            p.status,
            p.current_task_name,
            p.session_ends_at,
            p.last_seen_at
         FROM friendships f
         JOIN users u ON u.id = IF(f.requester_id = ?, f.addressee_id, f.requester_id)
         LEFT JOIN user_presence p ON p.user_id = u.id
         WHERE f.status = 'accepted'
           AND (f.requester_id = ? OR f.addressee_id = ?)
         ORDER BY u.name ASC`,
        [userId, userId, userId],
        (err, results) => {
            if (err) {
                console.error(err);
                res.status(500).json({ message: "Database error" });
                return;
            }

            const buddies = results.map((row) => {
                const presence = resolveEffectivePresence(
                    {
                        status: row.status,
                        current_task_name: row.current_task_name,
                        session_ends_at: row.session_ends_at,
                        last_seen_at: row.last_seen_at
                    },
                    { show_presence: row.show_presence, show_task_name: row.show_task_name }
                );

                return {
                    id: row.id,
                    name: row.name,
                    username: row.username,
                    friendCode: row.friend_code,
                    friendshipId: row.friendship_id,
                    ...presence
                };
            });

            res.status(200).json(buddies);
        }
    );
});

// Incoming friend requests
app.get("/buddies/requests", authenticateToken, (req, res) => {
    db.query(
        `SELECT f.id, f.created_at, u.id AS userId, u.name, u.username, u.friend_code
         FROM friendships f
         JOIN users u ON u.id = f.requester_id
         WHERE f.addressee_id = ? AND f.status = 'pending'
         ORDER BY f.created_at DESC`,
        [req.user.id],
        (err, results) => {
            if (err) {
                console.error(err);
                res.status(500).json({ message: "Database error" });
                return;
            }
            res.status(200).json(results.map((row) => ({
                id: row.id,
                created_at: row.created_at,
                userId: row.userId,
                name: row.name,
                username: row.username,
                friendCode: row.friend_code
            })));
        }
    );
});

// Send friend request by username or 6-digit friend code
app.post("/buddies/request", authenticateToken, (req, res) => {
    const requesterId = req.user.id;
    const identifier = req.body.identifier || req.body.username || req.body.friendCode || "";

    if (!String(identifier).trim()) {
        res.status(400).json({ message: "Username or friend code is required" });
        return;
    }

    findUserByIdentifier(identifier, (err, addressee) => {
        if (err) {
            console.error(err);
            res.status(500).json({ message: "Database error" });
            return;
        }

        if (!addressee) {
            res.status(404).json({ message: "No user found with that username or friend code" });
            return;
        }

        if (addressee.id === requesterId) {
            res.status(400).json({ message: "You cannot add yourself as a buddy" });
            return;
        }

        findFriendshipBetween(requesterId, addressee.id, (friendErr, friendships) => {
            if (friendErr) {
                console.error(friendErr);
                res.status(500).json({ message: "Database error" });
                return;
            }

            if (friendships.length > 0) {
                const existing = friendships[0];
                if (existing.status === "accepted") {
                    res.status(400).json({ message: "You are already study buddies" });
                    return;
                }
                if (existing.status === "pending") {
                    res.status(400).json({ message: "A friend request is already pending" });
                    return;
                }
            }

            db.query(
                "INSERT INTO friendships (requester_id, addressee_id, status) VALUES (?, ?, 'pending')",
                [requesterId, addressee.id],
                (insertErr) => {
                    if (insertErr) {
                        console.error(insertErr);
                        res.status(500).json({ message: "Database error" });
                        return;
                    }
                    res.status(201).json({
                        message: "Friend request sent!",
                        user: publicUserProfile(addressee)
                    });
                }
            );
        });
    });
});

// Current user public profile (username + friend code)
app.get("/users/me", authenticateToken, (req, res) => {
    db.query(
        "SELECT id, name, username, friend_code FROM users WHERE id = ?",
        [req.user.id],
        (err, results) => {
            if (err) {
                console.error(err);
                res.status(500).json({ message: "Database error" });
                return;
            }
            if (results.length === 0) {
                res.status(404).json({ message: "User not found" });
                return;
            }
            res.status(200).json(publicUserProfile(results[0]));
        }
    );
});

// Accept friend request
app.put("/buddies/requests/:id/accept", authenticateToken, (req, res) => {
    const requestId = req.params.id;

    db.query(
        "SELECT * FROM friendships WHERE id = ? AND addressee_id = ? AND status = 'pending'",
        [requestId, req.user.id],
        (err, results) => {
            if (err) {
                console.error(err);
                res.status(500).json({ message: "Database error" });
                return;
            }
            if (results.length === 0) {
                res.status(404).json({ message: "Friend request not found" });
                return;
            }

            db.query(
                "UPDATE friendships SET status = 'accepted' WHERE id = ?",
                [requestId],
                (updateErr) => {
                    if (updateErr) {
                        console.error(updateErr);
                        res.status(500).json({ message: "Database error" });
                        return;
                    }
                    res.status(200).json({ message: "Friend request accepted!" });
                }
            );
        }
    );
});

// Decline friend request
app.put("/buddies/requests/:id/decline", authenticateToken, (req, res) => {
    const requestId = req.params.id;

    db.query(
        "UPDATE friendships SET status = 'declined' WHERE id = ? AND addressee_id = ? AND status = 'pending'",
        [requestId, req.user.id],
        (err, results) => {
            if (err) {
                console.error(err);
                res.status(500).json({ message: "Database error" });
                return;
            }
            if (results.affectedRows === 0) {
                res.status(404).json({ message: "Friend request not found" });
                return;
            }
            res.status(200).json({ message: "Friend request declined" });
        }
    );
});

// Remove a study buddy
app.delete("/buddies/:userId", authenticateToken, (req, res) => {
    const buddyId = parseInt(req.params.userId, 10);
    const userId = req.user.id;

    db.query(
        `DELETE FROM friendships
         WHERE status = 'accepted'
           AND ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?))`,
        [userId, buddyId, buddyId, userId],
        (err, results) => {
            if (err) {
                console.error(err);
                res.status(500).json({ message: "Database error" });
                return;
            }
            if (results.affectedRows === 0) {
                res.status(404).json({ message: "Study buddy not found" });
                return;
            }
            res.status(200).json({ message: "Study buddy removed" });
        }
    );
});

// Update own presence
app.put("/presence", authenticateToken, (req, res) => {
    const userId = req.user.id;
    const status = req.body.status;
    const currentTaskName = req.body.currentTaskName || null;
    const sessionEndsAt = req.body.sessionEndsAt || null;

    if (!VALID_PRESENCE_STATUSES.has(status)) {
        res.status(400).json({ message: "Invalid presence status" });
        return;
    }

    db.query(
        `INSERT INTO user_presence (user_id, status, current_task_name, session_ends_at, last_seen_at)
         VALUES (?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
            status = VALUES(status),
            current_task_name = VALUES(current_task_name),
            session_ends_at = VALUES(session_ends_at),
            last_seen_at = NOW()`,
        [userId, status, currentTaskName, sessionEndsAt],
        (err) => {
            if (err) {
                console.error(err);
                res.status(500).json({ message: "Database error" });
                return;
            }
            res.status(200).json({ message: "Presence updated" });
        }
    );
});

// Get privacy settings
app.get("/presence/settings", authenticateToken, (req, res) => {
    db.query(
        "SELECT show_presence, show_task_name FROM users WHERE id = ?",
        [req.user.id],
        (err, results) => {
            if (err) {
                console.error(err);
                res.status(500).json({ message: "Database error" });
                return;
            }
            if (results.length === 0) {
                res.status(404).json({ message: "User not found" });
                return;
            }
            res.status(200).json({
                showPresence: !!results[0].show_presence,
                showTaskName: !!results[0].show_task_name
            });
        }
    );
});

// Update privacy settings
app.put("/presence/settings", authenticateToken, (req, res) => {
    const showPresence = req.body.showPresence !== false;
    const showTaskName = !!req.body.showTaskName;

    db.query(
        "UPDATE users SET show_presence = ?, show_task_name = ? WHERE id = ?",
        [showPresence, showTaskName, req.user.id],
        (err) => {
            if (err) {
                console.error(err);
                res.status(500).json({ message: "Database error" });
                return;
            }
            res.status(200).json({ showPresence, showTaskName });
        }
    );
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running on port ${PORT}`);
});