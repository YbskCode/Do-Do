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

// --- Study Together (group pomodoro) ---

const SESSION_MIN_MINUTES = 25;
const SESSION_MAX_MINUTES = 180;

function clampSessionDuration(minutes, fallback) {
    const parsed = parseInt(minutes, 10);
    const base = Number.isNaN(parsed) ? fallback : parsed;
    if (Number.isNaN(base)) return null;
    return Math.min(SESSION_MAX_MINUTES, Math.max(SESSION_MIN_MINUTES, base));
}

function getAcceptedFriendIds(userId, callback) {
    db.query(
        `SELECT IF(requester_id = ?, addressee_id, requester_id) AS friendId
         FROM friendships
         WHERE status = 'accepted' AND (requester_id = ? OR addressee_id = ?)`,
        [userId, userId, userId],
        (err, rows) => {
            if (err) {
                callback(err);
                return;
            }
            callback(null, rows.map((row) => row.friendId));
        }
    );
}

// Treat an active session whose end time has passed as effectively completed on read.
// A paused session never expires while it is frozen.
function effectiveSessionStatus(session) {
    if (session.status === "active" && !session.is_paused && session.ends_at) {
        if (new Date(session.ends_at).getTime() <= Date.now()) {
            return "completed";
        }
    }
    return session.status;
}

function sessionSecondsRemaining(session) {
    if (session.status !== "active") return 0;
    if (session.is_paused) {
        return Math.max(0, session.remaining_seconds || 0);
    }
    if (!session.ends_at) return 0;
    const diff = Math.ceil((new Date(session.ends_at).getTime() - Date.now()) / 1000);
    return Math.max(0, diff);
}

function buildSessionPayload(session, participants, userId) {
    return {
        id: session.id,
        hostId: session.host_id,
        label: session.label,
        durationMinutes: session.duration_minutes,
        status: effectiveSessionStatus(session),
        startsAt: session.starts_at,
        endsAt: session.ends_at,
        isPaused: !!session.is_paused,
        secondsRemaining: sessionSecondsRemaining(session),
        isHost: session.host_id === userId,
        participants: participants.map((p) => ({
            userId: p.user_id,
            name: p.name,
            username: p.username,
            status: p.status,
            isHost: p.user_id === session.host_id
        }))
    };
}

function loadSessionWithParticipants(sessionId, res, onDone) {
    db.query("SELECT * FROM study_sessions WHERE id = ?", [sessionId], (err, sessions) => {
        if (err) {
            console.error(err);
            res.status(500).json({ message: "Database error" });
            return;
        }
        if (sessions.length === 0) {
            res.status(404).json({ message: "Session not found" });
            return;
        }
        db.query(
            `SELECT sp.user_id, sp.status, u.name, u.username
             FROM session_participants sp
             JOIN users u ON u.id = sp.user_id
             WHERE sp.session_id = ?`,
            [sessionId],
            (pErr, participants) => {
                if (pErr) {
                    console.error(pErr);
                    res.status(500).json({ message: "Database error" });
                    return;
                }
                onDone(sessions[0], participants);
            }
        );
    });
}

function ensureSessionHost(sessionId, userId, res, onOwned) {
    db.query("SELECT * FROM study_sessions WHERE id = ?", [sessionId], (err, rows) => {
        if (err) {
            console.error(err);
            res.status(500).json({ message: "Database error" });
            return;
        }
        if (rows.length === 0) {
            res.status(404).json({ message: "Session not found" });
            return;
        }
        if (rows[0].host_id !== userId) {
            res.status(403).json({ message: "Only the session host can do that" });
            return;
        }
        onOwned(rows[0]);
    });
}

