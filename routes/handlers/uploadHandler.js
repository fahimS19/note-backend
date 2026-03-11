const path = require("path");
const pool = require("../../db/dbClient");
const { verifyTenantAccess } = require("../helpers/role-ownership");
async function uploadHandler(req, res) {
  let { folder_id } = req.body;
  if (folder_id === "null" || folder_id === "undefined") {
    folder_id = null;
  }
  const user_id = req.user.user_id;
  const file = req.file;
  if (!folder_id)
    return res.status(400).json({ message: "folder_id required" });
  if (!file) return res.status(400).json({ message: "File required" });
  const ext = path.extname(file.originalname).toLowerCase();
  if (![".txt", ".md"].includes(ext)) {
    return res.status(400).json({
      message: "Only .txt and .md files allowed",
    });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    /* -------- VERIFY FOLDER -------- */
    const folderRes = await client.query(
      "SELECT tenant_id FROM folders WHERE id=$1",
      [folder_id],
    );

    if (!folderRes.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Folder not found" });
    }

    const tenant_id = folderRes.rows[0].tenant_id;

    if (!(await verifyTenantAccess(user_id, tenant_id))) {
      await client.query("ROLLBACK");
      return res.status(403).json({ message: "Forbidden" });
    }
    /* -------- READ FILE CONTENT -------- */
    const content = file.buffer.toString("utf-8");
    /* -------- INSERT FILE -------- */
    const fileRes = await client.query(
      `INSERT INTO files (tenant_id, folder_id, name, content)
       VALUES ($1,$2,$3,$4)
       RETURNING *`,
      [tenant_id, folder_id, file.originalname, content],
    );
    const newFile = fileRes.rows[0];
    /* -------- INSERT ACCESS CONTROL -------- */
    await client.query(
      `INSERT INTO access_controls
       (tenant_id,user_id,file_id,role,granted_by)
       VALUES ($1,$2,$3,'owner',$2)`,
      [tenant_id, user_id, newFile.id],
    );
    /* -------- COMMIT TRANSACTION -------- */
    await client.query("COMMIT");
    res.status(201).json(newFile);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  } finally {
    client.release();
  }
}
module.exports = { uploadHandler };
