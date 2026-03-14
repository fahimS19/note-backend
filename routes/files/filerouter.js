const express = require("express");
const fileRouter = express.Router();
const multer = require("multer");
const pool = require("../../db/dbClient");
const {
  verifyTenantAccess,
  getFileById,
  isOwner,
} = require("../helpers/role-ownership");
const { uploadHandler } = require("../handlers/uploadHandler.js");
const {
  createFileHandler,
  getFilesInFolder,
  deleteFileHandler,
  updateFileHandler,
} = require("../handlers/fileHandlers/crud");
const {
  getAllPendingRequestForOwner,
  editReqAcceptHandler,
  editReqRejectHandler,
} = require("../handlers/fileHandlers/edit");
const {
  createUpdatedDraftHandler,
  getDraftsOfAfile,
  acceptDraftHandler,
  deleteDraftHandler,
} = require("../handlers/fileHandlers/draft");
// ----------------------- SETUP -----------------------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB max
});

// ----------------------- FILE CRUD -----------------------
// FILE UPLOAD
fileRouter.post("/upload", upload.single("file"), uploadHandler);
// Create file
fileRouter.post("/", createFileHandler);

// Get files in folder
fileRouter.get("/", getFilesInFolder);
// files owned by a owner under a specific tenant
fileRouter.get("/owned", async (req, res) => {
  const user_id = req.user.user_id;
  const tenant_id = req.query.tenant_id;
  if (!tenant_id) {
    return res.status(400).json({ message: "tenant_id is required" });
  }
  try {
    const filesRes = await pool.query(
      `
      SELECT f.id, f.name, f.created_at
      FROM files f
      JOIN access_controls ac
        ON f.id = ac.file_id
      WHERE ac.user_id = $1
        AND ac.role = 'owner'
        AND f.tenant_id = $2
      ORDER BY f.created_at DESC
      `,
      [user_id, tenant_id],
    );

    res.json({ files: filesRes.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});
//--- getting all pending request for an owner
fileRouter.get("/edit-requests", getAllPendingRequestForOwner);
// Owner: approve/reject requests
fileRouter.post("/edit-requests/:id/approve", editReqAcceptHandler);
fileRouter.delete("/edit-requests/:id", editReqRejectHandler);
// Accept draft (owner)
fileRouter.post("/drafts/:draft_id/accept", acceptDraftHandler);
// getting a single draft with its content
fileRouter.get("/drafts/:id", async (req, res) => {
  const draftId = req.params.id;

  try {
    const result = await pool.query(
      `SELECT d.*, u.username
       FROM file_versions d
       JOIN users u ON u.id = d.author_id
       WHERE d.id = $1`,
      [draftId],
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: "Draft not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});
// Delete draft (owner or author)
fileRouter.delete("/drafts/:draft_id", deleteDraftHandler);
fileRouter.get("/:id/download", async (req, res) => {
  const user_id = req.user.user_id;
  const file_id = req.params.id;
  try {
    const fileRes = await pool.query(
      `SELECT f.*
      FROM files f
      WHERE f.id = $1
      `,
      [file_id],
    );
    if (!fileRes.rows.length)
      return res.status(404).json({ message: "File not found" });
    const file = fileRes.rows[0];
    if (!(await verifyTenantAccess(user_id, file.tenant_id)))
      return res.status(403).json({ message: "Forbidden" });
    // determining content type
    const ext = file.name.endsWith(".md")
      ? "text/markdown"
      : "text/plain;charset=utf-8";
    res.setHeader("Content-Type", ext);
    res.setHeader("Content-Disposition", `attachment; filename="${file.name}"`);

    res.send(file.content);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});
// Request edit access (non-editors)
fileRouter.post("/:id/request-edit", async (req, res) => {
  const user_id = req.user.user_id;
  const file_id = req.params.id;
  try {
    // Fetch the file
    const file = await getFileById(file_id);
    if (!file) return res.status(404).json({ message: "File not found" });

    // Check if a request already exists
    const existsRes = await pool.query(
      "SELECT 1 FROM edit_access_requests WHERE file_id=$1 AND requester_user_id=$2",
      [file_id, user_id],
    );
    if (existsRes.rows.length)
      return res.status(400).json({ message: "Request already exists" });
    // Fetch owner_id from access_controls table
    const ownerRes = await pool.query(
      "SELECT user_id FROM access_controls WHERE file_id=$1 AND role='owner'",
      [file_id],
    );
    if (!ownerRes.rows.length)
      return res.status(500).json({ message: "File owner not found" });
    const file_owner_id = ownerRes.rows[0].user_id;

    // Insert edit access request including file_owner_id
    await pool.query(
      `INSERT INTO edit_access_requests
        (tenant_id, file_id, requester_user_id, file_owner_id)
       VALUES ($1,$2,$3,$4)`,
      [file.tenant_id, file_id, user_id, file_owner_id],
    );

    res.json({ message: "Edit access requested" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

//-------------checking if the edit request is pending
fileRouter.get("/:id/edit-request-status", async (req, res) => {
  const user_id = req.user.user_id;
  const file_id = req.params.id;

  try {
    const result = await pool.query(
      "SELECT 1 FROM edit_access_requests WHERE file_id=$1 AND requester_user_id=$2",
      [file_id, user_id],
    );

    // pending if row exists, otherwise false
    const pending = result.rows.length > 0;
    res.json({ pending });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});
// -- getting all users who have access to a specific file
fileRouter.get("/:id/access", async (req, res) => {
  const file_id = req.params.id;
  const tenant_id = req.query.tenant_id;
  const user_id = req.user.user_id;
  if (!tenant_id) {
    return res.status(400).json({ message: "tenant_id is required" });
  }

  try {
    // Check that current user is owner of this file in this tenant
    const ownerRes = await pool.query(
      `
      SELECT 1 FROM access_controls
      WHERE file_id = $1 AND tenant_id = $2 AND user_id = $3 AND role = 'owner'
      `,
      [file_id, tenant_id, user_id],
    );

    if (!ownerRes.rows.length) {
      return res.status(403).json({ message: "Only owner can view access" });
    }

    // Get all users who have access
    const accessRes = await pool.query(
      `
      SELECT ac.user_id, u.username, ac.role
      FROM access_controls ac
      JOIN users u ON u.id = ac.user_id
      WHERE ac.file_id = $1 AND ac.tenant_id = $2 AND ac.role != 'owner'
      ORDER BY ac.role DESC, u.username ASC
      `,
      [file_id, tenant_id],
    );

    res.json({ access: accessRes.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

fileRouter.post("/:id/grant-access", async (req, res) => {
  const { user_id: target_user_id, role } = req.body;
  const file_id = req.params.id;
  const user_id = req.user.user_id;

  if (!target_user_id || !role)
    return res.status(400).json({ message: "user_id and role required" });

  if (!["editor", "viewer"].includes(role))
    return res.status(400).json({ message: "Role must be editor or viewer" });

  try {
    const file = await getFileById(file_id);

    if (!(await isOwner(user_id, file)))
      return res.status(403).json({ message: "Only owner can grant access" });

    // Grant or update access
    await pool.query(
      `INSERT INTO access_controls
        (tenant_id, user_id, file_id, role, granted_by)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (user_id,file_id)
       DO UPDATE SET
         role = EXCLUDED.role,
         granted_by = EXCLUDED.granted_by`,
      [file.tenant_id, target_user_id, file.id, role, user_id],
    );

    // Remove pending edit request if it exists
    await pool.query(
      `DELETE FROM edit_access_requests
       WHERE file_id = $1 AND requester_user_id = $2`,
      [file.id, target_user_id],
    );

    res.json({ message: "Access granted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

fileRouter.delete("/:id/access/:target_user_id", async (req, res) => {
  const file_id = req.params.id;
  const target_user_id = req.params.target_user_id;
  const user_id = req.user.user_id;

  try {
    const file = await getFileById(file_id);
    // Only owner can remove access
    if (!(await isOwner(user_id, file))) {
      return res.status(403).json({ message: "Only owner can remove access" });
    }
    // Check role of target user
    const targetRole = await getFileRole(target_user_id, file);
    if (!targetRole) {
      return res.status(404).json({ message: "Access entry not found" });
    }
    // Prevent removing owner
    if (targetRole === "owner") {
      return res
        .status(400)
        .json({ message: "Owner access cannot be removed" });
    }
    await pool.query(
      "DELETE FROM access_controls WHERE file_id = $1 AND user_id = $2",
      [file_id, target_user_id],
    );
    res.json({ message: "Access removed successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// Create/update draft (editor)
fileRouter.post("/:id/draft", createUpdatedDraftHandler);

// Get drafts for a file
fileRouter.get("/:id/drafts", getDraftsOfAfile);

// Move file
fileRouter.patch("/:id/move", async (req, res) => {
  const { new_folder_id } = req.body;
  const file_id = req.params.id;
  const user_id = req.user.user_id;

  if (!new_folder_id)
    return res.status(400).json({ message: "new_folder_id required" });

  try {
    const file = await getFileById(file_id);
    if (!(await isOwner(user_id, file)))
      return res.status(403).json({ message: "Only owner can move file" });

    const folderRes = await pool.query(
      "SELECT tenant_id FROM folders WHERE id=$1",
      [new_folder_id],
    );
    if (!folderRes.rows.length)
      return res.status(404).json({ message: "Target folder not found" });
    if (folderRes.rows[0].tenant_id !== file.tenant_id)
      return res
        .status(400)
        .json({ message: "Cannot move file to another tenant folder" });

    const updatedRes = await pool.query(
      "UPDATE files SET folder_id=$1, updated_at=NOW() WHERE id=$2 RETURNING *",
      [new_folder_id, file_id],
    );
    res.json(updatedRes.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});
// Get single file
fileRouter.get("/:id", async (req, res) => {
  const user_id = req.user.user_id;
  const file_id = req.params.id;

  const fileRes = await pool.query(
    `
      SELECT
        f.*,
        COALESCE(ac.role, 'viewer') AS role
      FROM files f
      LEFT JOIN access_controls ac
        ON ac.file_id = f.id AND ac.user_id = $1
      WHERE f.id = $2
      `,
    [user_id, file_id],
  );

  if (!fileRes.rows.length)
    return res.status(404).json({ message: "File not found" });

  const file = fileRes.rows[0];
  if (!(await verifyTenantAccess(user_id, file.tenant_id)))
    return res
      .status(403)
      .json({ message: "You are not a member of this tenant" });
  try {
    res.json(file);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});
// Update file (owner only)
fileRouter.put("/:id", updateFileHandler);
// Delete file
fileRouter.delete("/:id", deleteFileHandler);

// Multer error handler
fileRouter.use((err, _req, res, next) => {
  if (err.code === "LIMIT_FILE_SIZE")
    return res.status(400).json({ message: "File too large. Max 2MB" });
  next(err);
});

module.exports = fileRouter;
