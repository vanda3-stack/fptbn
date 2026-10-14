const socket = io({
    transports: [
        "websocket",
        "polling"
    ]
});


// =====================================================
// DOM
// =====================================================

const joinPage =
    document.getElementById("joinPage");

const classroom =
    document.getElementById("classroom");

const button =
    document.getElementById("shareButton");

const studentCodeInput =
    document.getElementById("studentCode");

const statusBox =
    document.getElementById("status");

const studentStatus =
    document.getElementById("studentStatus");

const studentBadge =
    document.getElementById("studentBadge");

const teacherVideo =
    document.getElementById("teacherVideo");

const waitingTeacher =
    document.getElementById("waitingTeacher");


// =====================================================
// CHUẨN HÓA MÃ HỌC SINH
// FBN + đúng 5 chữ số
// =====================================================

studentCodeInput.addEventListener(
    "input",
    () => {

        let value =
            studentCodeInput.value
                .toUpperCase()
                .replace(/\s+/g, "")
                .replace(/[^A-Z0-9]/g, "");


        // Nếu HS chỉ gõ số, tự thêm FBN.
        if (/^\d+$/.test(value)) {

            value =
                "FBN" +
                value.slice(0, 5);

        } else {

            // Cho phép gõ dần F -> FB -> FBN,
            // sau FBN chỉ giữ tối đa 5 số.
            const digits =
                value
                    .replace(/^F?B?N?/i, "")
                    .replace(/\D/g, "")
                    .slice(0, 5);


            const prefixLength =
                value.startsWith("FBN")
                    ? 3
                    : value.startsWith("FB")
                        ? 2
                        : value.startsWith("F")
                            ? 1
                            : 0;


            const prefix =
                "FBN".slice(
                    0,
                    prefixLength
                );


            value =
                prefix +
                digits;

        }


        studentCodeInput.value =
            value;

    }
);


// =====================================================
// STATE
// =====================================================

let screenStream = null;

// HS -> GV
let studentPeer = null;
// In EXAM each proctor needs a separate student-screen RTCPeerConnection.
const examStudentPeers = new Map();
const examPendingIce = new Map();

// GV -> HS
let teacherPeer = null;

let studentId = null;

let studentCode = "";

let studentName = "";

let studentClassId = null;

let studentClassCode = "";

let studentClassName = "";

let studentSchoolYear = "";

let joinedClass = false;


// =====================================================
// ICE QUEUE
//
// ICE candidate có thể đến trước SDP.
// Nếu add ngay có thể bị lỗi.
// =====================================================

const pendingIce = {

    "student-screen": [],

    "teacher-screen": []

};


// =====================================================
// WEBRTC CONFIG
// =====================================================

const rtcConfig = {

    iceServers: [

        // =========================================
        // STUN
        // =========================================

        {
            urls: [
                "stun:stun.l.google.com:19302",
                "stun:stun1.l.google.com:19302"
            ]
        },


        // =========================================
        // TURN SERVER
        // =========================================

        {
            urls: [

                "turn:103.82.26.166:3478?transport=udp",

                "turn:103.82.26.166:3478?transport=tcp"

            ],

            username:
                "fptbn",

            credential:
                "FPTBN2026Turn"
        }

    ],


    // Cho phép:
    //
    // host  -> kết nối LAN
    // srflx -> STUN
    // relay -> TURN

    iceTransportPolicy:
        "all",


    // Chuẩn bị ICE candidate sớm
    // giúp nhiều máy kết nối nhanh hơn.

    iceCandidatePoolSize:
        4

};


// =====================================================
// SOCKET CONNECT
// =====================================================

socket.on(
    "connect",
    () => {

        console.log(
            "STUDENT SOCKET CONNECTED:",
            socket.id
        );


        if (!joinedClass) {

            statusBox.textContent =
                "🟢 Đã kết nối máy chủ";

        } else {

            studentStatus.textContent =
                "🟢 Đã kết nối lại";

        }


        // =============================================
        // SOCKET RECONNECT
        // =============================================

        if (
            joinedClass &&
            studentName &&
            screenStream
        ) {

            console.log(
                "Re-register student after reconnect"
            );


            socket.emit(
                "student-join",
                {
                    examMode: window.FPTBN_EXAM_MODE === true,
                    studentId:
                        studentId,

                    studentCode:
                        studentCode,

                    name:
                        studentName,

                    classId:
                        studentClassId,

                    classCode:
                        studentClassCode,

                    className:
                        studentClassName,

                    schoolYear:
                        studentSchoolYear
                }
            );


        }

    }
);


// =====================================================
// SOCKET ERROR
// =====================================================

socket.on(
    "connect_error",
    error => {

        console.error(
            "SOCKET CONNECTION ERROR:",
            error
        );


        if (!joinedClass) {

            statusBox.textContent =
                "🔴 Không kết nối được máy chủ";

        } else {

            studentStatus.textContent =
                "🟡 Đang kết nối lại...";

        }

    }
);


// =====================================================
// SOCKET DISCONNECT
// =====================================================

socket.on(
    "disconnect",
    reason => {

        console.log(
            "STUDENT SOCKET DISCONNECTED:",
            reason
        );


        if (joinedClass) {

            studentStatus.textContent =
                "🟡 Mất kết nối - đang thử kết nối lại...";

        } else {

            statusBox.textContent =
                "🔴 Mất kết nối máy chủ";

        }

    }
);