// Create a session (as host) and invite selected buddies
app.post("/sessions", authenticateToken, (req, res) => {
    const hostId = req.user.id;
    const label = (req.body.label || "").toString().trim().slice(0, 255) || null;
    const duration = clampSessionDuration(req.body.durationMinutes, NaN);

    if (duration === null) {
        res.status(400).json({ message: "A valid duration in minutes is required" });
        return;
    }

    const rawBuddyIds = Array.isArray(req.body.buddyIds) ? req.body.buddyIds : [];
    const requestedIds = [...new Set(
        rawBuddyIds.map((id) => parseInt(id, 10)).filter((id) => Number.isInteger(id) && id !== hostId)
    )];

    getAcceptedFriendIds(hostId, (err, friendIds) => {
        if (err) {
            console.error(err);
            res.status(500).json({ message: "Database error" });
            return;
        }

        const friendSet = new Set(friendIds);
        const invitees = requestedIds.filter((id) => friendSet.has(id));

        db.query(
            "INSERT INTO study_sessions (host_id, label, duration_minutes, status) VALUES (?, ?, ?, 'pending')",
            [hostId, label, duration],
            (insErr, result) => {
                if (insErr) {
                    console.error(insErr);
                    res.status(500).json({ message: "Database error" });
                    return;
                }

                const sessionId = result.insertId;
                const participantRows = [[sessionId, hostId, "joined"]];
                invitees.forEach((id) => participantRows.push([sessionId, id, "invited"]));

                db.query(
                    "INSERT INTO session_participants (session_id, user_id, status) VALUES ?",
                    [participantRows],
                    (partErr) => {
                        if (partErr) {
                            console.error(partErr);
                            res.status(500).json({ message: "Database error" });
                            return;
                        }
                        loadSessionWithParticipants(sessionId, res, (session, participants) => {
                            res.status(201).json(buildSessionPayload(session, participants, hostId));
                        });
                    }
                );
            }
        );
    });
});

// Sessions the current user is part of (joined or invited) that are still live
app.get("/sessions/mine", authenticateToken, (req, res) => {
    const userId = req.user.id;
    db.query(
        `SELECT s.* FROM study_sessions s
         JOIN session_participants sp ON sp.session_id = s.id
         WHERE sp.user_id = ? AND sp.status IN ('joined', 'invited')
           AND s.status IN ('pending', 'active')
         ORDER BY s.created_at DESC`,
        [userId],
        (err, sessions) => {
            if (err) {
                console.error(err);
                res.status(500).json({ message: "Database error" });
                return;
            }

            const live = sessions.filter((s) => effectiveSessionStatus(s) !== "completed");
            if (live.length === 0) {
                res.status(200).json([]);
                return;
            }

            const ids = live.map((s) => s.id);
            db.query(
                `SELECT sp.session_id, sp.user_id, sp.status, u.name, u.username
                 FROM session_participants sp
                 JOIN users u ON u.id = sp.user_id
                 WHERE sp.session_id IN (?)`,
                [ids],
                (pErr, rows) => {
                    if (pErr) {
                        console.error(pErr);
                        res.status(500).json({ message: "Database error" });
                        return;
                    }
                    const bySession = {};
                    rows.forEach((row) => {
                        (bySession[row.session_id] = bySession[row.session_id] || []).push(row);
                    });
                    res.status(200).json(live.map((s) => buildSessionPayload(s, bySession[s.id] || [], userId)));
                }
            );
        }
    );
});

// The single active session (if any) the current user has joined - drives the shared timer
app.get("/sessions/active", authenticateToken, (req, res) => {
    const userId = req.user.id;
    db.query(
        `SELECT s.* FROM study_sessions s
         JOIN session_participants sp ON sp.session_id = s.id
         WHERE sp.user_id = ? AND sp.status = 'joined' AND s.status = 'active'
         ORDER BY s.ends_at DESC
         LIMIT 1`,
        [userId],
        (err, sessions) => {
            if (err) {
                console.error(err);
                res.status(500).json({ message: "Database error" });
                return;
            }
            if (sessions.length === 0 || effectiveSessionStatus(sessions[0]) === "completed") {
                res.status(200).json(null);
                return;
            }
            loadSessionWithParticipants(sessions[0].id, res, (session, participants) => {
                res.status(200).json(buildSessionPayload(session, participants, userId));
            });
        }
    );
});

