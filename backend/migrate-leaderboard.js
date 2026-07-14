require("dotenv").config();
const mysql = require("mysql2/promise");

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
    if (!names.includes("show_on_leaderboard")) {
        await connection.query(
            "ALTER TABLE users ADD COLUMN show_on_leaderboard BOOLEAN DEFAULT TRUE"
        );
    }

    await connection.query(`
        CREATE TABLE IF NOT EXISTS focus_day_stats (
            user_id INT NOT NULL,
            activity_date DATE NOT NULL,
            minutes INT NOT NULL DEFAULT 0,
            PRIMARY KEY (user_id, activity_date),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
    `);

    await connection.end();
    console.log("Leaderboard migration complete.");
}

migrate().catch((err) => {
    console.error("Migration failed:", err.message);
    process.exit(1);
});