// Preload the teacher-selected mode while the student types their ID.
// Fullscreen must be requested synchronously from the student click.
let preparedClassMode = null;
let classModeTimer = null;
let classModeRequest = 0;
async function loadClassMode(code) {
    const request = ++classModeRequest;
    preparedClassMode = null;
    if (!/^FBN\\d{5}$/.test(code) || window.FPTBN_EXAM_MODE === true) return;
    try {
        const response = await fetch("/api/student/class-mode?student_code=" + encodeURIComponent(code), {cache:"no-store"});
        const data = await response.json();
        if (request === classModeRequest && studentCodeInput.value.trim().toUpperCase() === code && response.ok && data.success) {
            preparedClassMode = {code, focus: data.teacherOnline === true && data.focusMode === true, loadedAt:Date.now()};
        }
    } catch (error) { console.warn("Could not preload classroom mode", error); }
}
studentCodeInput.addEventListener("input", () => {
    clearTimeout(classModeTimer);
    const code = studentCodeInput.value.trim().toUpperCase();
    preparedClassMode = null;
    classModeTimer = setTimeout(() => loadClassMode(code), 180);
});
studentCodeInput.addEventListener("blur", () => {
    const code = studentCodeInput.value.trim().toUpperCase();
    if (!preparedClassMode && /^FBN\\d{5}$/.test(code)) loadClassMode(code);
});

// =====================================================
// VÀO LỚP
// =====================================================

