const pool = require("../../../db/dbClient");
const { getFileById, isOwner } = require("../../helpers/role-ownership");
async function getAllPendingRequestForOwner(req, res) {
  const owner_id = req.user.user_id;
  try {
    const result = await pool.query(
      `SELECT ear.id AS request_id,
              f.id AS file_id,
              f.name AS file_name,
              u.username AS requester_name
       FROM edit_access_requests ear
       JOIN files f ON ear.file_id = f.id
       JOIN users u ON ear.requester_user_id = u.id
       WHERE ear.file_owner_id = $1
         AND ear.status = 'pending'
       ORDER BY ear.created_at DESC`,
      [owner_id],
    );

    res.json({ requests: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
}
async function editReqAcceptHandler(req, res) {
  const user_id = req.user.user_id;
  const req_id = req.params.id;

  try {
    const reqRes = await pool.query(
      "SELECT * FROM edit_access_requests WHERE id=$1",
      [req_id],
    );
    if (!reqRes.rows.length)
      return res.status(404).json({ message: "Request not found" });
    const request = reqRes.rows[0];

    const file = await getFileById(request.file_id);
    if (!(await isOwner(user_id, file)))
      return res.status(403).json({ message: "Only owner can approve" });

    // Grant editor access
    await pool.query(
      "INSERT INTO access_controls (tenant_id,user_id,file_id,role,granted_by) VALUES ($1,$2,$3,'editor',$4) ON CONFLICT (user_id,file_id) DO UPDATE SET role='editor', granted_by=$4",
      [file.tenant_id, request.requester_user_id, file.id, user_id],
    );

    await pool.query("DELETE FROM edit_access_requests WHERE id=$1", [req_id]);
    res.json({ message: "Edit access granted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
}
async function editReqRejectHandler(req, res) {
  const user_id = req.user.user_id;
  const req_id = req.params.id;

  try {
    const reqRes = await pool.query(
      "SELECT * FROM edit_access_requests WHERE id=$1",
      [req_id],
    );
    if (!reqRes.rows.length)
      return res.status(404).json({ message: "Request not found" });
    const request = reqRes.rows[0];

    const file = await getFileById(request.file_id);
    if (!(await isOwner(user_id, file)))
      return res.status(403).json({ message: "Only owner can reject" });

    await pool.query("DELETE FROM edit_access_requests WHERE id=$1", [req_id]);
    res.json({ message: "Request rejected" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
}
module.exports = {
  getAllPendingRequestForOwner,
  editReqAcceptHandler,
  editReqRejectHandler,
};
