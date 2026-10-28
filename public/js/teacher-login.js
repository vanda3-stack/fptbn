const teacherLoginPage = document.getElementById("teacherLoginPage");
const teacherApp = document.getElementById("teacherApp");
const teacherEmailInput = document.getElementById("teacherEmail");
const teacherPasswordInput = document.getElementById("teacherPassword");
const teacherLoginButton = document.getElementById("teacherLoginButton");
const teacherClassRow = document.getElementById("teacherClassRow");
const teacherClassSelect = document.getElementById("teacherClassSelect");
const teacherEnterClassButton = document.getElementById("teacherEnterClassButton");
const teacherLoginStatus = document.getElementById("teacherLoginStatus");
const teacherIdentity = document.getElementById("teacherIdentity");

let teacherLoginToken = "";
let loggedTeacher = null;
let activeTeacherClass = "";
let teacherClassJoined = false;

async function loginTeacherByEmail() {
    const email = teacherEmailInput.value.trim().toLowerCase();
    const password = teacherPasswordInput.value;

    if (!email || !password) {
        teacherLoginStatus.textContent = "🔴 Vui lòng nhập email và mật khẩu giáo viên";
        teacherEmailInput.focus();
        return;
    }

    teacherLoginButton.disabled = true;
    teacherLoginStatus.textContent = "🟡 Đang kiểm tra email...";

    try {
        const response = await fetch("/api/teacher/login", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({email, password})
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || "Không thể đăng nhập");
        }

        teacherLoginToken = data.token;
        loggedTeacher = data.teacher;

        const classResponse = await fetch("/api/teacher/classes", {
            headers: {"x-teacher-token": teacherLoginToken}
        });

        const classData = await classResponse.json();

        if (!classResponse.ok || !classData.success) {
            throw new Error(classData.message || "Không lấy được danh sách lớp");
        }

        teacherClassSelect.innerHTML = "";

        classData.classes.forEach(item => {
            const option = document.createElement("option");
            option.value = item.class_code;
            option.textContent = item.class_code +
                (item.class_name && item.class_name !== item.class_code
                    ? " - " + item.class_name
                    : "");
            teacherClassSelect.appendChild(option);
        });

        const examOption = document.createElement("option");
        examOption.value = "EXAM";
        examOption.textContent = "EXAM — Phòng thi chung (nhiều lớp)";
        teacherClassSelect.appendChild(examOption);

        teacherEmailInput.disabled = true;
        teacherPasswordInput.disabled = true;
        teacherLoginButton.style.display = "none";
        teacherClassRow.style.display = "block";
        teacherLoginStatus.textContent =
            "🟢 " + loggedTeacher.full_name + " • Chọn lớp đang giảng dạy";

    } catch (error) {
        console.error("TEACHER LOGIN:", error);
        teacherLoginStatus.textContent =
            "🔴 " + (error.message || "Không thể đăng nhập");
        teacherLoginButton.disabled = false;
    }
}

function enterTeacherClass() {
    const classCode = teacherClassSelect.value.trim().toUpperCase();

    if (!classCode) {
        teacherLoginStatus.textContent = "🔴 Hãy chọn lớp";
        return;
    }

    if (!socket.connected) {
        teacherLoginStatus.textContent = "🔴 Chưa kết nối được máy chủ";
        return;
    }

    activeTeacherClass = classCode;
    teacherEnterClassButton.disabled = true;
    teacherLoginStatus.textContent = "🟡 Đang vào lớp " + classCode + "...";

    socket.emit("teacher-join", {
        token: teacherLoginToken,
        classCode: activeTeacherClass
    });
}

teacherLoginButton.addEventListener("click", loginTeacherByEmail);

teacherEmailInput.addEventListener("keydown", event => {
    if (event.key === "Enter") {
        loginTeacherByEmail();
    }
});

teacherEnterClassButton.addEventListener("click", enterTeacherClass);

socket.on("teacher-ready", data => {
    if (!data || !data.class || !data.class.class_code) {
        return;
    }

    teacherClassJoined = true;
    activeTeacherClass = data.class.class_code;

    teacherLoginPage.style.display = "none";
    teacherApp.style.display = "block";

    // Exam is monitoring-only: no teacher screen share and no global end-class.
    const examOnly = activeTeacherClass === "EXAM";
    const teacherShareControl = document.getElementById("shareTeacher");
    const teacherEndControl = document.getElementById("endClass");
    if (teacherShareControl) teacherShareControl.style.display = examOnly ? "none" : "";
    if (teacherEndControl && examOnly) teacherEndControl.textContent = "🚪 Rời phòng thi";


    // Chỉ hiện tài nguyên khi giáo viên vào phòng EXAM.
    let examResources = document.getElementById("teacherExamResources");
    if (activeTeacherClass === "EXAM") {
        if (!examResources) {
            examResources = document.createElement("nav");
            examResources.id = "teacherExamResources";
            examResources.setAttribute("aria-label", "Tài nguyên phòng thi");
            examResources.style.cssText = "position:fixed;bottom:16px;right:16px;z-index:9999;display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:10px 12px;border:1px solid #47658b;border-radius:14px;background:#101f35f2;box-shadow:0 6px 24px #0008;font:600 14px system-ui,sans-serif;max-width:calc(100vw - 32px)";
            const label = document.createElement("span");
            label.textContent = "📚 Tài nguyên phòng thi";
            label.style.color = "#dbeafe";
            examResources.appendChild(label);
            const links = [
                ["📝 Bài kiểm tra ↗", "https://forms.gle/zdrRxyh1kQZQRXq98", "#2563eb"],
                ["📖 Game Manual ↗", "https://content.vexrobotics.com/docs/2026-2027/level-up/files/LevelUp-2.1.pdf", "#167b67"]
            ];
            for (const [text, url, color] of links) {
                const a = document.createElement("a");
                a.textContent = text;
                a.href = url;
                a.target = "_blank";
                a.rel = "noopener noreferrer";
                a.style.cssText = "color:#fff;background:" + color + ";border-radius:9px;padding:9px 12px;text-decoration:none";
                examResources.appendChild(a);
            }
            document.body.appendChild(examResources);
        }
        examResources.style.display = "flex";
    } else if (examResources) {
        examResources.style.display = "none";
    }


    teacherIdentity.textContent =
        (data.teacher?.full_name || loggedTeacher?.full_name || "Giáo viên") +
        " - " +
        activeTeacherClass;
});

socket.on("teacher-join-error", data => {
    teacherClassJoined = false;
    teacherEnterClassButton.disabled = false;
    teacherLoginStatus.textContent =
        "🔴 " + (data?.message || "Không thể vào lớp");
});

socket.on("connect", () => {
    if (teacherClassJoined && teacherLoginToken && activeTeacherClass) {
        socket.emit("teacher-join", {
            token: teacherLoginToken,
            classCode: activeTeacherClass
        });
    }
});