button.addEventListener(
    "click",
    async () => {

        const code =
            studentCodeInput
                .value
                .trim()
                .toUpperCase();

        // =============================================
        // KIỂM TRA MÃ HỌC SINH
        // =============================================

        if (!code) {

            alert(
                "Hãy nhập Mã học sinh."
            );

            studentCodeInput.focus();

            return;

        }


        if (
            !/^FBN\d{5}$/.test(
                code
            )
        ) {

            alert(
                "Mã học sinh chưa đúng.\n\n" +
                "Mã cần có dạng FBN + 5 số.\n" +
                "Ví dụ: FBN12345"
            );

            studentCodeInput.focus();

            return;

        }


        studentCodeInput.value =
            code;

        // Focus mode: request fullscreen during the student's own login click,
        // before any asynchronous work. Chrome may exit when its Share picker opens.
        // Do not apply to EXAM or normal classes.
        const cachedMode = preparedClassMode?.code === code &&
            preparedClassMode.focus === true &&
            preparedClassMode.teacherOnline === true;
        if (window.FPTBN_EXAM_MODE !== true && cachedMode &&
            !document.fullscreenElement && document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(error => {
                console.info("Fullscreen on login click was blocked:", error);
            });
        }

        // =============================================
        // KIỂM TRA SOCKET
        // =============================================

        if (!socket.connected) {

            alert(
                "Chưa kết nối được máy chủ.\n\n" +
                "Hãy kiểm tra mạng và tải lại trang."
            );

            return;

        }


        // =============================================
        // KHÓA BUTTON
        // =============================================

        button.disabled =
            true;


        button.textContent =
            "Đang yêu cầu chia sẻ màn hình...";


        try {

    // =========================================
    // TRA THÔNG TIN HỌC SINH
    // =========================================

    const loginResponse =
        await fetch(
            "/api/student/login",
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body: JSON.stringify({
                    student_code: code
                })
            }
        );


    const loginData =
        await loginResponse.json();


    if (
        !loginResponse.ok ||
        !loginData.success ||
        !loginData.student
    ) {

        throw new Error(
            loginData.message ||
            "Không tìm thấy học sinh."
        );

    }


    // =========================================
    // LƯU THÔNG TIN HS TỪ DATABASE
    // =========================================

    const student =
        loginData.student;


    studentId =
        student.id;

    studentCode =
        student.student_code;

    studentName =
        student.full_name;

    studentClassId =
        student.class_id;

    studentClassCode =
        student.class_code;

    studentClassName =
        student.class_name;

    studentSchoolYear =
        student.school_year;


    console.log(
        "STUDENT INFO:",
        {
            studentId,
            studentCode,
            studentName,
            studentClassCode,
            studentSchoolYear
        }
    );


    // Kiểm tra mã đang được dùng TRƯỚC khi mở hộp thoại chia sẻ màn hình.
    const sessionResponse = await fetch("/api/student/session-check", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({student_code:studentCode}),
        cache: "no-store"
    });
    const sessionData = await sessionResponse.json();
    if (!sessionResponse.ok || !sessionData.success) {
        throw new Error(sessionData.message || "Không kiểm tra được phiên đăng nhập.");
    }
    if (sessionData.alreadyActive) {
        throw new Error("Mã học sinh " + studentCode + " đang được sử dụng ở tab hoặc thiết bị khác. Hãy đóng phiên trước rồi thử lại.");
    }

    // Resolve the current teacher mode before the screen picker.
    // Do not attempt fullscreen yet: the requested sequence is Share -> fullscreen.
    let focusAfterShare = false;
    if (window.FPTBN_EXAM_MODE !== true) {
        try {
            const modeResponse = await fetch(
                "/api/student/class-mode?student_code=" + encodeURIComponent(studentCode),
                {cache:"no-store"}
            );
            if (modeResponse.ok) {
                const mode = await modeResponse.json();
                focusAfterShare = mode.success === true &&
                    mode.teacherOnline === true && mode.focusMode === true;
            }
        } catch (modeError) {
            console.info("Class mode unavailable before sharing:", modeError);
        }
    }

    // =========================================
    // MÃ HS ĐÚNG -> BẮT ĐẦU SHARE
    // =========================================

    button.textContent =
        "Đang yêu cầu chia sẻ màn hình...";


    // =========================================
    // YÊU CẦU CHIA SẺ TOÀN BỘ MÀN HÌNH
    // =========================================

    screenStream =
        await navigator.mediaDevices.getDisplayMedia({

            video: {

                displaySurface: "monitor",

                frameRate: {
                    ideal: 3,
                    max: 3
                },

                width: {
                    ideal: 854,
                    max: 960
                },

                height: {
                    ideal: 480,
                    max: 540
                }

            },

            audio: false,

            preferCurrentTab: false,

            selfBrowserSurface: "exclude",

            surfaceSwitching: "exclude"

        });


    const selectedTrack =
        screenStream.getVideoTracks()[0];


    if (!selectedTrack) {

        screenStream
            .getTracks()
            .forEach(
                track => track.stop()
            );

        screenStream = null;

        throw new Error(
            "Không lấy được màn hình để chia sẻ."
        );

    }


    const displaySettings =
        selectedTrack.getSettings();


    console.log(
        "DISPLAY SETTINGS:",
        displaySettings
    );


    if (
        displaySettings.displaySurface !== "monitor"
    ) {

        screenStream
            .getTracks()
            .forEach(
                track => track.stop()
            );

        screenStream = null;

        alert(
            "⚠️ BẠN CHƯA CHỌN TOÀN BỘ MÀN HÌNH!\n\n" +
            "Hãy chọn TOÀN BỘ MÀN HÌNH (Entire Screen).\n" +
            "Không chọn Tab hoặc Cửa sổ. Nếu trình duyệt không xác định được loại chia sẻ, hãy dùng Chrome phiên bản mới nhất."
        );

        statusBox.textContent =
            "🔴 Hãy chia sẻ TOÀN BỘ MÀN HÌNH";

        button.disabled =
            false;

        button.textContent =
            "🖥 Vào lớp & chia sẻ toàn bộ màn hình";

        return;

    }


            // Best-effort fullscreen immediately after Entire Screen is selected.
            // Browsers may reject this because the Share dialog is not a page gesture.
            // The existing in-class fullscreen button remains the fallback.
            if (focusAfterShare &&
                !document.fullscreenElement &&
                document.documentElement.requestFullscreen) {
                try {
                    await document.documentElement.requestFullscreen();
                } catch (fullscreenError) {
                    console.info("Fullscreen after screen sharing was blocked; showing fallback button.", fullscreenError);
                }
            }

            // =========================================
            // ĐÁNH DẤU ĐÃ VÀO LỚP
            // =========================================

            joinedClass =
                true;


            // =========================================
            // ĐĂNG KÝ HS VÀO ROOM THEO LỚP
            //
            // Server sẽ tra lại studentId trong DB và
            // tự quyết định room. classCode phía client
            // chỉ dùng để hiển thị, không quyết định room.
            // =========================================

            socket.emit(
                "student-join",
                {
                    examMode: window.FPTBN_EXAM_MODE === true,
                    studentId:
                        studentId,

                    studentCode:
                        studentCode,

                    name:
                        studentName,

                    classId:
                        studentClassId,

                    classCode:
                        studentClassCode,

                    className:
                        studentClassName,

                    schoolYear:
                        studentSchoolYear
                }
            );


            // =========================================
            // CHUYỂN GIAO DIỆN
            // =========================================

            joinPage.style.display =
                "none";


            classroom.style.display =
                "block";


            studentStatus.textContent =
                "🟢 GV đang nhận màn hình";


            if (studentBadge) {

                studentBadge.textContent =
                    studentCode +
                    " - " +
                    studentName +
                    " - " +
                    studentClassCode;

                studentBadge.title =
                    studentClassCode
                        ? "Lớp " + studentClassCode
                        : "";

            }


            // =========================================
            // HS DỪNG SHARE
            // =========================================

            selectedTrack.addEventListener(
                "ended",
                () => {

                    console.log(
                        "Student stopped screen sharing"
                    );

                    // Báo cho server/GV biết HS đã dừng chia sẻ
                    socket.emit(
                        "student-screen-stopped"
                    );

                    // Đóng kết nối màn hình HS -> GV
                    closeStudentPeer();

                    // Stream cũ không còn sử dụng được
                    screenStream = null;

                    // Cập nhật trạng thái cho HS
                    studentStatus.textContent =
                        "🔴 ĐÃ DỪNG CHIA SẺ MÀN HÌNH";

                    // Hiện cảnh báo lớn
                    showReshareWarning();

                }
            );
            // =====================================================
            // CẢNH BÁO KHI HS DỪNG CHIA SẺ MÀN HÌNH
            // =====================================================

            function showReshareWarning() {

                // Nếu cảnh báo đã tồn tại thì không tạo thêm
                if (
                    document.getElementById(
                        "screen-share-warning"
                    )
                ) {
                    return;
                }

                const warning =
                    document.createElement("div");

                warning.id =
                    "screen-share-warning";

                warning.style.position =
                    "fixed";

                warning.style.top =
                    "0";

                warning.style.left =
                    "0";

                warning.style.width =
                    "100%";

                warning.style.height =
                    "100%";

                warning.style.background =
                    "rgba(0, 0, 0, 0.95)";

                warning.style.zIndex =
                    "999999";

                warning.style.display =
                    "flex";

                warning.style.flexDirection =
                    "column";

                warning.style.alignItems =
                    "center";

                warning.style.justifyContent =
                    "center";

                warning.style.textAlign =
                    "center";

                warning.style.color =
                    "white";

                warning.style.padding =
                    "30px";

                warning.style.boxSizing =
                    "border-box";


                warning.innerHTML = `

                    <div style="
                        font-size:70px;
                        margin-bottom:20px;
                    ">
                        ⚠️
                    </div>

                    <div style="
                        font-size:32px;
                        font-weight:bold;
                        margin-bottom:15px;
                    ">
                        BẠN ĐÃ DỪNG CHIA SẺ MÀN HÌNH
                    </div>

                    <div style="
                    font-size:18px;
                    line-height:1.6;
                    max-width:700px;
                    margin-bottom:30px;
                ">
                    Giáo viên hiện không thể quan sát màn hình của bạn.
                    <br><br>
                    Hãy bấm nút bên dưới và chọn
                    <b>TOÀN BỘ MÀN HÌNH (Entire Screen)</b>.
                </div>

                <button
                    id="reshare-screen-button"
                    type="button"
                    style="
                        padding:16px 30px;
                        font-size:20px;
                        font-weight:bold;
                        border:none;
                        border-radius:12px;
                        cursor:pointer;
                    "
                >
                    🖥 CHIA SẺ LẠI MÀN HÌNH
                </button>

                `;

                document.body.appendChild(
                    warning
                );


                // =========================================
                // NÚT CHIA SẺ LẠI
                // =========================================

                const reshareButton =
                    document.getElementById(
                        "reshare-screen-button"
                    );


                reshareButton.addEventListener(
                    "click",
                    async () => {

                        reshareButton.disabled = true;

                        reshareButton.textContent =
                            "⏳ Đang mở chia sẻ màn hình...";


                        const success =
                            await restartScreenShare();


                        // Nếu chia sẻ không thành công
                        // thì cho phép HS bấm lại
                        if (!success) {

                            reshareButton.disabled = false;

                            reshareButton.textContent =
                                "🖥 CHIA SẺ LẠI MÀN HÌNH";

                        }

                    }
                );

                }
                // =====================================================
                // HS CHIA SẺ LẠI MÀN HÌNH
                // =====================================================

                async function restartScreenShare() {

                    try {

                        studentStatus.textContent =
                            "🟡 Đang yêu cầu chia sẻ lại màn hình...";


                        // =============================================
                        // YÊU CẦU CHIA SẺ MÀN HÌNH MỚI
                        // =============================================

                        const newStream =
                            await navigator.mediaDevices.getDisplayMedia({

                                video: {

                                    displaySurface: "monitor",

                                    frameRate: {
                                        ideal: 5,
                                        max: 6
                                    }

                                },

                                audio: false,

                                preferCurrentTab: false,

                                selfBrowserSurface: "exclude",

                                surfaceSwitching: "exclude"

                            });


                        // =============================================
                        // LẤY VIDEO TRACK
                        // =============================================

                        const newTrack =
                            newStream.getVideoTracks()[0];


                        if (!newTrack) {

                            newStream
                                .getTracks()
                                .forEach(
                                    track => track.stop()
                                );

                            studentStatus.textContent =
                                "🔴 Không lấy được màn hình";

                            return false;

                        }


                        // =============================================
                        // KIỂM TRA HS CÓ CHỌN ENTIRE SCREEN KHÔNG
                        // =============================================

                        const settings =
                            newTrack.getSettings();


                        console.log(
                            "RESHARE DISPLAY SETTINGS:",
                            settings
                        );


                        if (
                            settings.displaySurface !== "monitor"
                        ) {

                            newStream
                                .getTracks()
                                .forEach(
                                    track => track.stop()
                                );


                            alert(
                                "⚠️ BẠN CHƯA CHỌN TOÀN BỘ MÀN HÌNH!\n\n" +
                                "Hãy chọn TOÀN BỘ MÀN HÌNH (Entire Screen).\n" +
                                "Không chọn Tab hoặc Cửa sổ. Nếu trình duyệt không xác định được loại chia sẻ, hãy dùng Chrome phiên bản mới nhất."
                            );


                            studentStatus.textContent =
                                "🔴 Hãy chia sẻ TOÀN BỘ MÀN HÌNH";

                            return false;

                        }


                        // =============================================
                        // LƯU STREAM MỚI
                        // =============================================

                        screenStream =
                            newStream;


                        // =============================================
                        // HIỂN THỊ PREVIEW
                        // =============================================

                        // =============================================
                        // ĐẢM BẢO PEER CŨ ĐÃ ĐÓNG
                        // =============================================

                        closeStudentPeer();


                        // =============================================
                        // BÁO SERVER:
                        // MÀN HÌNH HS ĐÃ SẴN SÀNG TRỞ LẠI
                        // =============================================

                        socket.emit(
                            "screen-ready"
                        );


                        studentStatus.textContent =
                            "🟡 Đã chia sẻ lại - đang kết nối với GV...";


                        // =============================================
                        // QUAN TRỌNG:
                        // THEO DÕI LẦN STOP SHARING TIẾP THEO
                        // =============================================

                        newTrack.addEventListener(
                            "ended",
                            () => {

                                console.log(
                                    "Student stopped screen sharing again"
                                );


                                socket.emit(
                                    "student-screen-stopped"
                                );


                                closeStudentPeer();


                                screenStream =
                                    null;

                                studentStatus.textContent =
                                    "🔴 ĐÃ DỪNG CHIA SẺ MÀN HÌNH";


                                showReshareWarning();

                            }
                        );


                        // =============================================
                        // CHIA SẺ THÀNH CÔNG
                        // XÓA MÀN HÌNH CẢNH BÁO
                        // =============================================

                        const warning =
                            document.getElementById(
                                "screen-share-warning"
                            );


                        if (warning) {

                            warning.remove();

                        }


                        return true;


                    } catch (error) {

                        console.error(
                            "RESHARE ERROR:",
                            error
                        );

                        studentStatus.textContent =
                            "🔴 Chưa chia sẻ lại màn hình";


                        return false;

                    }

                }


        } catch (error) {

            console.error(
                "SCREEN SHARE ERROR:",
                error
            );


            if (
                error.name ===
                "NotAllowedError"
            ) {

                statusBox.textContent =
                    "🟡 Bạn chưa cho phép chia sẻ màn hình";

            } else {

                statusBox.textContent =
                    "🔴 " +
                    (
                        error.message ||
                        "Không thể chia sẻ màn hình"
                    );

            }


            button.disabled =
                false;


            button.textContent =
                "🖥 Vào lớp & chia sẻ toàn bộ màn hình";

        }

    }
);


