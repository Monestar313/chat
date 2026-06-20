// ===== التحقق من تسجيل الدخول =====
const token = localStorage.getItem('token');
const user = JSON.parse(localStorage.getItem('user') || '{}');
if (!token) window.location.href = '/login.html';

// ===== DOM Elements =====
const $ = (id) => document.getElementById(id);
const friendsList = $('friendsList');
const requestsList = $('requestsList');
const searchInput = $('searchInput');
const searchResults = $('searchResults');
const noCallScreen = $('noCallScreen');
const videoContainer = $('videoContainer');
const controls = $('controls');
const localVideo = $('localVideo');
const remoteVideo = $('remoteVideo');
const remoteLabel = $('remoteLabel');
const localWrapper = $('localVideoWrapper');
const remoteWrapper = $('remoteVideoWrapper');
const audioPlaceholder = $('audioPlaceholder');
const audioAvatar = $('audioAvatar');
const audioCallName = $('audioCallName');
const toggleMic = $('toggleMic');
const toggleCam = $('toggleCam');
const toggleScreen = $('toggleScreen');
const endCallBtn = $('endCall');
const incomingOverlay = $('incomingOverlay');
const incomingName = $('incomingName');
const incomingType = $('incomingType');
const incomingAvatar = $('incomingAvatar');
const acceptCallBtn = $('acceptCallBtn');
const rejectCallBtn = $('rejectCallBtn');
const logoutBtn = $('logoutBtn');
const toast = $('toast');
const sidebarUsername = $('sidebarUsername');
const requestsBadge = $('requestsBadge');
const statusSelect = $('statusSelect');
const myStatusDot = $('myStatusDot');
const groupsList = $('groupsList');
const createGroupBtn = $('createGroupBtn');
const createGroupModal = $('createGroupModal');
const groupNameInput = $('groupNameInput');
const groupMembersList = $('groupMembersList');
const cancelGroupBtn = $('cancelGroupBtn');
const confirmGroupBtn = $('confirmGroupBtn');
const loadingBar = $('loadingBar');
const chatArea = $('chatArea');
const chatPartnerName = $('chatPartnerName');
const chatMessages = $('chatMessages');
const chatInput = $('chatInput');
const chatSendBtn = $('chatSendBtn');
const chatFileBtn = $('chatFileBtn');
const fileInput = $('fileInput');
const chatCloseBtn = $('chatCloseBtn');
const chatCallBtn = $('chatCallBtn');

// ===== State =====
let socket;
let localStream = null;
let screenStream = null;
let peerConnection = null;
let currentCall = null;
let incomingCall = null;
let isMicMuted = false;
let isCamOff = false;
let isScreenSharing = false;
let friends = [];
let onlineUserIds = new Set();
let currentTab = 'friends';
let searchTimeout = null;
let chatPartnerId = null;
let chatPartnerUsername = '';
let userStatuses = {};

const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

const avatarColors = [
  '#6c5ce7', '#a855f7', '#3b82f6', '#22c55e',
  '#f59e0b', '#ef4444', '#ec4899', '#14b8a6',
  '#f97316', '#8b5cf6', '#06b6d4', '#84cc16'
];

// ===== Notifications =====
function notifyUser(title, body) {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/favicon.ico' });
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission();
  }
}

// ===== Toast =====
let toastTimeout;

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('visible');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('visible'), 3000);
}

// ===== Avatar color =====
function getAvatarColor(username) {
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  return avatarColors[Math.abs(hash) % avatarColors.length];
}

