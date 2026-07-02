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

    const [columns] = await connection.query("SHOW COLUMNS FROM users");
    const names = columns.map((col) => col.Field);

    if (!names.includes("total_focus_minutes")) {
        await connection.query(
            "ALTER TABLE users ADD COLUMN total_focus_minutes INT DEFAULT 0"
        );
    }

    await connection.query(`
        UPDATE users u
        SET total_focus_minutes = (
            SELECT COALESCE(SUM(time_spent), 0)
            FROM tasks t
            WHERE t.user_id = u.id
        )
        WHERE total_focus_minutes = 0
    `);

    await connection.end();
    console.log("Focus analytics migration complete.");
}

migrate().catch((err) => {
    console.error("Migration failed:", err.message);
    process.exit(1);
});