// =====================================================
// NHẬN OFFER
// =====================================================

socket.on(
    "webrtc-offer",
    async data => {

        console.log(
            "WEBRTC OFFER:",
            data.type,
            data.from
        );


        // =============================================
        // GV MUỐN NHẬN MÀN HÌNH HS
        // =============================================

        if (
            data.type ===
            "student-screen"
        ) {

            await answerStudentScreen(
                data
            );

        }


        // =============================================
        // GV GỬI MÀN HÌNH CHO HS
        // =============================================

        else if (
            data.type ===
            "teacher-screen"
        ) {

            await answerTeacherScreen(
                data
            );

        }

    }
);


// =====================================================
// HS -> GV
// =====================================================

async function answerStudentScreen(
    data
) {

    if (!screenStream) {

        console.warn(
            "No student screen stream"
        );

        return;

    }


    // EXAM: answer each teacher independently; never replace another proctor's stream.
    if (window.FPTBN_EXAM_MODE === true) {
        await answerExamStudentScreen(data);
        return;
    }

    // =============================================
    // ĐÓNG PEER CŨ
    // =============================================

    closeStudentPeer();


    pendingIce[
        "student-screen"
    ] = [];


    // =============================================
    // TẠO PEER
    // =============================================

    studentPeer =
        new RTCPeerConnection(
            rtcConfig
        );


    // =============================================
    // ADD MÀN HÌNH HS
    // =============================================

    screenStream
        .getTracks()
        .forEach(
            track => {

                studentPeer.addTrack(
                    track,
                    screenStream
                );

            }
        );


    // =============================================
    // ICE CANDIDATE HS
    // =============================================

    studentPeer.onicecandidate =
        event => {

            if (!event.candidate) {

                console.log(
                    "HS ICE GATHERING COMPLETE"
                );

                return;

            }


            console.log(
                "HS ICE:",
                event.candidate.type,
                event.candidate.protocol,
                event.candidate.address
            );


            socket.emit(
                "webrtc-ice",
                {

                    target:
                        data.from,

                    type:
                        "student-screen",

                    candidate:
                        event.candidate

                }
            );

        };


    // =============================================
    // ICE STATE
    // =============================================

    studentPeer
        .oniceconnectionstatechange =
        () => {

            if (!studentPeer) {

                return;

            }


            console.log(
                "HS -> GV ICE:",
                studentPeer
                    .iceConnectionState
            );

        };


    // =============================================
    // CONNECTION STATE
    // =============================================

    studentPeer
        .onconnectionstatechange =
        () => {

            if (!studentPeer) {

                return;

            }


            const state =
                studentPeer
                    .connectionState;


            console.log(
                "HS -> GV:",
                state
            );


            if (
                state ===
                "connected"
            ) {

                studentStatus.textContent =
                    "🟢 GV đang nhận màn hình";

            }


            else if (
                state ===
                "connecting"
            ) {

                studentStatus.textContent =
                    "🟡 Đang gửi màn hình tới GV...";

            }


            else if (
                state ===
                "disconnected"
            ) {

                studentStatus.textContent =
                    "🟡 Kết nối không ổn định...";

            }


            else if (
                state ===
                "failed"
            ) {

                studentStatus.textContent =
                    "🟡 GV đang thử kết nối lại...";

            }

        };


    // =============================================
    // SET OFFER
    // =============================================

    try {

        await studentPeer
            .setRemoteDescription(
                data.sdp
            );


        // =========================================
        // ADD ICE ĐẾN SỚM
        // =========================================

        await flushPendingIce(
            "student-screen",
            studentPeer
        );


        // =========================================
        // CREATE ANSWER
        // =========================================

        const answer =
            await studentPeer
                .createAnswer();


        await studentPeer
            .setLocalDescription(
                answer
            );


        // =========================================
        // SEND ANSWER
        // =========================================

        socket.emit(
            "webrtc-answer",
            {

                target:
                    data.from,

                type:
                    "student-screen",

                sdp:
                    studentPeer
                        .localDescription

            }
        );


        console.log(
            "STUDENT ANSWER SENT:",
            data.from
        );


    } catch (error) {

        console.error(
            "Student WebRTC error:",
            error
        );

    }

}


