require("dotenv").config();
const { Pool } = require("pg");

// Create a single global pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // needed for Neon
  },
});

module.exports = pool;
