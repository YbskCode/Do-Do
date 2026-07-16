/**
 * Achievements: definitions, evaluation, and HTTP routes.
 * Mount with: require("./achievements").register(app, { db, authenticateToken, getEffectiveCurrentStreak });
 */

const ACHIEVEMENT_RULES = {
    first_focus: { type: "focusMinutes", threshold: 1 },
    pomodoro_lover: { type: "focusMinutes", threshold: 200 },
    pomodoro_expert: { type: "focusMinutes", threshold: 1000 },
    sensei_of_pomodoro: { type: "focusMinutes", threshold: 5000 },
    buddy_up: { type: "buddyCount", threshold: 1 },
    very_friendly: { type: "buddyCount", threshold: 20 },
    lets_study_friend: { type: "sharedMinutes", threshold: 200 },
    lets_study_gang: { type: "sharedMinutes", threshold: 1000 },
    lets_study_bro: { type: "sharedMinutes", threshold: 5000 },
    streak_starter: { type: "longestStreak", threshold: 3 },
    week_warrior: { type: "longestStreak", threshold: 7 },
    month_master: { type: "longestStreak", threshold: 30 },
    checklist_champ: { type: "tasksCompleted", threshold: 10 }
};

function register(app, { db, authenticateToken, getEffectiveCurrentStreak, getAcceptedFriendIds }) {
    function getAchievementStats(userId, callback) {
        db.query(
            `SELECT
                COALESCE(total_focus_minutes, 0) AS totalFocusMinutes,
                COALESCE(shared_focus_minutes, 0) AS sharedFocusMinutes,
                COALESCE(longest_streak, 0) AS longestStreak,
                COALESCE(current_streak, 0) AS currentStreak,
                last_streak_date AS lastStreakDate
             FROM users WHERE id = ?`,
            [userId],
            (userErr, userRows) => {
                if (userErr) {
                    if (userErr.code === "ER_BAD_FIELD_ERROR") {
                        db.query(
                            `SELECT
                                COALESCE(total_focus_minutes, 0) AS totalFocusMinutes,
                                0 AS sharedFocusMinutes,
                                COALESCE(longest_streak, 0) AS longestStreak,
                                COALESCE(current_streak, 0) AS currentStreak,
                                last_streak_date AS lastStreakDate
                             FROM users WHERE id = ?`,
                            [userId],
                            (fallbackErr, fallbackRows) => {
                                if (fallbackErr) {
                                    callback(fallbackErr);
                                    return;
                                }
                                continueWithUser(fallbackRows);
                            }
                        );
                        return;
                    }
                    callback(userErr);
                    return;
                }
                continueWithUser(userRows);
            }
        );

        function continueWithUser(userRows) {
            if (!userRows.length) {
                callback(null, null);
                return;
            }

            const user = userRows[0];
            db.query(
                `SELECT COUNT(*) AS buddyCount
                 FROM friendships
                 WHERE status = 'accepted'
                   AND (requester_id = ? OR addressee_id = ?)`,
                [userId, userId],
                (buddyErr, buddyRows) => {
                    if (buddyErr) {
                        callback(buddyErr);
                        return;
                    }

                    db.query(
                        `SELECT COUNT(*) AS tasksCompleted
                         FROM tasks
                         WHERE user_id = ? AND task_completed = true AND task_archived = false`,
                        [userId],
                        (taskErr, taskRows) => {
                            if (taskErr) {
                                callback(taskErr);
                                return;
                            }

                            callback(null, {
                                focusMinutes: Number(user.totalFocusMinutes) || 0,
                                sharedMinutes: Number(user.sharedFocusMinutes) || 0,
                                longestStreak: Math.max(
                                    Number(user.longestStreak) || 0,
                                    getEffectiveCurrentStreak(user.currentStreak, user.lastStreakDate)
                                ),
                                buddyCount: Number(buddyRows[0]?.buddyCount) || 0,
                                tasksCompleted: Number(taskRows[0]?.tasksCompleted) || 0
                            });
                        }
                    );
                }
            );
        }
    }

    function progressForRule(rule, stats) {
        if (!rule) return { current: 0, target: 1, unlocked: false };
        const current = Number(stats[rule.type]) || 0;
        const target = rule.threshold;
        return {
            current: Math.min(current, target),
            target,
            unlocked: current >= target
        };
    }

    function evaluateAchievements(userId, callback, options = {}) {
        const persistUnlocks = options.persistUnlocks !== false;

        getAchievementStats(userId, (statsErr, stats) => {
            if (statsErr) {
                callback(statsErr);
                return;
            }
            if (!stats) {
                callback(null, { achievements: [], newlyUnlocked: [], stats: null });
                return;
            }

            db.query(
                `SELECT a.id, a.achievement_key, a.title, a.description, a.icon, a.category, a.sort_order,
                        ua.unlocked_at
                 FROM achievements a
                 LEFT JOIN user_achievements ua
                    ON ua.achievement_id = a.id AND ua.user_id = ?
                 ORDER BY a.sort_order ASC, a.id ASC`,
                [userId],
                (listErr, rows) => {
                    if (listErr) {
                        callback(listErr);
                        return;
                    }

                    const toUnlock = [];
                    const achievements = rows.map((row) => {
                        const rule = ACHIEVEMENT_RULES[row.achievement_key] || null;
                        const progress = progressForRule(rule, stats);
                        const alreadyUnlocked = !!row.unlocked_at;
                        if (persistUnlocks && !alreadyUnlocked && progress.unlocked) {
                            toUnlock.push(row);
                        }
                        return {
                            id: row.id,
                            key: row.achievement_key,
                            title: row.title,
                            description: row.description,
                            icon: row.icon,
                            category: row.category,
                            unlocked: alreadyUnlocked || progress.unlocked,
                            unlockedAt: row.unlocked_at || null,
                            progress: {
                                current: progress.current,
                                target: progress.target
                            }
                        };
                    });

                    if (!persistUnlocks || toUnlock.length === 0) {
                        callback(null, {
                            achievements,
                            newlyUnlocked: [],
                            stats,
                            unlockedCount: achievements.filter((a) => a.unlocked).length,
                            totalCount: achievements.length
                        });
                        return;
                    }

                    const values = toUnlock.map((row) => [userId, row.id]);
                    db.query(
                        "INSERT IGNORE INTO user_achievements (user_id, achievement_id) VALUES ?",
                        [values],
                        (insertErr) => {
                            if (insertErr) {
                                callback(insertErr);
                                return;
                            }

                            const now = new Date();
                            const newlyUnlocked = toUnlock.map((row) => ({
                                id: row.id,
                                key: row.achievement_key,
                                title: row.title,
                                description: row.description,
                                icon: row.icon,
                                category: row.category
                            }));

                            const updated = achievements.map((item) => {
                                if (newlyUnlocked.some((n) => n.key === item.key)) {
                                    return { ...item, unlocked: true, unlockedAt: now };
                                }
                                return item;
                            });

                            callback(null, {
                                achievements: updated,
                                newlyUnlocked,
                                stats,
                                unlockedCount: updated.filter((a) => a.unlocked).length,
                                totalCount: updated.length
                            });
                        }
                    );
                }
            );
        });
    }

    function sendAchievementError(res, err) {
        console.error(err);
        if (err.code === "ER_NO_SUCH_TABLE") {
            res.status(503).json({ message: "Achievements not ready — run migrate-achievements.js" });
            return;
        }
        res.status(500).json({ message: "Database error" });
    }

    app.get("/achievements", authenticateToken, (req, res) => {
        evaluateAchievements(req.user.id, (err, result) => {
            if (err) {
                sendAchievementError(res, err);
                return;
            }
            res.status(200).json(result);
        });
    });

    // View a buddy's achievements (accepted friends only; does not unlock for them)
    app.get("/achievements/user/:userId", authenticateToken, (req, res) => {
        const viewerId = req.user.id;
        const targetId = parseInt(req.params.userId, 10);

        if (!Number.isInteger(targetId)) {
            res.status(400).json({ message: "Invalid user id" });
            return;
        }

        if (targetId === viewerId) {
            evaluateAchievements(viewerId, (err, result) => {
                if (err) {
                    sendAchievementError(res, err);
                    return;
                }
                res.status(200).json(result);
            });
            return;
        }

        if (typeof getAcceptedFriendIds !== "function") {
            res.status(500).json({ message: "Friend lookup unavailable" });
            return;
        }

        getAcceptedFriendIds(viewerId, (friendErr, friendIds) => {
            if (friendErr) {
                console.error(friendErr);
                res.status(500).json({ message: "Database error" });
                return;
            }

            if (!friendIds.some((id) => Number(id) === targetId)) {
                res.status(403).json({ message: "You can only view achievements of your study buddies" });
                return;
            }

            db.query(
                "SELECT id, name, username FROM users WHERE id = ?",
                [targetId],
                (userErr, userRows) => {
                    if (userErr) {
                        console.error(userErr);
                        res.status(500).json({ message: "Database error" });
                        return;
                    }
                    if (!userRows.length) {
                        res.status(404).json({ message: "User not found" });
                        return;
                    }

                    evaluateAchievements(targetId, (err, result) => {
                        if (err) {
                            sendAchievementError(res, err);
                            return;
                        }
                        res.status(200).json({
                            ...result,
                            user: {
                                id: userRows[0].id,
                                name: userRows[0].name,
                                username: userRows[0].username
                            }
                        });
                    }, { persistUnlocks: false });
                }
            );
        });
    });

    app.post("/achievements/check", authenticateToken, (req, res) => {
        evaluateAchievements(req.user.id, (err, result) => {
            if (err) {
                sendAchievementError(res, err);
                return;
            }
            res.status(200).json({
                newlyUnlocked: result.newlyUnlocked,
                unlockedCount: result.unlockedCount,
                totalCount: result.totalCount
            });
        });
    });
}

module.exports = { register, ACHIEVEMENT_RULES };