// Aggregated notifications: incoming friend requests + pending session invites
app.get("/notifications", authenticateToken, (req, res) => {
    const userId = req.user.id;
    db.query(
        `SELECT f.id, u.name, u.username, u.friend_code
         FROM friendships f
         JOIN users u ON u.id = f.requester_id
         WHERE f.addressee_id = ? AND f.status = 'pending'
         ORDER BY f.created_at DESC`,
        [userId],
        (err, friendRequests) => {
            if (err) {
                console.error(err);
                res.status(500).json({ message: "Database error" });
                return;
            }
            db.query(
                `SELECT s.id AS sessionId, s.label, s.duration_minutes, s.status, s.ends_at,
                        u.name AS hostName, u.username AS hostUsername
                 FROM session_participants sp
                 JOIN study_sessions s ON s.id = sp.session_id
                 JOIN users u ON u.id = s.host_id
                 WHERE sp.user_id = ? AND sp.status = 'invited'
                   AND s.status IN ('pending', 'active')
                 ORDER BY s.created_at DESC`,
                [userId],
                (sErr, inviteRows) => {
                    if (sErr) {
                        console.error(sErr);
                        res.status(500).json({ message: "Database error" });
                        return;
                    }
                    const sessionInvites = inviteRows
                        .filter((r) => effectiveSessionStatus({ status: r.status, ends_at: r.ends_at }) !== "completed")
                        .map((r) => ({
                            sessionId: r.sessionId,
                            label: r.label,
                            durationMinutes: r.duration_minutes,
                            status: r.status,
                            hostName: r.hostName,
                            hostUsername: r.hostUsername
                        }));

                    // Message notifications: latest unread, notification-worthy message
                    // per conversation (rule 3 is enforced by triggers_notification).
                    db.query(
                        `SELECT m.id AS messageId, m.body, m.conversation_id AS conversationId,
                                u.id AS fromUserId, u.name, u.username,
                                (SELECT COUNT(*) FROM messages m2
                                    WHERE m2.conversation_id = m.conversation_id
                                      AND m2.sender_id = u.id AND m2.read_at IS NULL) AS unreadCount
                         FROM messages m
                         JOIN conversations c ON c.id = m.conversation_id
                         JOIN users u ON u.id = m.sender_id
                         WHERE m.read_at IS NULL
                           AND m.triggers_notification = TRUE
                           AND m.sender_id <> ?
                           AND (c.user_one_id = ? OR c.user_two_id = ?)
                           AND m.id = (
                               SELECT MAX(m3.id) FROM messages m3
                               WHERE m3.conversation_id = m.conversation_id
                                 AND m3.read_at IS NULL
                                 AND m3.triggers_notification = TRUE
                                 AND m3.sender_id = u.id
                           )
                         ORDER BY m.id DESC`,
                        [userId, userId, userId],
                        (msgErr, msgRows) => {
                            if (msgErr) {
                                console.error(msgErr);
                                res.status(500).json({ message: "Database error" });
                                return;
                            }

                            const messageNotifications = msgRows.map((r) => ({
                                messageId: r.messageId,
                                fromUserId: r.fromUserId,
                                name: r.name,
                                username: r.username,
                                preview: r.body.length > 60 ? `${r.body.slice(0, 60)}…` : r.body,
                                unreadCount: Number(r.unreadCount) || 0
                            }));

                            res.status(200).json({
                                friendRequests: friendRequests.map((r) => ({
                                    id: r.id,
                                    name: r.name,
                                    username: r.username,
                                    friendCode: r.friend_code
                                })),
                                sessionInvites,
                                messageNotifications
                            });
                        }
                    );
                }
            );
        }
    );
});

// Session detail - only for participants
app.get("/sessions/:id", authenticateToken, (req, res) => {
    loadSessionWithParticipants(req.params.id, res, (session, participants) => {
        const isParticipant = participants.some((p) => p.user_id === req.user.id);
        if (!isParticipant) {
            res.status(403).json({ message: "You are not part of this session" });
            return;
        }
        res.status(200).json(buildSessionPayload(session, participants, req.user.id));
    });
});

// Host edits session duration/label before it starts (only the host can change the times)
app.put("/sessions/:id", authenticateToken, (req, res) => {
    ensureSessionHost(req.params.id, req.user.id, res, (session) => {
        if (session.status !== "pending") {
            res.status(400).json({ message: "You can only edit a session before it starts" });
            return;
        }
        const duration = clampSessionDuration(req.body.durationMinutes, session.duration_minutes);
        const label = req.body.label !== undefined
            ? (String(req.body.label).trim().slice(0, 255) || null)
            : session.label;

        db.query(
            "UPDATE study_sessions SET duration_minutes = ?, label = ? WHERE id = ?",
            [duration, label, session.id],
            (err) => {
                if (err) {
                    console.error(err);
                    res.status(500).json({ message: "Database error" });
                    return;
                }
                loadSessionWithParticipants(session.id, res, (s, p) => {
                    res.status(200).json(buildSessionPayload(s, p, req.user.id));
                });
            }
        );
    });
});

