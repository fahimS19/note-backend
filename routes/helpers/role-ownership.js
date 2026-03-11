const pool = require("../../db/dbClient");
// Verify user belongs to tenant
async function verifyTenantAccess(user_id, tenant_id) {
  const res = await pool.query(
    "SELECT 1 FROM tenant_users WHERE user_id=$1 AND tenant_id=$2",
    [user_id, tenant_id],
  );
  return res.rows.length > 0;
}

// Get file by ID
async function getFileById(file_id) {
  const res = await pool.query("SELECT * FROM files WHERE id=$1", [file_id]);
  return res.rows[0];
}

// Get role of user for file
async function getFileRole(user_id, file) {
  const res = await pool.query(
    "SELECT role FROM access_controls WHERE user_id=$1 AND file_id=$2",
    [user_id, file.id],
  );
  return res.rows.length ? res.rows[0].role : "viewer";
}

// Check if user is owner
async function isOwner(user_id, file) {
  const role = await getFileRole(user_id, file);
  return role === "owner";
}

// Check if user is editor
async function isEditor(user_id, file) {
  const role = await getFileRole(user_id, file);
  return role === "editor";
}
// Get folder by id
async function getFolderById(folder_id) {
  const res = await pool.query("SELECT * FROM folders WHERE id=$1", [
    folder_id,
  ]);
  return res.rows[0];
}
module.exports = {
  verifyTenantAccess,
  getFileById,
  getFileRole,
  isOwner,
  isEditor,
  getFolderById,
};
