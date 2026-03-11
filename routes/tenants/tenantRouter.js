const express = require("express");
const tenantRouter = express.Router();
const pool = require("../../db/dbClient");

tenantRouter.get("/:tenantId/members", async (req, res) => {
  const { tenantId } = req.params;
  const user_id = req.user.user_id;
  try {
    // Verify requesting user belongs to the tenant
    const membershipCheck = await pool.query(
      `
      SELECT 1
      FROM tenant_users
      WHERE tenant_id = $1 AND user_id = $2
      `,
      [tenantId, user_id],
    );
    if (!membershipCheck.rows.length) {
      return res
        .status(403)
        .json({ message: "You are not a member of this tenant" });
    }
    // Fetch all members of this tenant
    const members = await pool.query(
      `
      SELECT 
        u.id,
        u.username,
        tu.role,
        tu.joined_at
      FROM tenant_users tu
      JOIN users u ON u.id = tu.user_id
      WHERE tu.tenant_id = $1
      ORDER BY
        CASE
          WHEN tu.role = 'owner' THEN 1
          ELSE 2
        END,
        u.username ASC
      `,
      [tenantId],
    );
    res.json({
      members: members.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});
module.exports = { tenantRouter };
