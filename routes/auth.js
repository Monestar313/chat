const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { SECRET } = require('../middleware/auth');

const router = express.Router();

// تسجيل حساب جديد
router.post('/register', (req, res) => {
  const { username, password, displayName } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'اسم المستخدم وكلمة السر مطلوبين' });
  }
  if (username.length < 3) {
    return res.status(400).json({ error: 'اسم المستخدم يجب أن يكون 3 أحرف على الأقل' });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: 'كلمة السر يجب أن تكون 4 أحرف على الأقل' });
  }

  const existing = db.get('SELECT id FROM users WHERE username = ?', [username]);
  if (existing) {
    return res.status(409).json({ error: 'اسم المستخدم موجود مسبقًا' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const result = db.run('INSERT INTO users (username, password_hash, display_name) VALUES (?, ?, ?)', [username, hash, displayName || username]);

  const token = jwt.sign({ id: result.lastInsertRowid, username }, SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: result.lastInsertRowid, username, displayName: displayName || username } });
});

// تسجيل الدخول
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'اسم المستخدم وكلمة السر مطلوبين' });
  }

  const user = db.get('SELECT * FROM users WHERE username = ?', [username]);
  if (!user) {
    return res.status(401).json({ error: 'اسم المستخدم أو كلمة السر خطأ' });
  }

  const match = bcrypt.compareSync(password, user.password_hash);
  if (!match) {
    return res.status(401).json({ error: 'اسم المستخدم أو كلمة السر خطأ' });
  }

  const token = jwt.sign({ id: user.id, username: user.username }, SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, username: user.username, displayName: user.display_name } });
});

module.exports = router;
