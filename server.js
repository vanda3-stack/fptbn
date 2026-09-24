const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" },
  maxHttpBufferSize: 1e7 // Bộ đệm 10MB để nhận ảnh Base64
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- CẤU HÌNH XÁC THỰC GIÁO VIÊN ---
const TEACHER_PASS = "123456";

// Danh sách email GV được phép (Hoặc bắt buộc đuôi @fe.edu.vn)
function isValidTeacherEmail(email) {
  if (!email) return false;
  const cleanEmail = email.trim().toLowerCase();
  
  // Kiểm tra đuôi email tổ chức
  const isFeDomain = cleanEmail.endsWith('@fe.edu.vn');
  return isFeDomain;
}

// Kiểm tra định dạng Mã Học Sinh: FBN + 5 chữ số
function isValidStudentCode(code) {
  if (!code) return false;
  const regex = /^FBN\d{5}$/i; 
  return regex.test(code.trim());
}

let latestTeacherImage = null;
const connectedStudents = {};

io.on('connection', (socket) => {
  console.log('Kết nối mới:', socket.id);

  // Khung xác thực Đăng nhập
  socket.on('auth-user', ({ role, teacherEmail, teacherPass, studentCode, className, studentName }, callback) => {
    if (role === 'teacher') {
      if (!isValidTeacherEmail(teacherEmail)) {
        return callback({ 
          success: false, 
          message: "Email Giáo viên không hợp lệ! Vui lòng nhập đúng email trường (@fe.edu.vn), ví dụ: vanda3@fe.edu.vn" 
        });
      }
      if (teacherPass !== TEACHER_PASS) {
        return callback({ 
          success: false, 
          message: "Mật khẩu Giáo viên không chính xác!" 
        });
      }
      callback({ success: true });

    } else if (role === 'student') {
      if (!isValidStudentCode(studentCode)) {
        return callback({ 
          success: false, 
          message: "Mã Học Sinh không đúng định dạng! Mã hợp lệ bao gồm chữ FBN và 5 chữ số (Ví dụ: FBN12345)." 
        });
      }

      if (!studentName || studentName.trim().length < 2) {
        return callback({ 
          success: false, 
          message: "Vui lòng nhập đầy đủ Họ và Tên của bạn!" 
        });
      }

      callback({ success: true, formattedCode: studentCode.toUpperCase().trim() });
    }
  });

  socket.on('join-room', ({ role, name, className, studentCode }) => {
    socket.role = role;
    socket.userName = name;
    socket.className = className || '';
    socket.studentCode = studentCode ? studentCode.toUpperCase() : '';
    socket.join('classroom');

    if (role === 'student') {
      connectedStudents[socket.id] = {
        id: socket.id,
        name: socket.userName,
        className: socket.className,
        code: socket.studentCode,
        status: 'online',
        lastTime: new Date().toLocaleTimeString('vi-VN')
      };

      // Gửi ngay Slide bài giảng GV cho HS mới vào
      if (latestTeacherImage) {
        socket.emit('teacher-image-update', latestTeacherImage);
      }
    }

    io.to('classroom').emit('room-presence-update', Object.values(connectedStudents));
  });

  // Nhận ảnh màn hình từ Học sinh (3s/lần)
  socket.on('student-image', (imageData) => {
    if (connectedStudents[socket.id]) {
      connectedStudents[socket.id].status = 'online';
      connectedStudents[socket.id].lastTime = new Date().toLocaleTimeString('vi-VN');
    }
    socket.to('classroom').emit('student-image-update', {
      studentId: socket.id,
      name: socket.userName,
      className: socket.className,
      code: socket.studentCode,
      image: imageData
    });
  });

  // Nhận ảnh Slide bài giảng từ Giáo viên (3s/lần)
  socket.on('teacher-image', (imageData) => {
    latestTeacherImage = imageData;
    socket.to('classroom').emit('teacher-image-update', imageData);
  });

  // Xử lý khi HS tự ngắt kết nối hoặc tắt ứng dụng
  socket.on('disconnect', () => {
    if (socket.role === 'student' && connectedStudents[socket.id]) {
      const timeStr = new Date().toLocaleTimeString('vi-VN');
      connectedStudents[socket.id].status = 'offline';
      connectedStudents[socket.id].disconnectTime = timeStr;

      // Phát thông báo tắt ứng dụng tới máy GV
      io.to('classroom').emit('student-app-closed', {
        studentId: socket.id,
        name: socket.userName,
        className: socket.className,
        code: socket.studentCode,
        time: timeStr
      });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server đang chạy tại cổng ${PORT}`));