// EXAM ONLY: separate peer and ICE queue for every teacher socket.
async function answerExamStudentScreen(data) {
    const teacherId = String(data.from || "");
    if (!teacherId || !screenStream) return;
    const previous = examStudentPeers.get(teacherId);
    if (previous) { try { previous.close(); } catch (_) {} }
    const peer = new RTCPeerConnection(rtcConfig);
    examStudentPeers.set(teacherId, peer);
    for (const track of screenStream.getTracks()) peer.addTrack(track, screenStream);
    peer.onicecandidate = event => {
        if (event.candidate && examStudentPeers.get(teacherId) === peer) {
            socket.emit("webrtc-ice", {target: teacherId, type: "student-screen", candidate: event.candidate});
        }
    };
    peer.onconnectionstatechange = () => {
        if (examStudentPeers.get(teacherId) !== peer) return;
        if (peer.connectionState === "connected") studentStatus.textContent = "🟢 Đang chia sẻ màn hình cho giáo viên giám sát";
        if (peer.connectionState === "failed" || peer.connectionState === "closed") {
            examStudentPeers.delete(teacherId);
            try { peer.close(); } catch (_) {}
        }
    };
    try {
        await peer.setRemoteDescription(data.sdp);
        const queue = examPendingIce.get(teacherId) || [];
        examPendingIce.delete(teacherId);
        for (const candidate of queue) {
            try { await peer.addIceCandidate(candidate); } catch (err) { console.warn("EXAM ICE:", err); }
        }
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        if (examStudentPeers.get(teacherId) === peer) {
            socket.emit("webrtc-answer", {target: teacherId, type: "student-screen", sdp: peer.localDescription});
        }
    } catch (err) {
        console.error("EXAM student screen error:", err);
        if (examStudentPeers.get(teacherId) === peer) examStudentPeers.delete(teacherId);
        try { peer.close(); } catch (_) {}
    }
}

