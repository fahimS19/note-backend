const fs = require("fs");
const path = require("path");
const pool = require("./dbClient");

async function runMigrations() {
  const migrationsDir = path.join(__dirname, "migrations");
  const files = fs.readdirSync(migrationsDir).sort(); // ensure order

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, "utf8");

    try {
      await pool.query(sql);
      console.log(`✅ Migration ${file} executed successfully`);
    } catch (err) {
      console.error(`❌ Error running migration ${file}:`, err.message);
    }
  }

  console.log("All migrations finished");
  pool.end();
}

runMigrations();
