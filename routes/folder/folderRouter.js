const express = require("express");
const folderRouter = express.Router();
const pool = require("../../db/dbClient");
const {
  verifyTenantAccess,
  getFolderById,
} = require("../helpers/role-ownership");

// creating folder

folderRouter.post("/", async (req, res) => {
  const { name, tenant_id, parent_id } = req.body;
  const user_id = req.user.user_id;

  if (!name || !tenant_id)
    return res.status(400).json({ message: "name and tenant_id required" });

  try {
    if (!(await verifyTenantAccess(user_id, tenant_id)))
      return res.status(403).json({ message: "Forbidden" });

    if (parent_id) {
      const parent = await getFolderById(parent_id);
      if (!parent)
        return res.status(404).json({ message: "Parent folder not found" });
      if (parent.tenant_id !== tenant_id)
        return res
          .status(400)
          .json({ message: "Parent folder belongs to another tenant" });
    }

    const result = await pool.query(
      `INSERT INTO folders (tenant_id, name, parent_id, created_by)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [tenant_id, name, parent_id || null, user_id],
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// returnign folder tree
folderRouter.get("/:tenant_id", async (req, res) => {
  const tenant_id = req.params.tenant_id;
  const user_id = req.user.user_id;

  try {
    if (!(await verifyTenantAccess(user_id, tenant_id)))
      return res.status(403).json({ message: "Forbidden" });

    const { rows: folders } = await pool.query(
      "SELECT * FROM folders WHERE tenant_id=$1 ORDER BY created_at ASC",
      [tenant_id],
    );

    const map = {};
    folders.forEach((f) => {
      f.children = [];
      map[f.id] = f;
    });

    const tree = [];
    folders.forEach((f) => {
      if (f.parent_id) map[f.parent_id]?.children.push(f);
      else tree.push(f);
    });

    res.json(tree);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});
// returning folders and files based on path --> GET /api/folders/:tenant_id/path?path=1/5/9
folderRouter.get("/:tenant_id/path", async (req, res) => {
  const { tenant_id } = req.params;
  const { path } = req.query; // string like "1/5/9"
  const user_id = req.user.user_id;

  try {
    // 1. Verify user access to tenant
    if (!(await verifyTenantAccess(user_id, tenant_id)))
      return res.status(403).json({ message: "Forbidden" });

    // 2. Parse path
    const pathArr =
      typeof path === "string" && path.length > 0 ? path.split("/") : [];
    const currentFolderId = pathArr.length
      ? Number(pathArr[pathArr.length - 1])
      : null;

    // 3. Fetch breadcrumb folders
    let breadcrumb = [];

    if (pathArr.length) {
      const breadcrumbRes = await pool.query(
        `SELECT id, name FROM folders WHERE id = ANY($1::bigint[])`,
        [pathArr.map(Number)],
      );
      const map = new Map(breadcrumbRes.rows.map((r) => [String(r.id), r]));
      breadcrumb = pathArr.map((id) => map.get(id)).filter(Boolean);
    }

    // 4. Fetch child folders
    const foldersRes = await pool.query(
      `SELECT id, name FROM folders
       WHERE tenant_id = $1 AND parent_id ${currentFolderId ? "= $2" : "IS NULL"}
       ORDER BY created_at ASC`,
      currentFolderId ? [tenant_id, currentFolderId] : [tenant_id],
    );
    const folders = foldersRes.rows;

    // 5. Fetch files in current folder
    let files = [];
    if (currentFolderId) {
      const filesRes = await pool.query(
        `SELECT f.*, ac.role
         FROM files f
         LEFT JOIN access_controls ac
           ON f.id = ac.file_id AND ac.user_id = $1
         WHERE f.folder_id = $2
         ORDER BY f.created_at ASC`,
        [user_id, currentFolderId],
      );
      files = filesRes.rows;
    }

    // 6. Return same JSON shape as before
    res.json({
      currentFolder: breadcrumb.length
        ? breadcrumb[breadcrumb.length - 1]
        : null,
      breadcrumb,
      folders,
      files,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});
// renaming  folder
folderRouter.put("/:id", async (req, res) => {
  const folder_id = req.params.id;
  const { name } = req.body;
  const user_id = req.user.user_id;

  if (!name) return res.status(400).json({ message: "Folder name required" });

  try {
    const folder = await getFolderById(folder_id);
    if (!folder) return res.status(404).json({ message: "Folder not found" });
    if (folder.created_by !== user_id)
      return res.status(403).json({ message: "Only creator can rename" });

    const result = await pool.query(
      "UPDATE folders SET name=$1, updated_at=NOW() WHERE id=$2 RETURNING *",
      [name, folder_id],
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// deleting folder
folderRouter.delete("/:id", async (req, res) => {
  const folder_id = req.params.id;
  const user_id = req.user.user_id;

  try {
    const folder = await getFolderById(folder_id);
    if (!folder) return res.status(404).json({ message: "Folder not found" });
    if (folder.created_by !== user_id)
      return res.status(403).json({ message: "Only owner can delete" });

    await pool.query("DELETE FROM folders WHERE id=$1", [folder_id]);
    res.json({ message: "Folder deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

//moving folder
folderRouter.patch("/:id/move", async (req, res) => {
  const folder_id = req.params.id;
  const { new_parent_id } = req.body;
  const user_id = req.user.user_id;

  try {
    const folder = await getFolderById(folder_id);
    if (!folder) return res.status(404).json({ message: "Folder not found" });
    if (folder.created_by !== user_id)
      return res.status(403).json({ message: "Only owner can move folder" });

    if (folder_id == new_parent_id)
      return res
        .status(400)
        .json({ message: "Cannot move folder into itself" });

    const { rows: allFolders } = await pool.query(
      "SELECT id,parent_id FROM folders WHERE tenant_id=$1",
      [folder.tenant_id],
    );
    const map = {};
    allFolders.forEach((f) => (map[f.id] = f));

    let current = new_parent_id;
    while (current) {
      if (parseInt(current) === parseInt(folder_id))
        return res
          .status(400)
          .json({ message: "Cannot move folder into its child" });
      current = map[current]?.parent_id;
    }

    const result = await pool.query(
      "UPDATE folders SET parent_id=$1, updated_at=NOW() WHERE id=$2 RETURNING *",
      [new_parent_id || null, folder_id],
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = folderRouter;