// Host starts the session - sets the shared, server-authoritative end time
app.put("/sessions/:id/start", authenticateToken, (req, res) => {
    ensureSessionHost(req.params.id, req.user.id, res, (session) => {
        if (session.status !== "pending") {
            res.status(400).json({ message: "Session has already started or ended" });
            return;
        }
        db.query(
            `UPDATE study_sessions
             SET status = 'active', starts_at = NOW(), ends_at = DATE_ADD(NOW(), INTERVAL ? MINUTE)
             WHERE id = ?`,
            [session.duration_minutes, session.id],
            (err) => {
                if (err) {
                    console.error(err);
                    res.status(500).json({ message: "Database error" });
                    return;
                }
                loadSessionWithParticipants(session.id, res, (s, p) => {
                    res.status(200).json(buildSessionPayload(s, p, req.user.id));
                });
            }
        );
    });
});

// Invited buddy joins the session
app.put("/sessions/:id/join", authenticateToken, (req, res) => {
    const sessionId = req.params.id;
    const userId = req.user.id;

    db.query("SELECT * FROM study_sessions WHERE id = ?", [sessionId], (err, sessions) => {
        if (err) {
            console.error(err);
            res.status(500).json({ message: "Database error" });
            return;
        }
        if (sessions.length === 0) {
            res.status(404).json({ message: "Session not found" });
            return;
        }
        if (!["pending", "active"].includes(effectiveSessionStatus(sessions[0]))) {
            res.status(400).json({ message: "This session is no longer available" });
            return;
        }

        db.query(
            `UPDATE session_participants SET status = 'joined', responded_at = NOW()
             WHERE session_id = ? AND user_id = ? AND status IN ('invited', 'left')`,
            [sessionId, userId],
            (uErr, result) => {
                if (uErr) {
                    console.error(uErr);
                    res.status(500).json({ message: "Database error" });
                    return;
                }
                if (result.affectedRows === 0) {
                    res.status(404).json({ message: "No invite found for this session" });
                    return;
                }
                loadSessionWithParticipants(sessionId, res, (s, p) => {
                    res.status(200).json(buildSessionPayload(s, p, userId));
                });
            }
        );
    });
});

// Invited buddy declines the session
app.put("/sessions/:id/decline", authenticateToken, (req, res) => {
    db.query(
        `UPDATE session_participants SET status = 'declined', responded_at = NOW()
         WHERE session_id = ? AND user_id = ? AND status = 'invited'`,
        [req.params.id, req.user.id],
        (err, result) => {
            if (err) {
                console.error(err);
                res.status(500).json({ message: "Database error" });
                return;
            }
            if (result.affectedRows === 0) {
                res.status(404).json({ message: "No invite found for this session" });
                return;
            }
            res.status(200).json({ message: "Invite declined" });
        }
    );
});

// Leave a session. If the host leaves, the whole session is cancelled.
app.put("/sessions/:id/leave", authenticateToken, (req, res) => {
    const sessionId = req.params.id;
    const userId = req.user.id;

    db.query("SELECT * FROM study_sessions WHERE id = ?", [sessionId], (err, sessions) => {
        if (err) {
            console.error(err);
            res.status(500).json({ message: "Database error" });
            return;
        }
        if (sessions.length === 0) {
            res.status(404).json({ message: "Session not found" });
            return;
        }

        if (sessions[0].host_id === userId) {
            db.query("UPDATE study_sessions SET status = 'cancelled' WHERE id = ?", [sessionId], (uErr) => {
                if (uErr) {
                    console.error(uErr);
                    res.status(500).json({ message: "Database error" });
                    return;
                }
                res.status(200).json({ message: "Session cancelled" });
            });
            return;
        }

        db.query(
            "UPDATE session_participants SET status = 'left', responded_at = NOW() WHERE session_id = ? AND user_id = ?",
            [sessionId, userId],
            (uErr) => {
                if (uErr) {
                    console.error(uErr);
                    res.status(500).json({ message: "Database error" });
                    return;
                }
                res.status(200).json({ message: "You left the session" });
            }
        );
    });
});

