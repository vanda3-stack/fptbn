const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" },
  pingTimeout: 20000,
  pingInterval: 10000
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// XÁC THỰC TÀI KHOẢN
const TEACHER_PASS = "123456";

function isValidTeacherEmail(email) {
  return email && email.trim().toLowerCase().endsWith('@fe.edu.vn');
}

function isValidStudentCode(code) {
  return code && /^FBN\d{5}$/i.test(code.trim());
}

const connectedStudents = {};
let currentTeacherSocketId = null;

io.on('connection', (socket) => {

  // 1. Xác thực tài khoản
  socket.on('auth-user', ({ role, teacherEmail, teacherPass, studentCode, className, studentName }, callback) => {
    if (role === 'teacher') {
      if (!isValidTeacherEmail(teacherEmail)) {
        return callback({ success: false, message: "Email không thuộc hệ thống @fe.edu.vn!" });
      }
      if (teacherPass !== TEACHER_PASS) {
        return callback({ success: false, message: "Mật khẩu quản trị không đúng!" });
      }
      socket.role = 'teacher';
      socket.userName = teacherEmail.split('@')[0];
      currentTeacherSocketId = socket.id;
      return callback({ success: true });

    } else if (role === 'student') {
      if (!isValidStudentCode(studentCode)) {
        return callback({ success: false, message: "Mã Học Sinh không đúng (Ví dụ: FBN12345)!" });
      }
      if (!studentName || studentName.trim().length < 2) {
        return callback({ success: false, message: "Vui lòng nhập đầy đủ Họ và Tên!" });
      }

      socket.role = 'student';
      socket.userName = studentName.trim();
      socket.studentCode = studentCode.toUpperCase().trim();
      socket.className = className || '10A1';

      return callback({ success: true, formattedCode: socket.studentCode });
    }
  });

  // 2. Vào phòng học
  socket.on('join-room', ({ role, name, className, studentCode }) => {
    socket.role = role;
    socket.userName = name || socket.userName;
    socket.className = className || socket.className || '10A1';
    socket.studentCode = (studentCode || socket.studentCode || 'FBN00000').toUpperCase();

    socket.join('classroom');

    if (role === 'student') {
      connectedStudents[socket.studentCode] = {
        socketId: socket.id,
        name: socket.userName,
        className: socket.className,
        code: socket.studentCode
      };

      // Báo cho Giáo viên biết có Học sinh mới tham gia để khởi tạo WebRTC Connection
      if (currentTeacherSocketId) {
        io.to(currentTeacherSocketId).emit('student-joined-webrtc', {
          socketId: socket.id,
          studentCode: socket.studentCode,
          name: socket.userName,
          className: socket.className
        });
      }
    } else if (role === 'teacher') {
      currentTeacherSocketId = socket.id;
      // Gửi danh sách toàn bộ HS đang online cho Giáo viên kết nối
      socket.emit('all-online-students', Object.values(connectedStudents));
    }
  });

  // 3. Xử lý Signaling WebRTC (Trao đổi Offer / Answer / ICE Candidate)
  socket.on('webrtc-offer', ({ targetSocketId, offer, studentCode, name, className }) => {
    io.to(targetSocketId).emit('webrtc-offer', {
      senderSocketId: socket.id,
      offer,
      studentCode,
      name,
      className
    });
  });

  socket.on('webrtc-answer', ({ targetSocketId, answer }) => {
    io.to(targetSocketId).emit('webrtc-answer', {
      senderSocketId: socket.id,
      answer
    });
  });

  socket.on('webrtc-ice-candidate', ({ targetSocketId, candidate }) => {
    io.to(targetSocketId).emit('webrtc-ice-candidate', {
      senderSocketId: socket.id,
      candidate
    });
  });

  // 4. Ngắt kết nối
  socket.on('disconnect', () => {
    if (socket.role === 'student' && socket.studentCode) {
      delete connectedStudents[socket.studentCode];
      io.to('classroom').emit('student-disconnected', {
        socketId: socket.id,
        studentCode: socket.studentCode
      });
    } else if (socket.role === 'teacher') {
      if (currentTeacherSocketId === socket.id) currentTeacherSocketId = null;
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 WebRTC Server đang vận hành tại cổng ${PORT}`));