// ===== Connection =====
function connectSocket() {
  socket = io({
    auth: { token },
    transports: ['websocket', 'polling']
  });

  socket.on('connect', () => {
    console.log('✅ متصل');
    loadingBar.style.display = 'none';
  });

  socket.on('connect_error', (err) => {
    console.error('❌', err.message);
    if (err.message === 'Invalid token' || err.message === 'No token') {
      localStorage.clear();
      window.location.href = '/login.html';
    }
  });

  socket.on('users:online', (users) => {
    onlineUserIds = new Set(users.map(u => u.userId));
    userStatuses = {};
    users.forEach(u => { userStatuses[u.userId] = u.status || 'online'; });
    renderFriends();
  });

  socket.on('user:status-change', ({ userId, status }) => {
    userStatuses[userId] = status;
    renderFriends();
  });

  socket.on('friend:new-request', () => {
    fetchRequests();
    showToast('🔔 لديك طلب صداقة جديد');
    notifyUser('طلب صداقة جديد', 'لديك طلب صداقة جديد');
  });

  socket.on('call:offer', ({ offer, from, fromUsername }) => {
    handleIncomingCall(offer, from, fromUsername);
  });

  socket.on('call:answer', ({ answer }) => {
    if (peerConnection) {
      peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    }
  });

  socket.on('call:ice-candidate', ({ candidate }) => {
    if (peerConnection) {
      peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }
  });

  socket.on('call:end', () => endCall(true));

  socket.on('message:new', ({ id, from, fromUsername, message, createdAt }) => {
    if (chatPartnerId === from && chatArea.style.display !== 'none') {
      appendMessage(message, 'received', createdAt, id);
    } else {
      const isChattingWith = friends.some(f => f.id === from);
      if (isChattingWith) {
        showToast(`💬 ${fromUsername}: ${message.substring(0, 50)}`);
        notifyUser(fromUsername, message.replace(/\[img\].*?\[\/img\]/, '📷 صورة'));
      }
    }
  });

  socket.on('message:sent', ({ id, message, createdAt }) => {
    appendMessage(message, 'sent', createdAt, id);
  });

  socket.on('message:updated', ({ id, content, edited }) => {
    const div = chatMessages.querySelector(`[data-msg-id="${id}"]`);
    if (!div) return;
    const textSpan = div.querySelector('.msg-text');
    if (textSpan) textSpan.textContent = content + ' (تم التعديل)';
  });

  socket.on('message:deleted', ({ id }) => {
    const div = chatMessages.querySelector(`[data-msg-id="${id}"]`);
    if (div) div.remove();
  });

  socket.on('message:blocked', () => {
    showToast('🚫 لا يمكنك إرسال رسالة - المستخدم محظور');
  });
}

// ===== API helper =====
async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    ...options
  });
  return res.json();
}

// ===== Friends =====
async function fetchFriends() {
  const data = await api('/api/friends');
  friends = data;
  renderFriends();
}

async function fetchRequests() {
  try {
    const data = await api('/api/friends/requests');
    console.log('📨 طلبات الصداقة:', data);
    renderRequests(data);
  } catch (err) {
    console.error('❌ خطأ في جلب الطلبات:', err);
  }
}

function renderFriends() {
  if (!friends || friends.length === 0) {
    friendsList.innerHTML = `<div class="empty-state"><div class="icon">👥</div>لا يوجد أصدقاء بعد<br>ابحث عن أصدقاء وأضفهم</div>`;
    return;
  }
  friendsList.innerHTML = friends.map(f => {
    const isOnline = onlineUserIds.has(f.id);
    const status = userStatuses[f.id] || 'offline';
    const initial = (f.display_name || f.username).charAt(0).toUpperCase();
    const color = getAvatarColor(f.username);
    const name = f.display_name || f.username;
    const statusMap = { online: '🟢 متصل', away: '🟡 بعيد', busy: '🔴 مشغول', offline: '🔴 غير متصل' };
    return `
      <div class="user-item" data-user-id="${f.id}" data-username="${f.username}">
        <div class="avatar" style="background:${color}">${initial}
          <span class="online-dot ${isOnline ? status : ''}"></span>
        </div>
        <div class="info">
          <div class="name">${name}</div>
          <div class="status-text ${isOnline ? status : ''}">${statusMap[status] || '🔴 غير متصل'}</div>
        </div>
        <div class="actions">
          ${isOnline ? `<button class="call-btn" onclick="showCallOptions(${f.id},'${f.username}')" title="اتصال">📞</button>` : ''}
          <button class="call-btn" onclick="openChat(${f.id},'${f.username}')" title="محادثة">💬</button>
          <button class="call-btn block-btn" onclick="blockUser(${f.id},'${f.username}')" title="حظر">🚫</button>
        </div>
      </div>
    `;
  }).join('');
}