// =====================================================
// GV -> HS
// =====================================================

async function answerTeacherScreen(
    data
) {

    console.log(
        "Receiving teacher screen..."
    );


    // =============================================
    // ĐÓNG PEER CŨ
    // =============================================

    closeTeacherPeer();


    pendingIce[
        "teacher-screen"
    ] = [];


    // =============================================
    // TẠO PEER
    // =============================================

    teacherPeer =
        new RTCPeerConnection(
            rtcConfig
        );


    // =============================================
    // NHẬN VIDEO GV
    // =============================================

    teacherPeer.ontrack =
        event => {

            console.log(
                "TEACHER VIDEO RECEIVED"
            );


            if (
                !event.streams ||
                !event.streams[0]
            ) {

                return;

            }


            teacherVideo.srcObject =
                event.streams[0];


            waitingTeacher.style.display =
                "none";


            teacherVideo
                .play()
                .catch(
                    error => {

                        console.log(
                            "Teacher video play error:",
                            error
                        );

                    }
                );

        };


    // =============================================
    // ICE CANDIDATE
    // =============================================

    teacherPeer.onicecandidate =
        event => {

            if (!event.candidate) {

                console.log(
                    "GV -> HS ICE GATHERING COMPLETE"
                );

                return;

            }


            console.log(
                "STUDENT SIDE ICE FOR TEACHER:",
                event.candidate.type,
                event.candidate.protocol,
                event.candidate.address
            );


            socket.emit(
                "webrtc-ice",
                {

                    target:
                        data.from,

                    type:
                        "teacher-screen",

                    candidate:
                        event.candidate

                }
            );

        };


    // =============================================
    // ICE STATE
    // =============================================

    teacherPeer
        .oniceconnectionstatechange =
        () => {

            if (!teacherPeer) {

                return;

            }


            console.log(
                "GV -> HS ICE:",
                teacherPeer
                    .iceConnectionState
            );

        };


    // =============================================
    // CONNECTION STATE
    // =============================================

    teacherPeer
        .onconnectionstatechange =
        () => {

            if (!teacherPeer) {

                return;

            }


            const state =
                teacherPeer
                    .connectionState;


            console.log(
                "GV -> HS:",
                state
            );


            if (
                state ===
                "connected"
            ) {

                waitingTeacher
                    .style.display =
                    "none";

            }


            else if (
                state ===
                "failed"
            ) {

                waitingTeacher.textContent =
                    "🟡 Mất hình giáo viên - đang chờ kết nối lại...";


                waitingTeacher
                    .style.display =
                    "block";

            }

        };


    // =============================================
    // SET OFFER
    // =============================================

    try {

        await teacherPeer
            .setRemoteDescription(
                data.sdp
            );


        // =========================================
        // ADD ICE ĐẾN SỚM
        // =========================================

        await flushPendingIce(
            "teacher-screen",
            teacherPeer
        );


        // =========================================
        // CREATE ANSWER
        // =========================================

        const answer =
            await teacherPeer
                .createAnswer();


        await teacherPeer
            .setLocalDescription(
                answer
            );


        // =========================================
        // SEND ANSWER
        // =========================================

        socket.emit(
            "webrtc-answer",
            {

                target:
                    data.from,

                type:
                    "teacher-screen",

                sdp:
                    teacherPeer
                        .localDescription

            }
        );


        console.log(
            "TEACHER SCREEN ANSWER SENT:",
            data.from
        );


    } catch (error) {

        console.error(
            "Teacher WebRTC error:",
            error
        );

    }

}


// =====================================================
// NHẬN ICE
// =====================================================

socket.on(
    "webrtc-ice",
    async data => {

        if (
            !data ||
            !data.candidate
        ) {

            return;

        }


        if (window.FPTBN_EXAM_MODE === true && data.type === "student-screen") {
            const teacherId = String(data.from || "");
            if (!teacherId) return;
            const peer = examStudentPeers.get(teacherId);
            if (!peer || !peer.remoteDescription) {
                const queue = examPendingIce.get(teacherId) || [];
                queue.push(data.candidate);
                examPendingIce.set(teacherId, queue);
            } else {
                try { await peer.addIceCandidate(data.candidate); }
                catch (err) { console.warn("EXAM ICE:", err); }
            }
            return;
        }

        let peer =
            null;


        if (
            data.type ===
            "student-screen"
        ) {

            peer =
                studentPeer;

        }


        else if (
            data.type ===
            "teacher-screen"
        ) {

            peer =
                teacherPeer;

        }


        if (
            !pendingIce[
                data.type
            ]
        ) {

            return;

        }


        // =============================================
        // REMOTE DESCRIPTION CHƯA CÓ
        // -> ĐƯA VÀO QUEUE
        // =============================================

        if (
            !peer ||
            !peer.remoteDescription
        ) {

            pendingIce[
                data.type
            ].push(
                data.candidate
            );


            console.log(
                "QUEUE",
                data.type.toUpperCase(),
                "ICE:",
                pendingIce[
                    data.type
                ].length
            );


            return;

        }


        // =============================================
        // ADD ICE
        // =============================================

        try {

            await peer
                .addIceCandidate(
                    data.candidate
                );


        } catch (error) {

            console.error(
                "ICE ERROR:",
                data.type,
                error
            );

        }

    }
);


