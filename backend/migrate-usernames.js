require("dotenv").config();
const mysql = require("mysql2/promise");

function randomFriendCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
}

function baseFromEmail(email) {
    const local = email.split("@")[0] || "user";
    const cleaned = local.replace(/[^a-z0-9_]/gi, "").toLowerCase();
    return cleaned.length >= 3 ? cleaned.slice(0, 12) : "user";
}

async function uniqueUsername(connection, email, excludeId = null) {
    let base = baseFromEmail(email);
    let candidate = base;
    let counter = 0;

    while (true) {
        const params = excludeId ? [candidate, excludeId] : [candidate];
        const sql = excludeId
            ? "SELECT id FROM users WHERE username = ? AND id <> ?"
            : "SELECT id FROM users WHERE username = ?";
        const [rows] = await connection.query(sql, params);
        if (rows.length === 0) {
            return candidate.slice(0, 20);
        }
        counter += 1;
        candidate = `${base}${counter}`.slice(0, 20);
    }
}

async function uniqueFriendCode(connection) {
    while (true) {
        const code = randomFriendCode();
        const [rows] = await connection.query("SELECT id FROM users WHERE friend_code = ?", [code]);
        if (rows.length === 0) {
            return code;
        }
    }
}

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
            ADD COLUMN IF NOT EXISTS username VARCHAR(20) NULL,
            ADD COLUMN IF NOT EXISTS friend_code CHAR(6) NULL;
    `).catch(async () => {
        const [columns] = await connection.query("SHOW COLUMNS FROM users");
        const names = columns.map((col) => col.Field);
        if (!names.includes("username")) {
            await connection.query("ALTER TABLE users ADD COLUMN username VARCHAR(20) NULL");
        }
        if (!names.includes("friend_code")) {
            await connection.query("ALTER TABLE users ADD COLUMN friend_code CHAR(6) NULL");
        }
    });

    const [users] = await connection.query(
        "SELECT id, email FROM users WHERE username IS NULL OR username = '' OR friend_code IS NULL OR friend_code = ''"
    );

    for (const user of users) {
        const username = await uniqueUsername(connection, user.email, user.id);
        const friendCode = await uniqueFriendCode(connection);
        await connection.query(
            "UPDATE users SET username = ?, friend_code = ? WHERE id = ?",
            [username, friendCode, user.id]
        );
        console.log(`Updated user ${user.id}: @${username} · #${friendCode}`);
    }

    await connection.query(`
        ALTER TABLE users
            MODIFY username VARCHAR(20) NOT NULL,
            MODIFY friend_code CHAR(6) NOT NULL;
    `).catch(() => {
        console.log("Note: run UNIQUE indexes manually if columns were just backfilled.");
    });

    try {
        await connection.query("CREATE UNIQUE INDEX idx_users_username ON users (username)");
    } catch {
        // index may already exist
    }

    try {
        await connection.query("CREATE UNIQUE INDEX idx_users_friend_code ON users (friend_code)");
    } catch {
        // index may already exist
    }

    await connection.end();
    console.log("Username and friend code migration complete.");
}

migrate().catch((err) => {
    console.error("Migration failed:", err.message);
    process.exit(1);
});