// Host cancels the session
app.put("/sessions/:id/cancel", authenticateToken, (req, res) => {
    ensureSessionHost(req.params.id, req.user.id, res, (session) => {
        if (["completed", "cancelled"].includes(session.status)) {
            res.status(400).json({ message: "Session has already ended" });
            return;
        }
        db.query("UPDATE study_sessions SET status = 'cancelled' WHERE id = ?", [session.id], (err) => {
            if (err) {
                console.error(err);
                res.status(500).json({ message: "Database error" });
                return;
            }
            res.status(200).json({ message: "Session cancelled" });
        });
    });
});

function ensureJoinedParticipant(sessionId, userId, res, onOk) {
    db.query(
        "SELECT status FROM session_participants WHERE session_id = ? AND user_id = ?",
        [sessionId, userId],
        (err, rows) => {
            if (err) {
                console.error(err);
                res.status(500).json({ message: "Database error" });
                return;
            }
            if (rows.length === 0 || rows[0].status !== "joined") {
                res.status(403).json({ message: "You are not part of this session" });
                return;
            }
            onOk();
        }
    );
}

// Pause the shared timer - freezes it for every participant. Any joined member may do this.
app.put("/sessions/:id/pause", authenticateToken, (req, res) => {
    const sessionId = req.params.id;
    const userId = req.user.id;

    db.query("SELECT * FROM study_sessions WHERE id = ?", [sessionId], (err, rows) => {
        if (err) {
            console.error(err);
            res.status(500).json({ message: "Database error" });
            return;
        }
        if (rows.length === 0) {
            res.status(404).json({ message: "Session not found" });
            return;
        }

        const session = rows[0];
        if (session.status !== "active") {
            res.status(400).json({ message: "Session is not running" });
            return;
        }

        ensureJoinedParticipant(sessionId, userId, res, () => {
            if (session.is_paused) {
                loadSessionWithParticipants(sessionId, res, (s, p) => {
                    res.status(200).json(buildSessionPayload(s, p, userId));
                });
                return;
            }

            const remaining = Math.max(
                0,
                Math.ceil((new Date(session.ends_at).getTime() - Date.now()) / 1000)
            );

            db.query(
                "UPDATE study_sessions SET is_paused = TRUE, remaining_seconds = ? WHERE id = ?",
                [remaining, sessionId],
                (uErr) => {
                    if (uErr) {
                        console.error(uErr);
                        res.status(500).json({ message: "Database error" });
                        return;
                    }
                    loadSessionWithParticipants(sessionId, res, (s, p) => {
                        res.status(200).json(buildSessionPayload(s, p, userId));
                    });
                }
            );
        });
    });
});

// Resume the shared timer - unfreezes it for every participant.
app.put("/sessions/:id/resume", authenticateToken, (req, res) => {
    const sessionId = req.params.id;
    const userId = req.user.id;

    db.query("SELECT * FROM study_sessions WHERE id = ?", [sessionId], (err, rows) => {
        if (err) {
            console.error(err);
            res.status(500).json({ message: "Database error" });
            return;
        }
        if (rows.length === 0) {
            res.status(404).json({ message: "Session not found" });
            return;
        }

        const session = rows[0];
        if (session.status !== "active") {
            res.status(400).json({ message: "Session is not running" });
            return;
        }

        ensureJoinedParticipant(sessionId, userId, res, () => {
            if (!session.is_paused) {
                loadSessionWithParticipants(sessionId, res, (s, p) => {
                    res.status(200).json(buildSessionPayload(s, p, userId));
                });
                return;
            }

            const remaining = Math.max(0, session.remaining_seconds || 0);

            db.query(
                `UPDATE study_sessions
                 SET is_paused = FALSE, remaining_seconds = NULL,
                     ends_at = DATE_ADD(NOW(), INTERVAL ? SECOND)
                 WHERE id = ?`,
                [remaining, sessionId],
                (uErr) => {
                    if (uErr) {
                        console.error(uErr);
                        res.status(500).json({ message: "Database error" });
                        return;
                    }
                    loadSessionWithParticipants(sessionId, res, (s, p) => {
                        res.status(200).json(buildSessionPayload(s, p, userId));
                    });
                }
            );
        });
    });
});