function renderRequests(requests) {
  if (!requests || requests.length === 0) {
    requestsList.innerHTML = `<div class="empty-state"><div class="icon">📨</div>لا توجد طلبات صداقة</div>`;
    requestsBadge.style.display = 'none';
    return;
  }
  requestsBadge.textContent = requests.length;
  requestsBadge.style.display = 'inline';
  requestsList.innerHTML = requests.map(r => {
    const initial = (r.display_name || r.username).charAt(0).toUpperCase();
    const color = getAvatarColor(r.username);
    const name = r.display_name || r.username;
    return `
      <div class="user-item">
        <div class="avatar" style="background:${color}">${initial}</div>
        <div class="info">
          <div class="name">${name}</div>
          <div class="status-text">@${r.username}</div>
        </div>
        <div class="actions">
          <button class="accept-btn" onclick="acceptRequest(${r.id})" title="قبول">✓</button>
          <button class="reject-btn" onclick="rejectRequest(${r.id})" title="رفض">✕</button>
        </div>
      </div>
    `;
  }).join('');
}

// ===== Friend actions =====
window.showCallOptions = function(userId, username) {
  removeCallMenu();
  const el = document.createElement('div');
  el.className = 'call-menu';
  el.id = 'callMenu';
  el.innerHTML = `
    <div class="call-menu-header">اتصال مع <strong>${username}</strong></div>
    <div class="call-menu-options">
      <button class="call-option" data-type="audio"><span class="opt-icon">🎧</span> صوتي</button>
      <button class="call-option" data-type="video"><span class="opt-icon">📹</span> فيديو</button>
      <button class="call-option" data-type="screen"><span class="opt-icon">🖥️</span> شاشة</button>
    </div>
    <button class="call-menu-close" onclick="removeCallMenu()">إلغاء</button>
  `;
  document.body.appendChild(el);

  el.querySelectorAll('.call-option').forEach(btn => {
    btn.addEventListener('click', () => {
      removeCallMenu();
      // find socket id for this user
      const friend = friends.find(f => f.id === userId);
      if (!friend) return;
      startCall(btn.dataset.type, userId, username);
    });
  });
};

window.removeCallMenu = function() {
  const m = document.getElementById('callMenu');
  if (m) m.remove();
};

window.acceptRequest = async function(requestId) {
  await api('/api/friends/accept', {
    method: 'POST',
    body: JSON.stringify({ requestId })
  });
  showToast('✅ تم قبول طلب الصداقة');
  fetchRequests();
  fetchFriends();
};

window.rejectRequest = async function(requestId) {
  await api('/api/friends/reject', {
    method: 'POST',
    body: JSON.stringify({ requestId })
  });
  showToast('تم رفض طلب الصداقة');
  fetchRequests();
};

// ===== Search =====
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  const q = searchInput.value.trim();
  if (q.length < 1) {
    searchResults.classList.remove('visible');
    return;
  }
  searchTimeout = setTimeout(() => searchUsers(q), 300);
});

async function searchUsers(q) {
  const data = await api(`/api/friends/search?q=${encodeURIComponent(q)}`);
  if (data.length === 0) {
    searchResults.innerHTML = `<div class="empty-state" style="padding:16px">لا توجد نتائج</div>`;
  } else {
    const friendIds = new Set(friends.map(f => f.id));
    searchResults.innerHTML = data.map(u => {
      const initial = (u.display_name || u.username).charAt(0).toUpperCase();
      const color = getAvatarColor(u.username);
      const name = u.display_name || u.username;
      const isFriend = friendIds.has(u.id);
      return `
        <div class="search-result-item">
          <div class="avatar" style="background:${color}">${initial}</div>
          <div class="info">
            <div class="name">${name}</div>
            <div class="username">@${u.username}</div>
          </div>
          <button class="add-btn" ${isFriend ? 'disabled' : ''} onclick="sendRequest(${u.id})">${isFriend ? '✅ صديق' : '+ أضف'}</button>
        </div>
      `;
    }).join('');
  }
  searchResults.classList.add('visible');
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-box')) {
    searchResults.classList.remove('visible');
  }
});

