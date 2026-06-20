const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'secret-key-change-me';

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'مطلوب تسجيل الدخول' });

  try {
    const decoded = jwt.verify(token, SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(403).json({ error: 'رمز غير صالح' });
  }
}

module.exports = { authenticateToken, SECRET };
