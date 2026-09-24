const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static('public'));

io.on('connection', (socket) => {
  socket.on('join-room', ({ role, name }) => {
    socket.role = role;
    socket.userName = name || (role === 'teacher' ? 'Giáo Viên' : 'Học Sinh');
    socket.join('classroom');
    
    // Thông báo cho mọi người trong phòng biết người mới kết nối
    socket.to('classroom').emit('user-connected', { 
      id: socket.id, 
      role: socket.role,
      name: socket.userName 
    });
  });

  // Chuyển tiếp tín hiệu WebRTC giữa các peer
  socket.on('signal', ({ targetId, signal }) => {
    io.to(targetId).emit('signal', { senderId: socket.id, signal });
  });

  socket.on('disconnect', () => {
    io.to('classroom').emit('user-disconnected', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));