window.sendRequest = async function(receiverId) {
  const data = await api('/api/friends/request', {
    method: 'POST',
    body: JSON.stringify({ receiverId })
  });
  if (data.error) {
    showToast(`⚠️ ${data.error}`);
  } else {
    showToast('✅ تم إرسال طلب الصداقة');
    // notify the other user via socket
    socket.emit('friend:request-sent', { targetUserId: receiverId });
  }
};

// ===== Chat =====
window.openChat = function(userId, username) {
  chatPartnerId = userId;
  chatPartnerUsername = username;
  chatPartnerName.textContent = username;

  noCallScreen.style.display = 'none';
  if (videoContainer) videoContainer.classList.remove('active');
  controls.style.display = 'none';
  chatArea.style.display = 'flex';

  socket.emit('message:history', { targetUserId: userId }, (messages) => {
    chatMessages.innerHTML = '';
    if (!messages || messages.length === 0) {
      chatMessages.innerHTML = '<div class="chat-empty">لا توجد رسائل بعد</div>';
      return;
    }
    messages.forEach(msg => {
      appendMessage(msg.content, msg.sender_id === user.userId ? 'sent' : 'received', msg.created_at, msg.id);
    });
    chatMessages.scrollTop = chatMessages.scrollHeight;
  });
};

window.closeChat = function() {
  if (currentGroupId) {
    socket.emit('group:leave', { groupId: currentGroupId });
    currentGroupId = null;
  }
  chatArea.style.display = 'none';
  noCallScreen.style.display = 'flex';
  chatPartnerId = null;
  chatPartnerUsername = '';
  chatCallBtn.style.display = '';
};

chatSendBtn.addEventListener('click', () => window.sendMessage());
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') window.sendMessage();
});
chatCloseBtn.addEventListener('click', window.closeChat);
chatCallBtn.addEventListener('click', () => {
  if (chatPartnerId && chatPartnerUsername) {
    window.closeChat();
    window.showCallOptions(chatPartnerId, chatPartnerUsername);
  }
});

function appendMessage(text, type, time, msgId) {
  const empty = chatMessages.querySelector('.chat-empty');
  if (empty) empty.remove();

  const div = document.createElement('div');
  div.className = `chat-message ${type}`;
  if (msgId) div.dataset.msgId = msgId;
  const timeStr = time ? new Date(time.replace(' ', 'T')).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) : '';

  let contentHtml = '';
  const imgMatch = text.match(/^\[img\](.+?)\[\/img\]$/);
  if (imgMatch) {
    contentHtml = `<img src="${imgMatch[1]}" class="msg-image" alt="صورة" onclick="window.open(this.src)">`;
  } else {
    contentHtml = `<span class="msg-text">${text}</span>`;
  }

  let html = contentHtml;
  if (timeStr) html += `<span class="msg-time">${timeStr}</span>`;

  if (type === 'sent' && msgId) {
    html += `<div class="msg-actions">
      <button class="msg-edit-btn" onclick="editMessage(this)" title="تعديل">✏️</button>
      <button class="msg-del-btn" onclick="deleteMessage(this)" title="حذف">🗑️</button>
    </div>`;
  }

  div.innerHTML = html;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

