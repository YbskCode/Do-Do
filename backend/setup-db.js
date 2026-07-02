require("dotenv").config();
const mysql = require("mysql2/promise");
const fs = require("fs");
const path = require("path");

async function setup() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        multipleStatements: true
    });

    const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
    await connection.query(schema);
    await connection.end();
    console.log("Database and tables ready.");
}

setup().catch((err) => {
    console.error("Setup failed:", err.message);
    process.exit(1);
});