// --- Direct Messages (1-to-1 between buddies) ---

const MESSAGE_MAX_LENGTH = 2000;

function ensureAcceptedFriendship(userA, userB, res, onOk) {
    findFriendshipBetween(userA, userB, (err, rows) => {
        if (err) {
            console.error(err);
            res.status(500).json({ message: "Database error" });
            return;
        }
        if (rows.length === 0 || rows[0].status !== "accepted") {
            res.status(403).json({ message: "You can only message your buddies" });
            return;
        }
        onOk();
    });
}

function getOrCreateConversation(userId, otherId, callback) {
    const one = Math.min(userId, otherId);
    const two = Math.max(userId, otherId);

    db.query(
        "SELECT * FROM conversations WHERE user_one_id = ? AND user_two_id = ?",
        [one, two],
        (err, rows) => {
            if (err) {
                callback(err);
                return;
            }
            if (rows.length > 0) {
                callback(null, rows[0]);
                return;
            }
            db.query(
                "INSERT INTO conversations (user_one_id, user_two_id) VALUES (?, ?)",
                [one, two],
                (insErr, result) => {
                    if (insErr) {
                        callback(insErr);
                        return;
                    }
                    callback(null, { id: result.insertId, user_one_id: one, user_two_id: two });
                }
            );
        }
    );
}

// Inbox: every accepted buddy with last message preview + unread count.
// Friends with no messages yet are still listed so users can start a chat.
app.get("/messages/conversations", authenticateToken, (req, res) => {
    const userId = req.user.id;

    db.query(
        `SELECT
            u.id AS userId,
            u.name,
            u.username,
            c.id AS conversationId,
            c.last_message_at AS lastMessageAt,
            (SELECT m.body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS lastBody,
            (SELECT m.sender_id FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS lastSenderId,
            (SELECT COUNT(*) FROM messages m
                WHERE m.conversation_id = c.id AND m.sender_id = u.id AND m.read_at IS NULL) AS unreadCount
         FROM friendships f
         JOIN users u ON u.id = IF(f.requester_id = ?, f.addressee_id, f.requester_id)
         LEFT JOIN conversations c
            ON c.user_one_id = LEAST(?, u.id) AND c.user_two_id = GREATEST(?, u.id)
         WHERE f.status = 'accepted' AND (f.requester_id = ? OR f.addressee_id = ?)
         ORDER BY (c.last_message_at IS NULL), c.last_message_at DESC, u.name ASC`,
        [userId, userId, userId, userId, userId],
        (err, rows) => {
            if (err) {
                console.error(err);
                res.status(500).json({ message: "Database error" });
                return;
            }

            res.status(200).json(rows.map((row) => ({
                userId: row.userId,
                name: row.name,
                username: row.username,
                conversationId: row.conversationId,
                lastMessageAt: row.lastMessageAt,
                unreadCount: Number(row.unreadCount) || 0,
                lastMessage: row.lastBody
                    ? { body: row.lastBody, fromMe: row.lastSenderId === userId }
                    : null
            })));
        }
    );
});

// Full thread with one buddy. Marks the buddy's messages as read on open.
app.get("/messages/conversations/:userId", authenticateToken, (req, res) => {
    const userId = req.user.id;
    const otherId = parseInt(req.params.userId, 10);

    if (!Number.isInteger(otherId) || otherId === userId) {
        res.status(400).json({ message: "Invalid conversation" });
        return;
    }

    ensureAcceptedFriendship(userId, otherId, res, () => {
        db.query(
            "SELECT id, name, username, friend_code FROM users WHERE id = ?",
            [otherId],
            (uErr, userRows) => {
                if (uErr) {
                    console.error(uErr);
                    res.status(500).json({ message: "Database error" });
                    return;
                }
                if (userRows.length === 0) {
                    res.status(404).json({ message: "User not found" });
                    return;
                }

                getOrCreateConversation(userId, otherId, (cErr, conversation) => {
                    if (cErr) {
                        console.error(cErr);
                        res.status(500).json({ message: "Database error" });
                        return;
                    }

                    db.query(
                        `UPDATE messages SET read_at = NOW()
                         WHERE conversation_id = ? AND sender_id = ? AND read_at IS NULL`,
                        [conversation.id, otherId],
                        (rErr) => {
                            if (rErr) {
                                console.error(rErr);
                                res.status(500).json({ message: "Database error" });
                                return;
                            }

                            db.query(
                                `SELECT id, sender_id, body, read_at, created_at
                                 FROM messages WHERE conversation_id = ?
                                 ORDER BY id ASC`,
                                [conversation.id],
                                (mErr, messages) => {
                                    if (mErr) {
                                        console.error(mErr);
                                        res.status(500).json({ message: "Database error" });
                                        return;
                                    }
                                    res.status(200).json({
                                        conversationId: conversation.id,
                                        buddy: publicUserProfile(userRows[0]),
                                        messages: messages.map((m) => ({
                                            id: m.id,
                                            senderId: m.sender_id,
                                            body: m.body,
                                            fromMe: m.sender_id === userId,
                                            readAt: m.read_at,
                                            createdAt: m.created_at
                                        }))
                                    });
                                }
                            );
                        }
                    );
                });
            }
        );
    });
});