// =====================================================
// FLUSH PENDING ICE
// =====================================================

async function flushPendingIce(
    type,
    peer
) {

    if (
        !peer ||
        !peer.remoteDescription
    ) {

        return;

    }


    const queue =
        pendingIce[
            type
        ] || [];


    if (
        queue.length ===
        0
    ) {

        return;

    }


    console.log(
        "FLUSH",
        type.toUpperCase(),
        "ICE:",
        queue.length
    );


    pendingIce[
        type
    ] = [];


    for (
        const candidate
        of queue
    ) {

        try {

            await peer
                .addIceCandidate(
                    candidate
                );


        } catch (error) {

            console.warn(
                "QUEUED ICE ERROR:",
                type,
                error
            );

        }

    }

}


// =====================================================
// GV BẮT ĐẦU SHARE
// =====================================================

socket.on(
    "teacher-share-started",
    () => {

        console.log(
            "Teacher started sharing"
        );


        waitingTeacher.textContent =
            "🟡 Đang kết nối màn hình giáo viên...";


        waitingTeacher.style.display =
            "block";

    }
);


// =====================================================
// GV DỪNG SHARE
// =====================================================

socket.on(
    "teacher-share-stopped",
    () => {

        console.log(
            "Teacher stopped sharing"
        );


        closeTeacherPeer();


        teacherVideo.srcObject =
            null;


        waitingTeacher.textContent =
            "👨‍🏫 Giáo viên chưa chia sẻ màn hình";


        waitingTeacher.style.display =
            "block";

    }
);


// =====================================================
// SERVER XÁC NHẬN ROOM LỚP
// =====================================================

socket.on(
    "class-info",
    info => {

        if (!joinedClass) {
            return;
        }


        if (info?.classCode) {

            studentClassCode =
                info.classCode;

        }


        if (info?.className) {

            studentClassName =
                info.className;

        }


        if (info?.schoolYear) {

            studentSchoolYear =
                info.schoolYear;

        }


        if (studentBadge) {

            studentBadge.textContent =
                studentCode +
                " - " +
                studentName +
                " - " +
                studentClassCode;

        }


        // Chỉ báo screen-ready sau khi server đã xác nhận
        // HS thực sự được join vào đúng room lớp.

        if (
            screenStream &&
            screenStream.active
        ) {

            socket.emit(
                "screen-ready"
            );

        }


        if (info?.teacherOnline) {

            studentStatus.textContent =
                "🟢 Đã vào lớp " +
                studentClassCode +
                " • GV đang trực tuyến";

        } else {

            studentStatus.textContent =
                "🟡 Đã vào lớp " +
                studentClassCode +
                " • Đang chờ giáo viên";

        }


        console.log(
            "JOINED CLASS ROOM:",
            studentClassCode,
            "teacherOnline:",
            !!info?.teacherOnline
        );

    }
);


socket.on(
    "student-join-error",
    info => {

        console.error(
            "STUDENT JOIN ERROR:",
            info
        );


        joinedClass =
            false;


        if (screenStream) {

            screenStream
                .getTracks()
                .forEach(
                    track => track.stop()
                );


            screenStream =
                null;

        }


        closeStudentPeer();

        closeTeacherPeer();


        classroom.style.display =
            "none";


        joinPage.style.display =
            "block";


        statusBox.textContent =
            "🔴 " +
            (
                info?.message ||
                "Không thể vào phòng lớp."
            );


        button.disabled =
            false;


        button.textContent =
            "🖥 Vào lớp & chia sẻ toàn bộ màn hình";

    }
);


// =====================================================
// CHẤT LƯỢNG MÀN HÌNH HS
//
// Grid: ưu tiên nhẹ cho 30 màn hình.
// Focus: tăng chất lượng khi GV phóng to một HS.
// =====================================================

async function applyStudentQuality(
    mode
) {

    if (!screenStream) {
        return;
    }


    const track =
        screenStream.getVideoTracks()[0];


    if (!track) {
        return;
    }


    const constraints =
        mode === "focus"
            ? {
                frameRate: {
                    ideal: 10,
                    max: 12
                },

                width: {
                    ideal: 1280,
                    max: 1920
                },

                height: {
                    ideal: 720,
                    max: 1080
                }
            }
            : {
                frameRate: {
                    ideal: 3,
                    max: 3
                },

                width: {
                    ideal: 854,
                    max: 960
                },

                height: {
                    ideal: 480,
                    max: 540
                }
            };


    try {

        await track.applyConstraints(
            constraints
        );


        console.log(
            "STUDENT QUALITY:",
            mode,
            track.getSettings()
        );


    } catch (error) {

        console.warn(
            "APPLY QUALITY FAILED:",
            mode,
            error
        );

    }

}


socket.on(
    "student-quality",
    data => {

        applyStudentQuality(
            data?.mode === "focus"
                ? "focus"
                : "grid"
        );

    }
);


// =====================================================
// GV OFFLINE
// =====================================================

socket.on(
    "teacher-offline",
    () => {

        console.log(
            "Teacher offline"
        );


        closeTeacherPeer();


        teacherVideo.srcObject =
            null;


        waitingTeacher.textContent =
            "🔴 Giáo viên đã mất kết nối";


        waitingTeacher.style.display =
            "block";

    }
);


// =====================================================
// GIÁO VIÊN KẾT THÚC LỚP
// =====================================================

