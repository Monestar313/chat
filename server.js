const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');
const { initDB } = require('./db');
const authRoutes = require('./routes/auth');
const friendRoutes = require('./routes/friends');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api/auth', authRoutes);
app.use('/api/friends', friendRoutes);

// Middleware: حماية جميع الصفحات ما عدا login/register
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  if (req.path === '/' || req.path === '/login.html' || req.path === '/register.html') return next();
  next();
});

// إنشاء السيرفر (HTTP أو HTTPS)
let server;
const useHttps = false; // غير إلى true لو عندك شهادة SSL

if (useHttps) {
  const options = {
    key: fs.readFileSync('privkey.pem'),
    cert: fs.readFileSync('cert.pem')
  };
  server = https.createServer(options, app);
} else {
  server = http.createServer(app);
}

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// تخزين المستخدمين المتصلين
const onlineUsers = new Map(); // socketId -> { userId, username }

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('No token'));
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret-key-change-me');
    socket.userId = decoded.id;
    socket.username = decoded.username;
    next();
  } catch {
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  console.log(`متصل: ${socket.username} (${socket.id})`);
  onlineUsers.set(socket.id, { userId: socket.userId, username: socket.username });

  // إرسال قائمة المتصلين للجميع
  broadcastOnlineUsers();

  // --- WebRTC Signaling ---
  socket.on('call:offer', ({ targetSocketId, offer }) => {
    io.to(targetSocketId).emit('call:offer', {
      offer,
      from: socket.id,
      fromUsername: socket.username
    });
  });

  socket.on('call:answer', ({ targetSocketId, answer }) => {
    io.to(targetSocketId).emit('call:answer', { answer, from: socket.id });
  });

  socket.on('call:ice-candidate', ({ targetSocketId, candidate }) => {
    io.to(targetSocketId).emit('call:ice-candidate', { candidate, from: socket.id });
  });

  socket.on('call:end', ({ targetSocketId }) => {
    io.to(targetSocketId).emit('call:end', { from: socket.id });
  });

  // إرسال إشعار طلب الصداقة للمستخدم المستهدف
  socket.on('friend:request-sent', ({ targetUserId }) => {
    for (const [sid, user] of onlineUsers) {
      if (user.userId === targetUserId) {
        io.to(sid).emit('friend:new-request');
        break;
      }
    }
  });

  // البحث عن socket-id لمستخدم معين
  socket.on('find-socket', ({ userId }, callback) => {
    for (const [sid, user] of onlineUsers) {
      if (user.userId === userId) {
        callback(sid);
        return;
      }
    }
    callback(null);
  });

  // إرسال رسالة نصية
  socket.on('message:send', ({ targetUserId, message }) => {
    const db = require('./db');
    const result = db.run(
      'INSERT INTO messages (sender_id, receiver_id, content) VALUES (?, ?, ?)',
      [socket.userId, targetUserId, message]
    );
    const sentMsg = {
      id: result.lastInsertRowid,
      message,
      from: socket.userId,
      fromUsername: socket.username,
      createdAt: new Date().toISOString()
    };
    // أرسل للمستقبل
    for (const [sid, user] of onlineUsers) {
      if (user.userId === targetUserId) {
        io.to(sid).emit('message:new', sentMsg);
        break;
      }
    }
    socket.emit('message:sent', { message, createdAt: sentMsg.createdAt });
  });

  // جلب تاريخ المراسلات
  socket.on('message:history', ({ targetUserId }, callback) => {
    const db = require('./db');
    const messages = db.all(
      `SELECT m.*, u.username
       FROM messages m JOIN users u ON m.sender_id = u.id
       WHERE (m.sender_id = ? AND m.receiver_id = ?)
          OR (m.sender_id = ? AND m.receiver_id = ?)
       ORDER BY m.created_at ASC`,
      [socket.userId, targetUserId, targetUserId, socket.userId]
    );
    callback(messages);
  });

  // عند قطع الاتصال
  socket.on('disconnect', () => {
    console.log(`قطع: ${socket.username} (${socket.id})`);
    onlineUsers.delete(socket.id);
    broadcastOnlineUsers();
  });
});

function broadcastOnlineUsers() {
  const users = [];
  const seen = new Set();
  for (const [socketId, user] of onlineUsers) {
    if (!seen.has(user.userId)) {
      seen.add(user.userId);
      users.push({ socketId, userId: user.userId, username: user.username });
    }
  }
  io.emit('users:online', users);
}

const PORT = process.env.PORT || 3000;
const HOST = process.env.IP || '0.0.0.0';
// انتظار قاعدة البيانات ثم تشغيل السيرفر
async function start() {
  await initDB();
  server.listen(PORT, HOST, () => {
    console.log(`🚀 السيرفر شغال على http://${HOST}:${PORT}`);
    console.log(`   افتح المتصفح على http://localhost:${PORT}`);
  });
}
start();
