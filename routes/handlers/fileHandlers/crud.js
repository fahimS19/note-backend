const pool = require("../../../db/dbClient");
const {
  verifyTenantAccess,
  getFileById,
  isOwner,
} = require("../../helpers/role-ownership");

async function createFileHandler(req, res) {
  const { name, folder_id, content } = req.body;
  const user_id = req.user.user_id;
  if (!name || !folder_id)
    return res.status(400).json({ message: "Name and folder_id required" });

  try {
    const folderRes = await pool.query(
      "SELECT tenant_id FROM folders WHERE id=$1",
      [folder_id],
    );
    if (!folderRes.rows.length)
      return res.status(404).json({ message: "Folder not found" });

    const tenant_id = folderRes.rows[0].tenant_id;
    if (!(await verifyTenantAccess(user_id, tenant_id)))
      return res.status(403).json({ message: "Forbidden" });

    // Create file
    const fileRes = await pool.query(
      "INSERT INTO files (tenant_id, folder_id, name, content) VALUES ($1,$2,$3,$4) RETURNING *",
      [tenant_id, folder_id, name, content || ""],
    );
    const file = fileRes.rows[0];

    // Assign owner access
    await pool.query(
      "INSERT INTO access_controls (tenant_id,user_id,file_id,role,granted_by) VALUES ($1,$2,$3,'owner',$2)",
      [tenant_id, user_id, file.id],
    );

    res.status(201).json(file);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
}
async function getFilesInFolder(req, res) {
  const { folder_id } = req.query;
  const user_id = req.user.user_id;
  if (!folder_id)
    return res.status(400).json({ message: "folder_id required" });

  try {
    const folderRes = await pool.query(
      "SELECT tenant_id FROM folders WHERE id=$1",
      [folder_id],
    );
    if (!folderRes.rows.length)
      return res.status(404).json({ message: "Folder not found" });

    const tenant_id = folderRes.rows[0].tenant_id;
    if (!(await verifyTenantAccess(user_id, tenant_id)))
      return res.status(403).json({ message: "Forbidden" });

    const filesRes = await pool.query(
      "SELECT f.*, ac.role FROM files f LEFT JOIN access_controls ac ON f.id=ac.file_id AND ac.user_id=$1 WHERE f.folder_id=$2 ORDER BY f.created_at ASC",
      [user_id, folder_id],
    );

    res.json(filesRes.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
}
async function updateFileHandler(req, res) {
  const user_id = req.user.user_id;
  const file_id = req.params.id;
  const { name, content } = req.body;

  try {
    const file = await getFileById(file_id);
    if (!file) return res.status(404).json({ message: "File not found" });
    if (!(await isOwner(user_id, file)))
      return res.status(403).json({ message: "Only owner can update file" });

    const updatedRes = await pool.query(
      "UPDATE files SET name=COALESCE($1,name), content=COALESCE($2,content), updated_at=NOW() WHERE id=$3 RETURNING *",
      [name, content, file_id],
    );

    res.json(updatedRes.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
}

async function deleteFileHandler(req, res) {
  const file_id = req.params.id;
  const user_id = req.user.user_id;

  try {
    const file = await getFileById(file_id);
    if (!(await isOwner(user_id, file)))
      return res.status(403).json({ message: "Only owner can delete file" });

    await pool.query("DELETE FROM files WHERE id=$1", [file_id]);
    res.json({ message: "File deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
}
module.exports = {
  createFileHandler,
  getFilesInFolder,
  updateFileHandler,
  deleteFileHandler,
};
