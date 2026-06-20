const express = require('express');
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// البحث عن مستخدمين
router.get('/search', authenticateToken, (req, res) => {
  const q = req.query.q || '';
  const users = db.all(
    `SELECT id, username, display_name FROM users
     WHERE (username LIKE ? OR display_name LIKE ?) AND id != ?`,
    [`%${q}%`, `%${q}%`, req.user.id]
  );
  res.json(users);
});

// إرسال طلب صداقة
router.post('/request', authenticateToken, (req, res) => {
  const { receiverId } = req.body;
  if (!receiverId) return res.status(400).json({ error: 'المستخدم مطلوب' });

  if (receiverId === req.user.id) {
    return res.status(400).json({ error: 'لا يمكنك إرسال طلب لنفسك' });
  }

  const existing = db.get(
    `SELECT id, status FROM friend_requests
     WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)`,
    [req.user.id, receiverId, receiverId, req.user.id]
  );

  if (existing) {
    if (existing.status === 'accepted') {
      return res.status(409).json({ error: 'أنتم أصدقاء بالفعل' });
    }
    if (existing.status === 'pending') {
      return res.status(409).json({ error: 'طلب صداقة موجود مسبقًا' });
    }
    // if rejected, allow re-send
    db.run('DELETE FROM friend_requests WHERE id = ?', [existing.id]);
  }

  db.run(
    'INSERT INTO friend_requests (sender_id, receiver_id, status) VALUES (?, ?, ?)',
    [req.user.id, receiverId, 'pending']
  );

  res.json({ success: true, message: 'تم إرسال طلب الصداقة' });
});

// قائمة طلبات الصداقة الواردة
router.get('/requests', authenticateToken, (req, res) => {
  const requests = db.all(
    `SELECT fr.id, fr.status, fr.created_at,
            u.id as sender_id, u.username, u.display_name
     FROM friend_requests fr
     JOIN users u ON fr.sender_id = u.id
     WHERE fr.receiver_id = ? AND fr.status = 'pending'
     ORDER BY fr.created_at DESC`,
    [req.user.id]
  );
  res.json(requests);
});

// قبول طلب صداقة
router.post('/accept', authenticateToken, (req, res) => {
  const { requestId } = req.body;
  const request = db.get(
    'SELECT * FROM friend_requests WHERE id = ? AND receiver_id = ?',
    [requestId, req.user.id]
  );

  if (!request) {
    return res.status(404).json({ error: 'الطلب غير موجود' });
  }

  db.run('UPDATE friend_requests SET status = ? WHERE id = ?', ['accepted', requestId]);
  res.json({ success: true, message: 'تم قبول طلب الصداقة' });
});

// رفض طلب صداقة
router.post('/reject', authenticateToken, (req, res) => {
  const { requestId } = req.body;
  db.run(
    'UPDATE friend_requests SET status = ? WHERE id = ? AND receiver_id = ?',
    ['rejected', requestId, req.user.id]
  );
  res.json({ success: true, message: 'تم رفض طلب الصداقة' });
});

// قائمة الأصدقاء
router.get('/', authenticateToken, (req, res) => {
  const friends = db.all(
    `SELECT u.id, u.username, u.display_name,
            fr.created_at as friends_since
     FROM friend_requests fr
     JOIN users u ON (CASE WHEN fr.sender_id = ? THEN fr.receiver_id ELSE fr.sender_id END) = u.id
     WHERE (fr.sender_id = ? OR fr.receiver_id = ?) AND fr.status = 'accepted'`,
    [req.user.id, req.user.id, req.user.id]
  );
  res.json(friends);
});

// ====== DEBUG: عرض جميع طلبات الصداقة (للتشخيص) ======
router.get('/debug', (req, res) => {
  const allRequests = db.all(`SELECT * FROM friend_requests ORDER BY id DESC`);
  const allUsers = db.all(`SELECT id, username FROM users`);
  res.json({ allUsers, allRequests });
});

module.exports = router;
