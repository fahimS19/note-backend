const express = require("express");
const authRouter = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const pool = require("../../db/dbClient");
const authMiddleware = require("../../middlewares/auth/authMiddleware");

// REGISTER USER (without tenant first)
authRouter.post("/register", async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res
      .status(400)
      .json({ message: "All fields required to register yourself" });
  }
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (username, email, password)
       VALUES ($1, $2, $3)
       RETURNING id, username, email`,
      [username, email, hashedPassword],
    );
    res.status(201).json({ user: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// LOGIN USER
authRouter.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query(
      `SELECT id, username, email, password FROM users WHERE email=$1`,
      [email],
    );
    if (result.rows.length === 0)
      return res
        .status(400)
        .json({ message: "User with this email does not exist" });
    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid password" });
    // Generate token (does not include tenant yet)
    const token = jwt.sign({ user_id: user.id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN,
    });
    res
      .cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "none",
        maxAge: 1000 * 60 * 60 * 24, // 1 day
      })
      .json({ message: "Login successful" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});
// logout user
authRouter.post("/logout", (_req, res) => {
  res.clearCookie("token").json({ message: "Logged out" });
});
// getting current user info
authRouter.get("/me", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, username
       FROM users
       WHERE id = $1`,
      [req.user.user_id],
    );

    if (!result.rows.length)
      return res.status(404).json({ message: "User not found" });

    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});
// CREATE TENANT (user must be logged in)
authRouter.post("/tenant", authMiddleware, async (req, res) => {
  const { name, password } = req.body;
  const user_id = req.user.user_id; // attached from auth middleware

  if (!name || !password)
    return res
      .status(400)
      .json({ message: "Tenant name and password required" });

  try {
    const hashedTenantPassword = await bcrypt.hash(password, 10);
    const tenantResult = await pool.query(
      `INSERT INTO tenants (name, password, owner_id)
       VALUES ($1, $2, $3)
       RETURNING id, name, owner_id`,
      [name, hashedTenantPassword, user_id],
    );
    const tenant = tenantResult.rows[0];
    await pool.query(
      `INSERT INTO tenant_users (tenant_id, user_id, role)
       VALUES ($1, $2, 'owner')`,
      [tenant.id, user_id],
    );

    res.status(201).json({ tenant });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// JOIN EXISTING TENANT (user must be logged in)
authRouter.post("/tenant/join", authMiddleware, async (req, res) => {
  const { tenant_name, tenant_password } = req.body;
  const user_id = req.user.user_id;

  if (!tenant_name || !tenant_password)
    return res
      .status(400)
      .json({ message: "Tenant name and password required" });

  try {
    const tenantResult = await pool.query(
      `SELECT id, password FROM tenants WHERE name=$1`,
      [tenant_name],
    );

    if (!tenantResult.rows.length)
      return res.status(404).json({ message: "Tenant not found" });

    const tenant = tenantResult.rows[0];
    const isMatch = await bcrypt.compare(tenant_password, tenant.password);
    if (!isMatch)
      return res.status(400).json({ message: "Incorrect tenant password" });

    await pool.query(
      `INSERT INTO tenant_users (tenant_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [tenant.id, user_id],
    );

    res.json({ message: "Joined tenant successfully", tenant_id: tenant.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});
// GET TENANTS FOR LOGGED-IN USER
authRouter.get("/tenants", authMiddleware, async (req, res) => {
  const user_id = req.user.user_id;

  try {
    const result = await pool.query(
      `SELECT t.id, t.name, tu.role
       FROM tenant_users tu
       JOIN tenants t ON t.id = tu.tenant_id
       WHERE tu.user_id = $1
       ORDER BY tu.joined_at ASC`,
      [user_id],
    );

    res.json({ tenants: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});
module.exports = authRouter;
