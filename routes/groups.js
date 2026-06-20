const express = require('express');
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// إنشاء مجموعة جديدة
router.post('/create', authenticateToken, (req, res) => {
  const { name, memberIds } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'اسم المجموعة مطلوب' });

  const result = db.run('INSERT INTO groups_t (name, created_by) VALUES (?, ?)', [name.trim(), req.user.id]);
  const groupId = result.lastInsertRowid;

  // إضافة المنشئ كعضو
  db.run('INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)', [groupId, req.user.id]);

  // إضافة الأعضاء
  if (memberIds && Array.isArray(memberIds)) {
    memberIds.forEach(mid => {
      if (mid !== req.user.id) {
        db.run('INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)', [groupId, mid]);
      }
    });
  }

  res.json({ success: true, groupId });
});

// إضافة عضو للمجموعة
router.post('/add-member', authenticateToken, (req, res) => {
  const { groupId, userId } = req.body;
  const member = db.get('SELECT id FROM group_members WHERE group_id = ? AND user_id = ?', [groupId, req.user.id]);
  if (!member) return res.status(403).json({ error: 'لست عضوًا في هذه المجموعة' });

  db.run('INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)', [groupId, userId]);
  res.json({ success: true });
});

// قائمة مجموعات المستخدم
router.get('/', authenticateToken, (req, res) => {
  const groups = db.all(
    `SELECT g.*,
       (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) as member_count
     FROM groups_t g
     JOIN group_members gm ON gm.group_id = g.id
     WHERE gm.user_id = ?
     ORDER BY g.created_at DESC`,
    [req.user.id]
  );
  res.json(groups);
});

// أعضاء المجموعة
router.get('/:id/members', authenticateToken, (req, res) => {
  const members = db.all(
    `SELECT u.id, u.username, u.display_name
     FROM group_members gm JOIN users u ON gm.user_id = u.id
     WHERE gm.group_id = ?`,
    [parseInt(req.params.id)]
  );
  res.json(members);
});

// تاريخ رسائل المجموعة
router.get('/:id/messages', authenticateToken, (req, res) => {
  const messages = db.all(
    `SELECT gm.*, u.username
     FROM group_messages gm JOIN users u ON gm.sender_id = u.id
     WHERE gm.group_id = ? AND gm.deleted = 0
     ORDER BY gm.created_at ASC`,
    [parseInt(req.params.id)]
  );
  res.json(messages);
});

module.exports = router;
