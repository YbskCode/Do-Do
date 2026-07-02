require("dotenv").config();
const mysql = require("mysql2/promise");

async function migrate() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        multipleStatements: true
    });

    await connection.query(`
        ALTER TABLE users
            ADD COLUMN IF NOT EXISTS current_streak INT DEFAULT 0,
            ADD COLUMN IF NOT EXISTS longest_streak INT DEFAULT 0,
            ADD COLUMN IF NOT EXISTS last_streak_date DATE NULL;
    `).catch(async () => {
        const [columns] = await connection.query("SHOW COLUMNS FROM users");
        const names = columns.map((col) => col.Field);
        if (!names.includes("current_streak")) {
            await connection.query("ALTER TABLE users ADD COLUMN current_streak INT DEFAULT 0");
        }
        if (!names.includes("longest_streak")) {
            await connection.query("ALTER TABLE users ADD COLUMN longest_streak INT DEFAULT 0");
        }
        if (!names.includes("last_streak_date")) {
            await connection.query("ALTER TABLE users ADD COLUMN last_streak_date DATE NULL");
        }
    });

    await connection.query(`
        CREATE TABLE IF NOT EXISTS streak_days (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            activity_date DATE NOT NULL,
            UNIQUE KEY unique_user_date (user_id, activity_date),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
    `);

    await connection.end();
    console.log("Streak migration complete.");
}

migrate().catch((err) => {
    console.error("Migration failed:", err.message);
    process.exit(1);
});