// Send a message to a buddy.
app.post("/messages/conversations/:userId", authenticateToken, (req, res) => {
    const userId = req.user.id;
    const otherId = parseInt(req.params.userId, 10);
    const body = (req.body.body || "").toString().trim();

    if (!Number.isInteger(otherId) || otherId === userId) {
        res.status(400).json({ message: "Invalid conversation" });
        return;
    }
    if (!body) {
        res.status(400).json({ message: "Message cannot be empty" });
        return;
    }
    if (body.length > MESSAGE_MAX_LENGTH) {
        res.status(400).json({ message: `Message must be ${MESSAGE_MAX_LENGTH} characters or fewer` });
        return;
    }

    ensureAcceptedFriendship(userId, otherId, res, () => {
        getOrCreateConversation(userId, otherId, (cErr, conversation) => {
            if (cErr) {
                console.error(cErr);
                res.status(500).json({ message: "Database error" });
                return;
            }

            // Rule: a message notifies only if it is the sender's first message
            // after the other user's reply (or the very first message).
            db.query(
                "SELECT sender_id FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 1",
                [conversation.id],
                (lastErr, lastRows) => {
                    if (lastErr) {
                        console.error(lastErr);
                        res.status(500).json({ message: "Database error" });
                        return;
                    }

                    const triggersNotification = lastRows.length === 0 || lastRows[0].sender_id !== userId;

                    db.query(
                        "INSERT INTO messages (conversation_id, sender_id, body, triggers_notification) VALUES (?, ?, ?, ?)",
                        [conversation.id, userId, body, triggersNotification],
                        (insErr, result) => {
                            if (insErr) {
                                console.error(insErr);
                                res.status(500).json({ message: "Database error" });
                                return;
                            }

                            db.query(
                                "UPDATE conversations SET last_message_at = NOW() WHERE id = ?",
                                [conversation.id],
                                (upErr) => {
                                    if (upErr) {
                                        console.error(upErr);
                                        res.status(500).json({ message: "Database error" });
                                        return;
                                    }
                                    res.status(201).json({
                                        id: result.insertId,
                                        senderId: userId,
                                        body,
                                        fromMe: true,
                                        readAt: null,
                                        createdAt: new Date()
                                    });
                                }
                            );
                        }
                    );
                }
            );
        });
    });
});

// Explicitly mark a buddy's messages as read (clears unread badge).
app.put("/messages/conversations/:userId/read", authenticateToken, (req, res) => {
    const userId = req.user.id;
    const otherId = parseInt(req.params.userId, 10);

    if (!Number.isInteger(otherId)) {
        res.status(400).json({ message: "Invalid conversation" });
        return;
    }

    getOrCreateConversation(userId, otherId, (cErr, conversation) => {
        if (cErr) {
            console.error(cErr);
            res.status(500).json({ message: "Database error" });
            return;
        }
        db.query(
            "UPDATE messages SET read_at = NOW() WHERE conversation_id = ? AND sender_id = ? AND read_at IS NULL",
            [conversation.id, otherId],
            (err) => {
                if (err) {
                    console.error(err);
                    res.status(500).json({ message: "Database error" });
                    return;
                }
                res.status(200).json({ message: "Marked as read" });
            }
        );
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running on port ${PORT}`);
});