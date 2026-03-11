const pool = require("../../../db/dbClient");
const {
  getFileById,
  getFileRole,
  isEditor,
  isOwner,
} = require("../../helpers/role-ownership");

async function createUpdatedDraftHandler(req, res) {
  const user_id = req.user.user_id;
  const file_id = req.params.id;
  const { content, note } = req.body;

  try {
    const file = await getFileById(file_id);
    if (!file) return res.status(404).json({ message: "File not found" });
    if (!(await isEditor(user_id, file)))
      return res
        .status(403)
        .json({ message: "Only editors can create drafts" });

    const draftRes = await pool.query(
      `INSERT INTO file_versions (file_id, author_id, content, note)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (file_id, author_id) DO UPDATE
       SET content=EXCLUDED.content, note=EXCLUDED.note, created_at=NOW()
       RETURNING *`,
      [file_id, user_id, content, note],
    );

    res.json(draftRes.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
}
async function getDraftsOfAfile(req, res) {
  const user_id = req.user.user_id;
  const file_id = req.params.id;

  try {
    const file = await getFileById(file_id);
    if (!file) return res.status(404).json({ message: "File not found" });
    const role = await getFileRole(user_id, file);
    if (!role) return res.status(403).json({ message: "No access" });

    const draftsRes = await pool.query(
      `SELECT fv.*, u.username
       FROM file_versions fv
       JOIN users u ON fv.author_id=u.id
       WHERE fv.file_id=$1
       ORDER BY fv.created_at DESC`,
      [file_id],
    );

    res.json(draftsRes.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
}
async function acceptDraftHandler(req, res) {
  const user_id = req.user.user_id;
  const draft_id = req.params.draft_id;

  try {
    const draftRes = await pool.query(
      "SELECT * FROM file_versions WHERE id=$1",
      [draft_id],
    );
    if (!draftRes.rows.length)
      return res.status(404).json({ message: "Draft not found" });

    const draft = draftRes.rows[0];
    const file = await getFileById(draft.file_id);
    if (!file) return res.status(404).json({ message: "File not found" });
    if (!(await isOwner(user_id, file)))
      return res.status(403).json({ message: "Only owner can accept drafts" });

    await pool.query(
      "UPDATE files SET content=$1, updated_at=NOW() WHERE id=$2",
      [draft.content, file.id],
    );
    await pool.query(
      "UPDATE file_versions SET status='accepted', accepted_at=NOW(), accepted_by=$1 WHERE id=$2",
      [user_id, draft_id],
    );

    res.json({ message: "Draft accepted and file updated" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
}
async function deleteDraftHandler(req, res) {
  const user_id = req.user.user_id;
  const draft_id = req.params.draft_id;

  try {
    const draftRes = await pool.query(
      "SELECT * FROM file_versions WHERE id=$1",
      [draft_id],
    );
    if (!draftRes.rows.length)
      return res.status(404).json({ message: "Draft not found" });

    const draft = draftRes.rows[0];
    const file = await getFileById(draft.file_id);
    if (!file) return res.status(404).json({ message: "File not found" });

    if (!(await isOwner(user_id, file)) && draft.author_id !== user_id)
      return res
        .status(403)
        .json({ message: "Only owner or draft author can delete" });

    await pool.query("DELETE FROM file_versions WHERE id=$1", [draft_id]);
    res.json({ message: "Draft deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
}

module.exports = {
  createUpdatedDraftHandler,
  getDraftsOfAfile,
  acceptDraftHandler,
  deleteDraftHandler,
};
