const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '10mb' })); // لدعم الملفات

// تخزين البيانات في الذاكرة (للتجربة)
let messages = [];
let users = new Map();
let rooms = new Map();

// الصفحة الرئيسية
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API للحصول على الرسائل
app.get('/api/messages/:room', (req, res) => {
  const roomMessages = messages.filter(msg => msg.room === req.params.room);
  res.json(roomMessages.slice(-50)); // آخر 50 رسالة
});

// Socket.IO Connection
io.on('connection', (socket) => {
  console.log('🌟 مستخدم جديد متصل:', socket.id);
  
  // انضمام للغرفة
  socket.on('join-room', (data) => {
    const { room = 'main', userName = 'مجهول' } = data;
    
    socket.join(room);
    users.set(socket.id, { 
      room, 
      userName, 
      typing: false,
      joinedAt: Date.now() 
    });
    
    // إحصائيات الغرفة
    const roomUsers = Array.from(users.values()).filter(u => u.room === room);
    io.to(room).emit('users-count', roomUsers.length);
    
    // إرسال الرسائل السابقة
    const roomMessages = messages
      .filter(msg => msg.room === room)
      .slice(-50);
    socket.emit('previous-messages', roomMessages);
    
    // إشعار بالانضمام
    socket.broadcast.to(room).emit('user-joined', {
      userName,
      message: `${userName} انضم للمحادثة`,
      timestamp: Date.now()
    });
    
    console.log(`📍 ${userName} انضم للغرفة: ${room}`);
  });

  // استلام رسالة جديدة
  socket.on('send-message', (message) => {
    const user = users.get(socket.id);
    if (!user) return;
    
    const fullMessage = {
      ...message,
      room: user.room,
      id: Date.now() + Math.random(),
      timestamp: Date.now()
    };
    
    messages.push(fullMessage);
    
    // الاحتفاظ بآخر 200 رسالة فقط
    if (messages.length > 200) {
      messages = messages.slice(-200);
    }
    
    // إرسال للجميع في نفس الغرفة
    socket.broadcast.to(user.room).emit('new-message', fullMessage);
    
    console.log(`💬 رسالة جديدة من ${user.userName}: ${message.text || 'ملف'}`);
  });

  // مؤشر الكتابة
  socket.on('typing', (data) => {
    const user = users.get(socket.id);
    if (!user) return;
    
    user.typing = true;
    socket.broadcast.to(user.room).emit('user-typing', {
      userName: user.userName,
      userId: socket.id
    });
  });

  socket.on('stop-typing', () => {
    const user = users.get(socket.id);
    if (!user) return;
    
    user.typing = false;
    socket.broadcast.to(user.room).emit('user-stopped-typing', {
      userName: user.userName,
      userId: socket.id
    });
  });

  // مسح الرسائل
  socket.on('clear-messages', () => {
    const user = users.get(socket.id);
    if (!user) return;
    
    // مسح رسائل الغرفة فقط
    messages = messages.filter(msg => msg.room !== user.room);
    
    io.to(user.room).emit('messages-cleared', {
      by: user.userName,
      timestamp: Date.now()
    });
    
    console.log(`🗑️ ${user.userName} مسح رسائل الغرفة ${user.room}`);
  });

  // إرسال heartbeat
  socket.on('ping', () => {
    socket.emit('pong');
  });

  // قطع الاتصال
  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (user) {
      // إشعار بالمغادرة
      socket.broadcast.to(user.room).emit('user-left', {
        userName: user.userName,
        message: `${user.userName} غادر المحادثة`,
        timestamp: Date.now()
      });
      
      users.delete(socket.id);
      
      // تحديث عدد المتصلين
      const roomUsers = Array.from(users.values()).filter(u => u.room === user.room);
      io.to(user.room).emit('users-count', roomUsers.length);
      
      console.log(`👋 ${user.userName} قطع الاتصال`);
    }
  });
});

// معالجة الأخطاء
process.on('uncaughtException', (err) => {
  console.error('❌ خطأ غير متوقع:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Promise مرفوض:', reason);
});

// بدء السيرفر
server.listen(PORT, () => {
  console.log(`🚀 سيرفر المحادثة العربي يعمل على البورت ${PORT}`);
  console.log(`🌐 الرابط: http://localhost:${PORT}`);
  console.log(`📱 جاهز لاستقبال الاتصالات!`);
});