window.editMessage = function(btn) {
  const div = btn.closest('.chat-message');
  const textSpan = div.querySelector('.msg-text');
  const currentText = textSpan.textContent;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'edit-input';
  input.value = currentText;
  input.autofocus = true;
  textSpan.replaceWith(input);
  btn.textContent = '💾';
  btn.onclick = function() {
    const newText = input.value.trim();
    if (!newText || newText === currentText) {
      cancelEdit(div, currentText, btn);
      return;
    }
    const msgId = div.dataset.msgId;
    socket.emit('message:edit', { messageId: parseInt(msgId), content: newText });
    const newSpan = document.createElement('span');
    newSpan.className = 'msg-text';
    newSpan.textContent = newText;
    input.replaceWith(newSpan);
    btn.textContent = '✏️';
    btn.onclick = function() { editMessage(btn); };
  };
  input.addEventListener('blur', () => {
    setTimeout(() => {
      if (div.querySelector('.edit-input')) cancelEdit(div, currentText, btn);
    }, 200);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btn.click();
    if (e.key === 'Escape') cancelEdit(div, currentText, btn);
  });
};

function cancelEdit(div, oldText, btn) {
  const input = div.querySelector('.edit-input');
  if (!input) return;
  const span = document.createElement('span');
  span.className = 'msg-text';
  span.textContent = oldText;
  input.replaceWith(span);
  btn.textContent = '✏️';
  btn.onclick = function() { editMessage(btn); };
}

window.deleteMessage = function(btn) {
  if (!confirm('حذف الرسالة؟')) return;
  const div = btn.closest('.chat-message');
  const msgId = div.dataset.msgId;
  socket.emit('message:delete', { messageId: parseInt(msgId) });
};

// ===== Block / Unblock =====
window.blockUser = async function(userId, username) {
  if (!confirm(`حظر ${username}؟`)) return;
  await api('/api/friends/block', {
    method: 'POST',
    body: JSON.stringify({ userId })
  });
  showToast(`🚫 تم حظر ${username}`);
  fetchFriends();
};

window.unblockUser = async function(userId, username) {
  await api('/api/friends/unblock', {
    method: 'POST',
    body: JSON.stringify({ userId })
  });
  showToast(`✅ تم إلغاء حظر ${username}`);
  fetchFriends();
};

// ===== Groups =====
let groups = [];
let currentGroupId = null;

async function fetchGroups() {
  const data = await api('/api/groups');
  groups = data;
  renderGroups();
}

function renderGroups() {
  if (!groups || groups.length === 0) {
    groupsList.innerHTML = `<div class="empty-state"><div class="icon">👥</div>لا توجد مجموعات بعد<br>أنشئ مجموعة جديدة</div>`;
    return;
  }
  groupsList.innerHTML = groups.map(g => `
    <div class="group-item" onclick="openGroupChat(${g.id},'${g.name}')">
      <div class="group-icon">#</div>
      <div class="info">
        <div class="name">${g.name}</div>
        <div class="count">${g.member_count} أعضاء</div>
      </div>
    </div>
  `).join('');
}

window.openGroupChat = function(groupId, groupName) {
  currentGroupId = groupId;
  chatPartnerId = null;
  chatPartnerName.textContent = `# ${groupName}`;
  chatCallBtn.style.display = 'none';

  noCallScreen.style.display = 'none';
  if (videoContainer) videoContainer.classList.remove('active');
  controls.style.display = 'none';
  chatArea.style.display = 'flex';

  socket.emit('group:join', { groupId });

  // جلب رسائل المجموعة
  api(`/api/groups/${groupId}/messages`).then(messages => {
    chatMessages.innerHTML = '';
    if (!messages || messages.length === 0) {
      chatMessages.innerHTML = '<div class="chat-empty">لا توجد رسائل بعد</div>';
      return;
    }
    messages.forEach(msg => {
      const type = msg.sender_id === user.userId ? 'sent' : 'received';
      appendMessage(msg.content, type, msg.created_at, msg.id);
    });
    chatMessages.scrollTop = chatMessages.scrollHeight;
  });
};

