require("dotenv").config();
const mysql = require("mysql2/promise");

const ACHIEVEMENTS = [
    {
        key: "first_focus",
        title: "First Focus",
        description: "Complete your first pomodoro session.",
        icon: "fa-play",
        category: "focus",
        sort_order: 10
    },
    {
        key: "pomodoro_lover",
        title: "Pomodoro Lover",
        description: "Spend 200 minutes focusing.",
        icon: "fa-heart",
        category: "focus",
        sort_order: 20
    },
    {
        key: "pomodoro_expert",
        title: "Pomodoro Expert",
        description: "Spend 1,000 minutes focusing.",
        icon: "fa-star",
        category: "focus",
        sort_order: 30
    },
    {
        key: "sensei_of_pomodoro",
        title: "Sensei of Pomodoro",
        description: "Spend 5,000 minutes focusing.",
        icon: "fa-crown",
        category: "focus",
        sort_order: 40
    },
    {
        key: "buddy_up",
        title: "Buddy Up",
        description: "Add your first study buddy.",
        icon: "fa-user-plus",
        category: "social",
        sort_order: 50
    },
    {
        key: "very_friendly",
        title: "Very Friendly",
        description: "Add 20 study buddies.",
        icon: "fa-users",
        category: "social",
        sort_order: 60
    },
    {
        key: "lets_study_friend",
        title: "Let's Study Friend",
        description: "Spend 200 minutes studying with buddies.",
        icon: "fa-handshake",
        category: "social",
        sort_order: 70
    },
    {
        key: "lets_study_gang",
        title: "Let's Study Gang",
        description: "Spend 1,000 minutes studying with buddies.",
        icon: "fa-people-group",
        category: "social",
        sort_order: 80
    },
    {
        key: "lets_study_bro",
        title: "Let's Study Bro",
        description: "Spend 5,000 minutes studying with buddies.",
        icon: "fa-trophy",
        category: "social",
        sort_order: 90
    },
    {
        key: "streak_starter",
        title: "Streak Starter",
        description: "Reach a 3-day focus streak.",
        icon: "fa-fire",
        category: "streak",
        sort_order: 100
    },
    {
        key: "week_warrior",
        title: "Week Warrior",
        description: "Reach a 7-day focus streak.",
        icon: "fa-fire-flame-curved",
        category: "streak",
        sort_order: 110
    },
    {
        key: "checklist_champ",
        title: "Checklist Champ",
        description: "Complete 10 tasks.",
        icon: "fa-list-check",
        category: "tasks",
        sort_order: 120
    }
];

async function migrate() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        multipleStatements: true
    });

    const [columns] = await connection.query("SHOW COLUMNS FROM users");
    const names = columns.map((col) => col.Field);
    if (!names.includes("shared_focus_minutes")) {
        await connection.query(
            "ALTER TABLE users ADD COLUMN shared_focus_minutes INT DEFAULT 0"
        );
    }

    await connection.query(`
        CREATE TABLE IF NOT EXISTS achievements (
            id INT AUTO_INCREMENT PRIMARY KEY,
            achievement_key VARCHAR(64) NOT NULL UNIQUE,
            title VARCHAR(120) NOT NULL,
            description VARCHAR(255) NOT NULL,
            icon VARCHAR(64) NOT NULL DEFAULT 'fa-medal',
            category VARCHAR(32) NOT NULL DEFAULT 'general',
            sort_order INT NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS user_achievements (
            user_id INT NOT NULL,
            achievement_id INT NOT NULL,
            unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, achievement_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (achievement_id) REFERENCES achievements(id) ON DELETE CASCADE
        );
    `);

    for (const achievement of ACHIEVEMENTS) {
        await connection.query(
            `INSERT INTO achievements (achievement_key, title, description, icon, category, sort_order)
             VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                title = VALUES(title),
                description = VALUES(description),
                icon = VALUES(icon),
                category = VALUES(category),
                sort_order = VALUES(sort_order)`,
            [
                achievement.key,
                achievement.title,
                achievement.description,
                achievement.icon,
                achievement.category,
                achievement.sort_order
            ]
        );
    }

    // Best-effort backfill of shared focus minutes from completed Study Together sessions
    try {
        await connection.query(`
            UPDATE users u
            JOIN (
                SELECT sp.user_id, COALESCE(SUM(s.duration_minutes), 0) AS mins
                FROM study_sessions s
                JOIN session_participants sp
                    ON sp.session_id = s.id AND sp.status = 'joined'
                WHERE s.status = 'completed'
                   OR (s.status = 'active' AND s.ends_at IS NOT NULL AND s.ends_at <= NOW())
                GROUP BY sp.user_id
            ) x ON x.user_id = u.id
            SET u.shared_focus_minutes = GREATEST(COALESCE(u.shared_focus_minutes, 0), x.mins)
        `);
    } catch (err) {
        console.warn("Skipped shared minutes backfill:", err.message);
    }

    await connection.end();
    console.log("Achievements migration complete.");
}

migrate().catch((err) => {
    console.error("Migration failed:", err.message);
    process.exit(1);
});