socket.on(
    "class-ended",
    () => {

        console.log(
            "CLASS ENDED"
        );


        joinedClass =
            false;


        // =============================================
        // ĐÓNG WEBRTC
        // =============================================

        closeStudentPeer();

        closeTeacherPeer();


        // =============================================
        // DỪNG SHARE HS
        // =============================================

        if (
            screenStream
        ) {

            screenStream
                .getTracks()
                .forEach(
                    track => {

                        track.stop();

                    }
                );


            screenStream =
                null;

        }


        // =============================================
        // XÓA VIDEO GV
        // =============================================

        teacherVideo.srcObject =
            null;


        alert(
            "Giáo viên đã kết thúc lớp học."
        );


        location.reload();

    }
);


// =====================================================
// CLOSE STUDENT PEER
// =====================================================

function closeStudentPeer() {
    for (const peer of examStudentPeers.values()) {
        try { peer.close(); } catch (_) {}
    }
    examStudentPeers.clear();
    examPendingIce.clear();

    if (!studentPeer) {

        return;

    }


    try {

        studentPeer
            .onicecandidate =
            null;


        studentPeer
            .oniceconnectionstatechange =
            null;


        studentPeer
            .onconnectionstatechange =
            null;


        studentPeer.close();


    } catch (error) {

        console.log(
            "Close student peer:",
            error
        );

    }


    studentPeer =
        null;

}


// =====================================================
// CLOSE TEACHER PEER
// =====================================================

function closeTeacherPeer() {

    if (!teacherPeer) {

        return;

    }


    try {

        teacherPeer
            .ontrack =
            null;


        teacherPeer
            .onicecandidate =
            null;


        teacherPeer
            .oniceconnectionstatechange =
            null;


        teacherPeer
            .onconnectionstatechange =
            null;


        teacherPeer.close();


    } catch (error) {

        console.log(
            "Close teacher peer:",
            error
        );

    }


    teacherPeer =
        null;

}


// =====================================================
// CẢNH BÁO KHI HS ĐÓNG TAB / RELOAD TRANG
// =====================================================

window.addEventListener(
    "beforeunload",
    event => {

        // Chỉ cảnh báo khi học sinh đã vào lớp
        if (joinedClass) {

            event.preventDefault();

            event.returnValue = "";

        }

    }
);
// ===== Focus Mode: student fullscreen and visibility signals =====
(() => {
    if (window.FPTBN_EXAM_MODE === true) return;
    let focusEnabled = false, awaySince = 0, awayTimer = null, lastAlert = new Map(), suppressExit = false;
    const panel = document.createElement("div");
    panel.id = "focusStudentPrompt";
    panel.style.cssText = "display:none;background:#172554;color:white;border:1px solid #3b82f6;border-radius:12px;padding:16px;margin:0 0 12px;text-align:center;font:15px Arial";
    panel.innerHTML = '<div style="max-width:480px"><h2>🎯 Giáo viên đã mở lớp tập trung</h2><p>Đã chia sẻ màn hình thành công. Nhấn nút bên dưới để bắt đầu học toàn màn hình.</p><button id="focusStudentEnter" style="background:#2563eb;color:white;border:0;border-radius:10px;padding:14px 22px;font-weight:700;cursor:pointer">Xem toàn màn hình</button></div>';
    (document.getElementById("classroom") || document.body).prepend(panel);
    const active = () => document.getElementById("classroom")?.style.display === "block";
    const emitAlert = reason => {
        if (!active()) return;
        if (reason === "fullscreen-exit" && !focusEnabled) return;
        const now = Date.now();
        if (now - (lastAlert.get(reason) || 0) < 15000) return;
        lastAlert.set(reason,now);
        socket.emit("focus-alert",{reason});
    };
    const updatePrompt = () => {
        panel.style.display = active() && focusEnabled && !document.fullscreenElement ? "block" : "none";
        const enter = document.getElementById("focusStudentEnter");
        if (enter) enter.textContent = "Bắt đầu học toàn màn hình";
        document.body.classList.toggle("fptbn-focus-active", active() && focusEnabled);
    };
    document.getElementById("focusStudentEnter").addEventListener("click", async () => {
        try { await document.documentElement.requestFullscreen(); }
        catch (error) { console.warn("Fullscreen needs student gesture:",error); document.getElementById("focusStudentEnter").textContent = "Thử bật toàn màn hình"; }
        updatePrompt();
    });
    socket.on("focus-state", async data => {
        focusEnabled = data?.enabled === true;
        if (!focusEnabled && document.fullscreenElement) {
            suppressExit = true;
            try { await document.exitFullscreen(); } catch (_) {}
            setTimeout(()=>{suppressExit=false;},700);
        }
        updatePrompt();
    });
    document.addEventListener("fullscreenchange", () => {
        if (focusEnabled && !document.fullscreenElement && !suppressExit) emitAlert("fullscreen-exit");
        updatePrompt();
    });
    document.addEventListener("visibilitychange", () => {
        clearTimeout(awayTimer);
        if (document.hidden) {
            awaySince = Date.now();
            awayTimer = setTimeout(()=>{ if (document.hidden && Date.now()-awaySince >= 5000) emitAlert("tab-hidden"); }, 5000);
        } else if (awaySince) {
            if (Date.now()-awaySince >= 5000) emitAlert("tab-hidden");
            awaySince=0;
        }
    });
    window.addEventListener("blur", () => {
        if (!active()) return;
        const started=Date.now();
        setTimeout(()=>{if (!document.hasFocus() && Date.now()-started >= 5000) emitAlert("window-blur");},5000);
    });
    // Joining happens after getDisplayMedia; prompt is shown when classroom becomes visible.
    const observer = new MutationObserver(updatePrompt);
    const classroom = document.getElementById("classroom");
    if (classroom) observer.observe(classroom,{attributes:true,attributeFilter:["style"]});
})();