// نافذة إنشاء مجموعة
createGroupBtn.addEventListener('click', () => {
  if (!friends.length) {
    showToast('⚠️ لا يوجد أصدقاء لإضافتهم');
    return;
  }
  groupNameInput.value = '';
  groupMembersList.innerHTML = friends.map(f => `
    <label class="modal-member-item">
      <input type="checkbox" value="${f.id}">
      <span class="avatar" style="background:${getAvatarColor(f.username)}">${(f.display_name || f.username).charAt(0)}</span>
      <span class="name">${f.display_name || f.username}</span>
    </label>
  `).join('');
  createGroupModal.classList.add('active');
});

cancelGroupBtn.addEventListener('click', () => createGroupModal.classList.remove('active'));
createGroupModal.addEventListener('click', (e) => {
  if (e.target === createGroupModal) createGroupModal.classList.remove('active');
});

confirmGroupBtn.addEventListener('click', async () => {
  const name = groupNameInput.value.trim();
  if (!name) { showToast('⚠️ أدخل اسم المجموعة'); return; }

  const checkboxes = groupMembersList.querySelectorAll('input[type="checkbox"]:checked');
  const memberIds = Array.from(checkboxes).map(cb => parseInt(cb.value));

  const data = await api('/api/groups/create', {
    method: 'POST',
    body: JSON.stringify({ name, memberIds })
  });

  if (data.success) {
    showToast('✅ تم إنشاء المجموعة');
    createGroupModal.classList.remove('active');
    fetchGroups();
  }
});

window.sendMessage = function() {
  const text = chatInput.value.trim();
  if (!text) return;
  chatInput.value = '';

  if (currentGroupId) {
    socket.emit('group:send', { groupId: currentGroupId, message: text });
  } else if (chatPartnerId) {
    socket.emit('message:send', { targetUserId: chatPartnerId, message: text });
  }
};

// استقبال رسائل المجموعات
function setupGroupSocketEvents() {
  if (!socket) { setTimeout(setupGroupSocketEvents, 500); return; }
  socket.on('group:message-new', ({ id, groupId, message, from, fromUsername, createdAt }) => {
    if (currentGroupId === groupId && chatArea.style.display !== 'none') {
      appendMessage(message, from === user.userId ? 'sent' : 'received', createdAt, id);
    } else {
      const isInGroup = groups.some(g => g.id === groupId);
      if (isInGroup) {
        showToast(`💬 ${fromUsername}: ${message.substring(0, 50)}`);
      }
    }
  });
}

// ===== File sharing =====
chatFileBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    showToast('⚠️ يرجى اختيار صورة فقط');
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    showToast('⚠️ الصورة أكبر من 5 ميجابايت');
    return;
  }
  const reader = new FileReader();
  reader.onload = function(e) {
    const base64 = e.target.result;
    const msg = `[img]${base64}[/img]`;
    if (currentGroupId) {
      socket.emit('group:send', { groupId: currentGroupId, message: msg });
    } else if (chatPartnerId) {
      socket.emit('message:send', { targetUserId: chatPartnerId, message: msg });
    }
    fileInput.value = '';
  };
  reader.readAsDataURL(file);
});

// ===== Tabs =====
document.querySelectorAll('.sidebar-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`panel${tab.dataset.tab.charAt(0).toUpperCase() + tab.dataset.tab.slice(1)}`).classList.add('active');
    currentTab = tab.dataset.tab;
    if (tab.dataset.tab === 'requests') fetchRequests();
    if (tab.dataset.tab === 'groups') fetchGroups();
  });
});

// ===== WebRTC =====
async function startCall(type, targetUserId, targetUsername) {
  try {
    const targetSocketId = await findSocketId(targetUserId);
    if (!targetSocketId) {
      showToast('⚠️ هذا الصديق غير متصل الآن');
      return;
    }

    const constraints = type === 'audio' ? { audio: true, video: false } : { audio: true, video: true };
    localStream = await navigator.mediaDevices.getUserMedia(constraints);
    localVideo.srcObject = localStream;

    createPeerConnection(targetSocketId);
    localStream.getTracks().forEach(t => peerConnection.addTrack(t, localStream));

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('call:offer', { targetSocketId, offer });

    currentCall = { type, targetSocketId, targetUserId, targetUsername };
    showCallUI(type, targetUsername);
    incomingOverlay.classList.remove('active');
    removeCallMenu();
  } catch (err) {
    console.error(err);
    showToast('⚠️ لا يمكن الوصول إلى الكاميرا أو المايكروفون');
    cleanupCall();
  }
}

