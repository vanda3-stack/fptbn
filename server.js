const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" },
  maxHttpBufferSize: 1e7, // Cho phép truyền buffer dung lượng lớn cho snapshot
  pingTimeout: 20000,
  pingInterval: 10000
});

// Phục vụ các file tĩnh trong thư mục public
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- CẤU HÌNH XÁC THỰC GIÁO VIÊN & HỌC SINH ---
const TEACHER_PASS = "123456";

function isValidTeacherEmail(email) {
  if (!email) return false;
  const cleanEmail = email.trim().toLowerCase();
  return cleanEmail.endsWith('@fe.edu.vn');
}

function isValidStudentCode(code) {
  if (!code) return false;
  const regex = /^FBN\d{5}$/i; 
  return regex.test(code.trim());
}

let latestTeacherImage = null;
const connectedStudents = {}; // Danh sách học sinh theo studentCode
const disconnectTimers = {}; // Bộ đếm chờ 4 giây chống báo động giả khi học sinh tự do chuyển tab / reconnect

io.on('connection', (socket) => {
  console.log('Socket kết nối mới:', socket.id);

  // 1. Xác thực đăng nhập
  socket.on('auth-user', ({ role, teacherEmail, teacherPass, studentCode, className, studentName }, callback) => {
    if (role === 'teacher') {
      if (!isValidTeacherEmail(teacherEmail)) {
        return callback({ 
          success: false, 
          message: "Email đăng nhập không đúng định dạng cho phép (@fe.edu.vn)!" 
        });
      }
      if (teacherPass !== TEACHER_PASS) {
        return callback({ 
          success: false, 
          message: "Mật khẩu xác thực không chính xác!" 
        });
      }
      
      socket.role = 'teacher';
      socket.userName = teacherEmail.split('@')[0];
      return callback({ success: true });

    } else if (role === 'student') {
      if (!isValidStudentCode(studentCode)) {
        return callback({ 
          success: false, 
          message: "Mã Học Sinh không đúng định dạng! Mã bao gồm tiền tố FBN và 5 chữ số (Ví dụ: FBN12345)." 
        });
      }

      if (!studentName || studentName.trim().length < 2) {
        return callback({ 
          success: false, 
          message: "Vui lòng nhập đầy đủ Họ và Tên của bạn!" 
        });
      }

      const formattedCode = studentCode.toUpperCase().trim();
      const cleanName = studentName.trim();
      const cleanClass = className || '10A1';

      socket.role = 'student';
      socket.userName = cleanName;
      socket.studentCode = formattedCode;
      socket.className = cleanClass;

      return callback({ success: true, formattedCode: formattedCode });
    }
  });

  // 2. Tham gia phòng học
  socket.on('join-room', ({ role, name, className, studentCode }) => {
    socket.role = role;
    socket.userName = name || socket.userName || 'Học sinh';
    socket.className = className || socket.className || '10A1';
    socket.studentCode = (studentCode || socket.studentCode || 'FBN00000').toUpperCase();
    
    socket.join('classroom');

    if (role === 'student') {
      // Hủy đếm ngược ngắt kết nối nếu đây là đợt tự kết nối lại (Reconnect)
      if (disconnectTimers[socket.studentCode]) {
        clearTimeout(disconnectTimers[socket.studentCode]);
        delete disconnectTimers[socket.studentCode];
        console.log(`Học sinh ${socket.userName} (${socket.studentCode}) đã khôi phục kết nối thành công.`);
      }

      connectedStudents[socket.studentCode] = {
        socketId: socket.id,
        name: socket.userName,
        className: socket.className,
        code: socket.studentCode,
        status: 'online',
        lastTime: new Date().toLocaleTimeString('vi-VN')
      };

      if (latestTeacherImage) {
        socket.emit('teacher-image-update', latestTeacherImage);
      }
    }
  });

  // 3. Nhận ảnh màn hình từ Học sinh (3s/lần)
  socket.on('student-image', (imageData) => {
    if (!socket.studentCode && connectedStudents[socket.id]) {
      socket.studentCode = connectedStudents[socket.id].code;
      socket.userName = connectedStudents[socket.id].name;
      socket.className = connectedStudents[socket.id].className;
    }

    if (!socket.studentCode || socket.studentCode === 'UNDEFINED') return;

    if (connectedStudents[socket.studentCode]) {
      connectedStudents[socket.studentCode].socketId = socket.id;
      connectedStudents[socket.studentCode].status = 'online';
    }

    socket.to('classroom').emit('student-image-update', {
      studentId: socket.studentCode,
      name: socket.userName || 'Học sinh',
      className: socket.className || '10A1',
      code: socket.studentCode || 'FBN00000',
      image: imageData
    });
  });

  // 4. Nhận ảnh Slide từ Giáo viên
  socket.on('teacher-image', (imageData) => {
    latestTeacherImage = imageData;
    socket.to('classroom').emit('teacher-image-update', imageData);
  });

  // 5. Xử lý khi Học sinh ngắt kết nối ( Grace Period 4 giây chống báo động giả )
  socket.on('disconnect', () => {
    if (socket.role === 'student' && socket.studentCode) {
      const studentCode = socket.studentCode;
      const studentName = socket.userName || 'Học sinh';
      const className = socket.className || '10A1';
      const timeStr = new Date().toLocaleTimeString('vi-VN');

      disconnectTimers[studentCode] = setTimeout(() => {
        delete connectedStudents[studentCode];
        delete disconnectTimers[studentCode];

        console.log(`Xác nhận Học sinh ${studentName} (${studentCode}) đã thực sự ngắt kết nối.`);

        io.to('classroom').emit('student-app-closed', {
          studentId: studentCode,
          name: studentName,
          className: className,
          code: studentCode,
          time: timeStr
        });
      }, 4000);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server giám sát màn hình đang chạy tại cổng ${PORT}`));
