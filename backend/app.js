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
    const { name, email, password } = req.body;

    // Check if user already exists
    db.query("SELECT * FROM users WHERE email = ?", [email], (err, results) => {
        if (err) {
            console.error(err);
            res.status(500).json({ message: "Database error"}, err);
            return;
        }

        if (results.length > 0) {
            res.status(400).json({ message: "Email already registered" });
            return;
        }

        // Hash the password before storing it
        bcrypt.hash(password, SALT_ROUNDS, (hashErr, hashedPassword) => {
            if (hashErr) {
                console.error(hashErr);
                res.status(500).json({ message: "Error securing password" });
                return;
            }

            // Insert new user with the hashed password
            db.query("INSERT INTO users (name, email, password) VALUES (?, ?, ?)", 
                [name, email, hashedPassword], 
                (err, results) => {
                if (err) {
                    console.error(err);
                    res.status(500).json({ message: "Database error"}, err);
                    return;
                }
                res.status(201).json({ message: "Registration successful!"});
            });
        });
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
                    { id: user.id, name: user.name, email: user.email },
                    ACTIVE_JWT_SECRET,
                    { expiresIn: "7d" }
                );

                res.status(200).json({ 
                    message: "Login Successful!", 
                    token: token,
                    user: {
                        id:user.id,
                        name: user.name,
                        email: user.email
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running on port ${PORT}`);
});