function findSocketId(userId) {
  return new Promise((resolve) => {
    socket.emit('find-socket', { userId }, (socketId) => resolve(socketId));
  });
}

function handleIncomingCall(offer, fromSocketId, fromUsername) {
  if (currentCall) {
    socket.emit('call:end', { targetSocketId: fromSocketId });
    return;
  }

  incomingCall = { offer, fromSocketId, fromUsername };
  incomingCall.type = (offer.sdp && offer.sdp.includes('m=video')) ? 'video' : 'audio';

  const initial = fromUsername.charAt(0).toUpperCase();
  incomingAvatar.style.background = getAvatarColor(fromUsername);
  incomingAvatar.textContent = initial;
  incomingName.textContent = fromUsername;
  incomingType.textContent = incomingCall.type === 'video' ? '📹 مكالمة فيديو واردة' : '🎧 مكالمة صوتية واردة';
  incomingOverlay.classList.add('active');
  notifyUser('مكالمة واردة', `${fromUsername} يتصل بك ${incomingCall.type === 'video' ? 'فيديو' : 'صوتي'}`);
}

acceptCallBtn.addEventListener('click', async () => {
  if (!incomingCall) return;
  incomingOverlay.classList.remove('active');

  try {
    const constraints = incomingCall.type === 'audio' ? { audio: true, video: false } : { audio: true, video: true };
    localStream = await navigator.mediaDevices.getUserMedia(constraints);
    localVideo.srcObject = localStream;

    createPeerConnection(incomingCall.fromSocketId);
    localStream.getTracks().forEach(t => peerConnection.addTrack(t, localStream));

    await peerConnection.setRemoteDescription(new RTCSessionDescription(incomingCall.offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('call:answer', { targetSocketId: incomingCall.fromSocketId, answer });

    currentCall = {
      type: incomingCall.type,
      targetSocketId: incomingCall.fromSocketId,
      targetUserId: null,
      targetUsername: incomingCall.fromUsername
    };
    showCallUI(incomingCall.type, incomingCall.fromUsername);
    incomingCall = null;
  } catch (err) {
    console.error(err);
    showToast('⚠️ حدث خطأ في قبول المكالمة');
    cleanupCall();
  }
});

rejectCallBtn.addEventListener('click', () => {
  if (incomingCall) {
    socket.emit('call:end', { targetSocketId: incomingCall.fromSocketId });
  }
  incomingOverlay.classList.remove('active');
  incomingCall = null;
});

function createPeerConnection(targetSocketId) {
  peerConnection = new RTCPeerConnection(rtcConfig);

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('call:ice-candidate', { targetSocketId, candidate: event.candidate });
    }
  };

  peerConnection.ontrack = (event) => {
    if (event.streams && event.streams[0]) {
      remoteVideo.srcObject = event.streams[0];
    }
  };

  peerConnection.oniceconnectionstatechange = () => {
    if (['disconnected', 'failed', 'closed'].includes(peerConnection.iceConnectionState)) {
      endCall(true);
    }
  };
}

function showCallUI(type, username) {
  noCallScreen.style.display = 'none';
  chatArea.style.display = 'none';
  videoContainer.classList.add('active');
  controls.style.display = 'flex';

  if (type === 'audio') {
    audioPlaceholder.style.display = 'flex';
    localWrapper.style.display = 'block';
    remoteWrapper.style.display = 'none';
    const initial = username.charAt(0).toUpperCase();
    audioAvatar.style.background = getAvatarColor(username);
    audioAvatar.textContent = initial;
    audioCallName.textContent = username;
  } else {
    audioPlaceholder.style.display = 'none';
    localWrapper.style.display = 'block';
    remoteWrapper.style.display = 'block';
  }
  remoteLabel.textContent = username;
}

