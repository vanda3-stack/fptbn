const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Tăng dung lượng bộ đệm nhận ảnh Base64
const io = new Server(server, {
  cors: { origin: "*" },
  maxHttpBufferSize: 1e7
});

// Phục vụ các file tĩnh trong thư mục public
app.use(express.static(path.join(__dirname, 'public')));

// Trả về index.html cho trang chủ
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Lưu trữ tấm ảnh mới nhất của GV để khi HS mới vào là nhận được ngay
let latestTeacherImage = null;

io.on('connection', (socket) => {
  console.log('Người dùng kết nối:', socket.id);

  socket.on('join-room', ({ role, name, className }) => {
    socket.role = role;
    socket.userName = name;
    socket.className = className || '';
    socket.join('classroom');
    
    // Nếu Học sinh mới vào và đã có sẵn slide GV, gửi ngay ảnh slide đó cho HS
    if (role === 'student' && latestTeacherImage) {
      socket.emit('teacher-image-update', latestTeacherImage);
    }
  });

  // Xử lý khi Học sinh gửi ảnh chụp màn hình (3s/lần)
  socket.on('student-image', (imageData) => {
    socket.to('classroom').emit('student-image-update', {
      studentId: socket.id,
      name: socket.userName,
      className: socket.className,
      image: imageData
    });
  });

  // Xử lý khi Giáo viên gửi ảnh Slide bài giảng (3s/lần)
  socket.on('teacher-image', (imageData) => {
    latestTeacherImage = imageData;
    socket.to('classroom').emit('teacher-image-update', imageData);
  });

  socket.on('disconnect', () => {
    console.log('Rời phòng:', socket.id);
    io.to('classroom').emit('user-disconnected', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server đang chạy tại cổng ${PORT}`));