function hideCallUI() {
  noCallScreen.style.display = 'flex';
  videoContainer.classList.remove('active');
  controls.style.display = 'none';
}

function endCall(fromRemote = false) {
  if (currentCall && !fromRemote) {
    socket.emit('call:end', { targetSocketId: currentCall.targetSocketId });
  }
  cleanupCall();
}

function cleanupCall() {
  if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
  if (screenStream) { screenStream.getTracks().forEach(t => t.stop()); screenStream = null; }
  if (peerConnection) { peerConnection.close(); peerConnection = null; }
  localVideo.srcObject = null;
  remoteVideo.srcObject = null;
  currentCall = null;
  incomingCall = null;
  isMicMuted = false;
  isCamOff = false;
  isScreenSharing = false;
  hideCallUI();
  removeCallMenu();
  toggleMic.className = 'control-btn toggle';
  toggleCam.className = 'control-btn toggle';
  toggleScreen.className = 'control-btn toggle';
}

endCallBtn.addEventListener('click', () => endCall(false));

// ===== Controls =====
toggleMic.addEventListener('click', () => {
  if (!localStream) return;
  isMicMuted = !isMicMuted;
  localStream.getAudioTracks().forEach(t => t.enabled = !isMicMuted);
  toggleMic.classList.toggle('off', isMicMuted);
  toggleMic.textContent = isMicMuted ? '🔇' : '🎤';
});

toggleCam.addEventListener('click', () => {
  if (!localStream) return;
  isCamOff = !isCamOff;
  localStream.getVideoTracks().forEach(t => t.enabled = !isCamOff);
  toggleCam.classList.toggle('off', isCamOff);
  toggleCam.textContent = isCamOff ? '❌' : '📷';
});

toggleScreen.addEventListener('click', async () => {
  if (isScreenSharing) {
    if (screenStream) {
      screenStream.getTracks().forEach(t => t.stop());
      screenStream = null;
    }
    try {
      const constraints = currentCall ? (currentCall.type === 'audio' ? { audio: true, video: false } : { audio: true, video: true }) : { audio: true, video: true };
      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
      if (sender) sender.replaceTrack(newStream.getVideoTracks()[0]);
      localStream.getTracks().forEach(t => t.stop());
      localStream = newStream;
      localVideo.srcObject = localStream;
    } catch {}
    isScreenSharing = false;
    toggleScreen.classList.remove('off');
    toggleScreen.textContent = '🖥️';
    return;
  }

  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
    if (sender) sender.replaceTrack(screenStream.getVideoTracks()[0]);
    screenStream.getVideoTracks()[0].onended = () => toggleScreen.click();
    isScreenSharing = true;
    toggleScreen.classList.add('off');
    toggleScreen.textContent = '🖥️';
  } catch {}
});

// ===== Socket helper for find-socket =====
socket?.on('find-socket', (data, callback) => {
  // server-side handled in server.js
});

// ===== Logout =====
logoutBtn.addEventListener('click', () => {
  if (currentCall) endCall(false);
  if (socket) socket.disconnect();
  localStorage.clear();
  window.location.href = '/login.html';
});

// ===== Status selector =====
statusSelect.addEventListener('change', () => {
  const status = statusSelect.value;
  const colorMap = { online: '#22c55e', away: '#eab308', busy: '#ef4444' };
  myStatusDot.style.color = colorMap[status] || '#666';
  socket.emit('user:status-change', { status });
});

// ===== Init =====
sidebarUsername.textContent = user.username || '';
connectSocket();
fetchFriends();
fetchRequests();
fetchGroups();

// Poll for requests every 10s
setInterval(fetchRequests, 10000);

// Setup group socket events after connection
setTimeout(setupGroupSocketEvents, 1000);
