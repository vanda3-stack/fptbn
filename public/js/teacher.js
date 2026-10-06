const socket = io({
    transports: [
        "websocket",
        "polling"
    ]
});


// =====================================================
// DOM
// =====================================================

const studentsBox =
    document.getElementById("students");

const empty =
    document.getElementById("empty");

const count =
    document.getElementById("count");

const shareTeacherButton =
    document.getElementById("shareTeacher");

const endClassButton =
    document.getElementById("endClass");

const teacherPreview =
    document.getElementById("teacherPreview");

const teacherShareBox =
    document.getElementById("teacherShareBox");


// =====================================================
// STATE
// =====================================================

// Peer dùng để nhận màn hình HS
const studentPeers =
    new Map();

// Peer dùng để gửi màn hình GV
const teacherPeers =
    new Map();

// Danh sách tên HS
const studentNames =
    new Map();

let teacherStream = null;


// =====================================================
// ICE QUEUE
// =====================================================

const pendingStudentIce =
    new Map();

const pendingTeacherIce =
    new Map();


// =====================================================
// RETRY
// =====================================================

const studentRetryTimers =
    new Map();

const studentRetryCounts =
    new Map();

const studentConnectTimeouts =
    new Map();

const MAX_RETRIES = 3;

const CONNECT_TIMEOUT = 10000;


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
        // TURN
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


    // Cho phép trình duyệt thử:
    //
    // host  = LAN
    // srflx = STUN
    // relay = TURN

    iceTransportPolicy:
        "all",


    // Chuẩn bị candidate sớm hơn

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
            "TEACHER CONNECTED:",
            socket.id
        );


        socket.emit(
            "teacher-join"
        );

    }
);


// =====================================================
// SOCKET DISCONNECT
// =====================================================

socket.on(
    "disconnect",
    reason => {

        console.warn(
            "TEACHER SOCKET DISCONNECTED:",
            reason
        );

    }
);


// =====================================================
// TEACHER READY
// =====================================================

socket.on(
    "teacher-ready",
    () => {

        console.log(
            "Teacher registered"
        );

    }
);


// =====================================================
// DANH SÁCH HS HIỆN TẠI
// =====================================================

socket.on(
    "student-list",
    list => {

        console.log(
            "STUDENT LIST:",
            list
        );


        list.forEach(
            student => {

                studentNames.set(
                    student.id,
                    student.name
                );


                createStudentBox(
                    student.id,
                    student.name
                );


                // =====================================
                // HS ĐÃ SHARE
                // =====================================

                if (
                    student.screenReady
                ) {

                    connectToStudent(
                        student.id
                    );

                }


                // =====================================
                // GV ĐANG SHARE
                // -> gửi luôn cho HS mới
                // =====================================

                if (
                    teacherStream
                ) {

                    sendTeacherScreen(
                        student.id
                    );

                }

            }
        );


        updateCount();

    }
);


// =====================================================
// HS VÀO LỚP
// =====================================================

socket.on(
    "student-joined",
    data => {

        console.log(
            "Student joined:",
            data
        );


        studentNames.set(
            data.id,
            data.name
        );


        createStudentBox(
            data.id,
            data.name
        );


        updateCount();


        // =============================================
        // NẾU GV ĐANG SHARE
        // =============================================

        if (
            teacherStream
        ) {

            sendTeacherScreen(
                data.id
            );

        }

    }
);


// =====================================================
// MÀN HÌNH HS READY
// =====================================================

socket.on(
    "student-screen-ready",
    data => {

        console.log(
            "SCREEN READY:",
            data
        );


        studentNames.set(
            data.id,
            data.name
        );


        createStudentBox(
            data.id,
            data.name
        );


        updateCount();


        // =============================================
        // RESET RETRY
        // =============================================

        clearStudentRetry(
            data.id
        );


        studentRetryCounts.set(
            data.id,
            0
        );


        // =============================================
        // KẾT NỐI
        // =============================================

        connectToStudent(
            data.id
        );

    }
);


// =====================================================
// CONNECT TO STUDENT
// =====================================================

async function connectToStudent(
    studentId,
    isRetry = false
) {

    // =============================================
    // HS KHÔNG CÒN TRONG LỚP
    // =============================================

    if (
        !studentNames.has(
            studentId
        )
    ) {

        return;

    }


    console.log(
        "CONNECT TO STUDENT:",
        studentId,
        isRetry
            ? "RETRY"
            : "FIRST"
    );


    // =============================================
    // DỌN PEER CŨ
    // =============================================

    closeStudentPeer(
        studentId
    );


    clearConnectTimeout(
        studentId
    );


    pendingStudentIce.set(
        studentId,
        []
    );


    // =============================================
    // CREATE PEER
    // =============================================

    const peer =
        new RTCPeerConnection(
            rtcConfig
        );


    studentPeers.set(
        studentId,
        peer
    );


    // =============================================
    // STATUS
    // =============================================

    if (
        isRetry
    ) {

        const retry =
            studentRetryCounts.get(
                studentId
            ) || 1;


        setStudentStatus(
            studentId,
            "🟡 Kết nối lại " +
                retry +
                "/" +
                MAX_RETRIES,
            false
        );

    } else {

        setStudentStatus(
            studentId,
            "🟡 Đang kết nối",
            false
        );

    }


    // =============================================
    // GV CHỈ NHẬN VIDEO
    // =============================================

    peer.addTransceiver(
        "video",
        {
            direction:
                "recvonly"
        }
    );


    // =============================================
    // NHẬN VIDEO HS
    // =============================================

    peer.ontrack =
        event => {

            // Peer cũ
            if (
                studentPeers.get(
                    studentId
                ) !== peer
            ) {

                return;

            }


            console.log(
                "VIDEO RECEIVED:",
                studentId
            );


            const video =
                document.getElementById(
                    "video-" +
                    studentId
                );


            if (
                !video ||
                !event.streams ||
                !event.streams[0]
            ) {

                return;

            }


            video.srcObject =
                event.streams[0];


            video
                .play()
                .catch(
                    error => {

                        console.warn(
                            "VIDEO PLAY ERROR:",
                            studentId,
                            error
                        );

                    }
                );


            clearConnectTimeout(
                studentId
            );


            clearStudentRetry(
                studentId
            );


            studentRetryCounts.set(
                studentId,
                0
            );


            setStudentStatus(
                studentId,
                "🟢 Đang xem",
                true
            );

        };


    // =============================================
    // LOCAL ICE
    // =============================================

    peer.onicecandidate =
        event => {

            if (
                !event.candidate
            ) {

                console.log(
                    "ICE GATHERING COMPLETE:",
                    studentId
                );

                return;

            }


            console.log(
                "TEACHER ICE:",
                studentId,
                event.candidate.type,
                event.candidate.protocol,
                event.candidate.address
            );


            // =========================================
            // DEBUG TURN
            //
            // Khi TURN hoạt động cần thấy:
            //
            // TEACHER ICE: ... relay udp 103.82.26.166
            // =========================================

            if (
                event.candidate.type ===
                "relay"
            ) {

                console.log(
                    "✅ TURN RELAY AVAILABLE:",
                    studentId,
                    event.candidate.address,
                    event.candidate.protocol
                );

            }


            socket.emit(
                "webrtc-ice",
                {

                    target:
                        studentId,

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

    peer.oniceconnectionstatechange =
        () => {

            if (
                studentPeers.get(
                    studentId
                ) !== peer
            ) {

                return;

            }


            console.log(
                "ICE STATE:",
                studentId,
                peer.iceConnectionState
            );


            if (
                peer.iceConnectionState ===
                    "connected" ||
                peer.iceConnectionState ===
                    "completed"
            ) {

                clearConnectTimeout(
                    studentId
                );

            }

        };


    // =============================================
    // CONNECTION STATE
    // =============================================

    peer.onconnectionstatechange =
        () => {

            // =========================================
            // CALLBACK CỦA PEER CŨ
            // =========================================

            if (
                studentPeers.get(
                    studentId
                ) !== peer
            ) {

                return;

            }


            const state =
                peer.connectionState;


            console.log(
                "Student WebRTC:",
                studentId,
                state
            );


            // =========================================
            // CONNECTED
            // =========================================

            if (
                state ===
                "connected"
            ) {

                clearConnectTimeout(
                    studentId
                );


                clearStudentRetry(
                    studentId
                );


                studentRetryCounts.set(
                    studentId,
                    0
                );


                setStudentStatus(
                    studentId,
                    "🟢 Đang xem",
                    true
                );

            }


            // =========================================
            // CONNECTING
            // =========================================

            else if (
                state ===
                "connecting"
            ) {

                setStudentStatus(
                    studentId,
                    "🟡 Đang kết nối",
                    false
                );

            }


            // =========================================
            // DISCONNECTED
            // =========================================

            else if (
                state ===
                "disconnected"
            ) {

                setStudentStatus(
                    studentId,
                    "🟡 Mất kết nối - đang thử lại",
                    false
                );


                scheduleStudentRetry(
                    studentId,
                    3000
                );

            }


            // =========================================
            // FAILED
            // =========================================

            else if (
                state ===
                "failed"
            ) {

                console.warn(
                    "WEBRTC FAILED:",
                    studentId
                );


                setStudentStatus(
                    studentId,
                    "🟡 Kết nối lỗi - đang thử lại",
                    false
                );


                scheduleStudentRetry(
                    studentId,
                    1500
                );

            }


            // =========================================
            // CLOSED
            // =========================================

            else if (
                state ===
                "closed"
            ) {

                clearConnectTimeout(
                    studentId
                );

            }

        };


    // =============================================
    // CREATE OFFER
    // =============================================

    try {

        const offer =
            await peer
                .createOffer({

                    iceRestart:
                        isRetry

                });


        // =========================================
        // PEER ĐÃ BỊ THAY
        // =========================================

        if (
            studentPeers.get(
                studentId
            ) !== peer
        ) {

            return;

        }


        await peer
            .setLocalDescription(
                offer
            );


        // =========================================
        // SEND OFFER
        // =========================================

        socket.emit(
            "webrtc-offer",
            {

                target:
                    studentId,

                type:
                    "student-screen",

                sdp:
                    peer.localDescription

            }
        );


        console.log(
            "OFFER SENT:",
            studentId,
            isRetry
                ? "(ICE RESTART)"
                : ""
        );


        // =========================================
        // CONNECTION TIMEOUT
        //
        // Đây là phần quan trọng:
        //
        // Nếu peer cứ nằm ở checking/connecting
        // mà không chuyển failed,
        // sau 10 giây hệ thống vẫn tự retry.
        // =========================================

        startConnectTimeout(
            studentId,
            peer
        );


    } catch (error) {

        console.error(
            "OFFER ERROR:",
            studentId,
            error
        );


        scheduleStudentRetry(
            studentId,
            1500
        );

    }

}


// =====================================================
// CONNECTION TIMEOUT
// =====================================================

function startConnectTimeout(
    studentId,
    peer
) {

    clearConnectTimeout(
        studentId
    );


    const timer =
        setTimeout(
            () => {

                // =====================================
                // PEER ĐÃ BỊ THAY
                // =====================================

                if (
                    studentPeers.get(
                        studentId
                    ) !== peer
                ) {

                    return;

                }


                const state =
                    peer.connectionState;


                const iceState =
                    peer.iceConnectionState;


                console.warn(
                    "CONNECTION TIMEOUT:",
                    studentId,
                    state,
                    iceState
                );


                // =====================================
                // NẾU VẪN CHƯA CONNECT
                // =====================================

                if (
                    state !==
                        "connected" &&
                    iceState !==
                        "connected" &&
                    iceState !==
                        "completed"
                ) {

                    setStudentStatus(
                        studentId,
                        "🟡 Kết nối chậm - đang thử lại",
                        false
                    );


                    scheduleStudentRetry(
                        studentId,
                        100
                    );

                }

            },
            CONNECT_TIMEOUT
        );


    studentConnectTimeouts.set(
        studentId,
        timer
    );

}


// =====================================================
// CLEAR CONNECTION TIMEOUT
// =====================================================

function clearConnectTimeout(
    studentId
) {

    const timer =
        studentConnectTimeouts.get(
            studentId
        );


    if (
        timer
    ) {

        clearTimeout(
            timer
        );

    }


    studentConnectTimeouts.delete(
        studentId
    );

}


// =====================================================
// RETRY STUDENT
// =====================================================

function scheduleStudentRetry(
    studentId,
    delay = 2000
) {

    // =============================================
    // HS KHÔNG CÒN TRONG LỚP
    // =============================================

    if (
        !studentNames.has(
            studentId
        )
    ) {

        return;

    }


    // =============================================
    // ĐÃ CÓ TIMER RETRY
    // =============================================

    if (
        studentRetryTimers.has(
            studentId
        )
    ) {

        return;

    }


    clearConnectTimeout(
        studentId
    );


    const current =
        studentRetryCounts.get(
            studentId
        ) || 0;


    // =============================================
    // QUÁ SỐ LẦN RETRY
    // =============================================

    if (
        current >=
        MAX_RETRIES
    ) {

        console.error(
            "MAX RETRIES:",
            studentId
        );


        setStudentStatus(
            studentId,
            "🔴 Không nhận được hình",
            false
        );


        return;

    }


    const next =
        current + 1;


    studentRetryCounts.set(
        studentId,
        next
    );


    setStudentStatus(
        studentId,
        "🟡 Kết nối lại " +
            next +
            "/" +
            MAX_RETRIES,
        false
    );


    // =============================================
    // TIMER
    // =============================================

    const timer =
        setTimeout(
            () => {

                studentRetryTimers.delete(
                    studentId
                );


                if (
                    !studentNames.has(
                        studentId
                    )
                ) {

                    return;

                }


                console.log(
                    "RETRY STUDENT:",
                    studentId,
                    next
                );


                connectToStudent(
                    studentId,
                    true
                );

            },
            delay
        );


    studentRetryTimers.set(
        studentId,
        timer
    );

}


// =====================================================
// CLEAR RETRY
// =====================================================

function clearStudentRetry(
    studentId
) {

    const timer =
        studentRetryTimers.get(
            studentId
        );


    if (
        timer
    ) {

        clearTimeout(
            timer
        );

    }


    studentRetryTimers.delete(
        studentId
    );

}


// =====================================================
// GV CHIA SẺ MÀN HÌNH
// =====================================================

shareTeacherButton.addEventListener(
    "click",
    async () => {

        // =============================================
        // ĐANG SHARE -> STOP
        // =============================================

        if (
            teacherStream
        ) {

            stopTeacherShare();

            return;

        }


        try {

            teacherStream =
                await navigator
                    .mediaDevices
                    .getDisplayMedia({

                        video: {

                            width: {
                                ideal:
                                    1280
                            },

                            height: {
                                ideal:
                                    720
                            },

                            frameRate: {
                                ideal:
                                    10,
                                max:
                                    12
                            }

                        },

                        audio:
                            false

                    });


            // =========================================
            // PREVIEW
            // =========================================

            teacherPreview.srcObject =
                teacherStream;


            teacherPreview
                .play()
                .catch(() => {});


            teacherShareBox
                .classList
                .add(
                    "active"
                );


            shareTeacherButton
                .classList
                .add(
                    "active"
                );


            shareTeacherButton.textContent =
                "⏹ Dừng chia sẻ";


            // =========================================
            // BÁO SERVER
            // =========================================

            socket.emit(
                "teacher-share-started"
            );


            // =========================================
            // GỬI CHO TẤT CẢ HS
            // =========================================

            for (
                const studentId
                of studentNames.keys()
            ) {

                await sendTeacherScreen(
                    studentId
                );

            }


            // =========================================
            // GV STOP TỪ CHROME
            // =========================================

            const track =
                teacherStream
                    .getVideoTracks()[0];


            track.addEventListener(
                "ended",
                () => {

                    stopTeacherShare();

                }
            );


        } catch (error) {

            console.error(
                "Teacher share error:",
                error
            );

        }

    }
);


// =====================================================
// SEND TEACHER SCREEN TO STUDENT
// =====================================================

async function sendTeacherScreen(
    studentId
) {

    if (
        !teacherStream
    ) {

        return;

    }


    if (
        !studentNames.has(
            studentId
        )
    ) {

        return;

    }


    // =============================================
    // CLOSE PEER CŨ
    // =============================================

    closeTeacherPeer(
        studentId
    );


    pendingTeacherIce.set(
        studentId,
        []
    );


    // =============================================
    // CREATE PEER
    // =============================================

    const peer =
        new RTCPeerConnection(
            rtcConfig
        );


    teacherPeers.set(
        studentId,
        peer
    );


    // =============================================
    // ADD TRACK
    // =============================================

    teacherStream
        .getTracks()
        .forEach(
            track => {

                peer.addTrack(
                    track,
                    teacherStream
                );

            }
        );


    // =============================================
    // LOCAL ICE
    // =============================================

    peer.onicecandidate =
        event => {

            if (
                !event.candidate
            ) {

                return;

            }


            console.log(
                "GV SHARE ICE:",
                studentId,
                event.candidate.type,
                event.candidate.protocol,
                event.candidate.address
            );


            if (
                event.candidate.type ===
                "relay"
            ) {

                console.log(
                    "✅ GV SHARE TURN RELAY:",
                    studentId,
                    event.candidate.address
                );

            }


            socket.emit(
                "webrtc-ice",
                {

                    target:
                        studentId,

                    type:
                        "teacher-screen",

                    candidate:
                        event.candidate

                }
            );

        };


    // =============================================
    // CONNECTION STATE
    // =============================================

    peer.onconnectionstatechange =
        () => {

            if (
                teacherPeers.get(
                    studentId
                ) !== peer
            ) {

                return;

            }


            console.log(
                "Teacher -> student:",
                studentId,
                peer.connectionState
            );

        };


    // =============================================
    // CREATE OFFER
    // =============================================

    try {

        const offer =
            await peer
                .createOffer();


        if (
            teacherPeers.get(
                studentId
            ) !== peer
        ) {

            return;

        }


        await peer
            .setLocalDescription(
                offer
            );


        socket.emit(
            "webrtc-offer",
            {

                target:
                    studentId,

                type:
                    "teacher-screen",

                sdp:
                    peer.localDescription

            }
        );


        console.log(
            "TEACHER SCREEN OFFER SENT:",
            studentId
        );


    } catch (error) {

        console.error(
            "Teacher screen offer error:",
            studentId,
            error
        );

    }

}


// =====================================================
// NHẬN ANSWER
// =====================================================

socket.on(
    "webrtc-answer",
    async data => {

        let peer =
            null;

        let queueMap =
            null;


        // =============================================
        // HS -> GV
        // =============================================

        if (
            data.type ===
            "student-screen"
        ) {

            peer =
                studentPeers.get(
                    data.from
                );


            queueMap =
                pendingStudentIce;

        }


        // =============================================
        // GV -> HS
        // =============================================

        else if (
            data.type ===
            "teacher-screen"
        ) {

            peer =
                teacherPeers.get(
                    data.from
                );


            queueMap =
                pendingTeacherIce;

        }


        if (
            !peer
        ) {

            console.warn(
                "ANSWER BUT PEER MISSING:",
                data.from,
                data.type
            );


            return;

        }


        try {

            // =========================================
            // SET REMOTE DESCRIPTION
            // =========================================

            await peer
                .setRemoteDescription(
                    data.sdp
                );


            console.log(
                "REMOTE DESCRIPTION SET:",
                data.from,
                data.type
            );


            // =========================================
            // FLUSH ICE QUEUE
            // =========================================

            const candidates =
                queueMap.get(
                    data.from
                ) || [];


            console.log(
                "FLUSH ICE:",
                data.from,
                data.type,
                candidates.length
            );


            for (
                const candidate
                of candidates
            ) {

                try {

                    await peer
                        .addIceCandidate(
                            candidate
                        );


                } catch (error) {

                    console.warn(
                        "QUEUED ICE ERROR:",
                        data.from,
                        error
                    );

                }

            }


            queueMap.set(
                data.from,
                []
            );


        } catch (error) {

            console.error(
                "ANSWER ERROR:",
                data.from,
                data.type,
                error
            );

        }

    }
);


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


        let peer =
            null;

        let queueMap =
            null;


        // =============================================
        // HS -> GV
        // =============================================

        if (
            data.type ===
            "student-screen"
        ) {

            peer =
                studentPeers.get(
                    data.from
                );


            queueMap =
                pendingStudentIce;

        }


        // =============================================
        // GV -> HS
        // =============================================

        else if (
            data.type ===
            "teacher-screen"
        ) {

            peer =
                teacherPeers.get(
                    data.from
                );


            queueMap =
                pendingTeacherIce;

        }


        if (
            !queueMap
        ) {

            return;

        }


        // =============================================
        // PEER CHƯA CÓ HOẶC SDP CHƯA SET
        // =============================================

        if (
            !peer ||
            !peer.remoteDescription
        ) {

            if (
                !queueMap.has(
                    data.from
                )
            ) {

                queueMap.set(
                    data.from,
                    []
                );

            }


            queueMap
                .get(
                    data.from
                )
                .push(
                    data.candidate
                );


            console.log(
                "QUEUE ICE:",
                data.from,
                data.type,
                queueMap.get(
                    data.from
                ).length
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
                data.from,
                data.type,
                error
            );

        }

    }
);


// =====================================================
// STOP TEACHER SHARE
// =====================================================

function stopTeacherShare() {

    // =============================================
    // STOP TRACK
    // =============================================

    if (
        teacherStream
    ) {

        teacherStream
            .getTracks()
            .forEach(
                track => {

                    track.stop();

                }
            );


        teacherStream =
            null;

    }


    // =============================================
    // PREVIEW
    // =============================================

    teacherPreview.srcObject =
        null;


    teacherShareBox
        .classList
        .remove(
            "active"
        );


    shareTeacherButton
        .classList
        .remove(
            "active"
        );


    shareTeacherButton.textContent =
        "🖥 Chia sẻ màn hình";


    // =============================================
    // CLOSE PEERS
    // =============================================

    teacherPeers.forEach(
        peer => {

            try {

                peer.close();

            } catch (_) {}

        }
    );


    teacherPeers.clear();


    pendingTeacherIce.clear();


    // =============================================
    // SERVER
    // =============================================

    socket.emit(
        "teacher-share-stopped"
    );

}


// =====================================================
// HS RỜI LỚP
// =====================================================

socket.on(
    "student-left",
    data => {

        const name =
            data.name ||
            studentNames.get(
                data.id
            ) ||
            "Học sinh";


        console.log(
            "STUDENT LEFT:",
            name,
            data.id
        );


        // =============================================
        // THÔNG BÁO
        // =============================================

        showStudentLeftAlert(
            name
        );


        // =============================================
        // REMOVE
        // =============================================

        removeStudent(
            data.id
        );

    }
);


// =====================================================
// HS DỪNG SHARE
// =====================================================

socket.on(
    "student-screen-stopped",
    data => {

        closeStudentPeer(
            data.id
        );


        clearStudentRetry(
            data.id
        );


        clearConnectTimeout(
            data.id
        );


        studentRetryCounts.set(
            data.id,
            0
        );


        setStudentStatus(
            data.id,
            "🔴 Dừng chia sẻ",
            false
        );

    }
);


// =====================================================
// CREATE STUDENT BOX
// =====================================================

function createStudentBox(
    id,
    name
) {

    // =============================================
    // CARD ĐÃ TỒN TẠI
    // =============================================

    if (
        document.getElementById(
            "student-" + id
        )
    ) {

        return;

    }


    empty.style.display =
        "none";


    const div =
        document.createElement(
            "div"
        );


    div.className =
        "student";


    div.id =
        "student-" + id;


    // =============================================
    // HEADER
    // =============================================

    const title =
        document.createElement(
            "div"
        );


    title.className =
        "student-title";


    const nameBox =
        document.createElement(
            "span"
        );


    nameBox.textContent =
        "👤 " + name;


    const status =
        document.createElement(
            "span"
        );


    status.id =
        "status-" + id;


    status.className =
        "student-status";


    status.textContent =
        "🟡 Đang kết nối";


    title.appendChild(
        nameBox
    );


    title.appendChild(
        status
    );


    // =============================================
    // VIDEO
    // =============================================

    const video =
        document.createElement(
            "video"
        );


    video.id =
        "video-" + id;


    video.autoplay =
        true;


    video.playsInline =
        true;


    video.muted =
        true;


    // =============================================
    // APPEND
    // =============================================

    div.appendChild(
        title
    );


    div.appendChild(
        video
    );


    // =============================================
    // CLICK PHÓNG TO
    // =============================================

    div.addEventListener(
        "click",
        () => {

            div.classList
                .toggle(
                    "expanded"
                );

        }
    );


    studentsBox.appendChild(
        div
    );

}


// =====================================================
// STATUS STUDENT
// =====================================================

function setStudentStatus(
    id,
    text,
    connected
) {

    const card =
        document.getElementById(
            "student-" + id
        );


    const status =
        document.getElementById(
            "status-" + id
        );


    if (
        status
    ) {

        status.textContent =
            text;

    }


    if (
        card
    ) {

        card.classList.toggle(
            "connected",
            connected
        );

    }

}


// =====================================================
// REMOVE STUDENT
// =====================================================

function removeStudent(
    id
) {

    // =============================================
    // CLEAR TIMER
    // =============================================

    clearStudentRetry(
        id
    );


    clearConnectTimeout(
        id
    );


    // =============================================
    // DELETE STATE
    // =============================================

    studentRetryCounts.delete(
        id
    );


    pendingStudentIce.delete(
        id
    );


    pendingTeacherIce.delete(
        id
    );


    // =============================================
    // CLOSE PEERS
    // =============================================

    closeStudentPeer(
        id
    );


    closeTeacherPeer(
        id
    );


    // =============================================
    // DELETE NAME
    // =============================================

    studentNames.delete(
        id
    );


    // =============================================
    // REMOVE CARD
    // =============================================

    const element =
        document.getElementById(
            "student-" + id
        );


    if (
        element
    ) {

        element.remove();

    }


    updateCount();


    if (
        studentNames.size ===
        0
    ) {

        empty.style.display =
            "block";

    }

}


// =====================================================
// CLOSE STUDENT PEER
// =====================================================

function closeStudentPeer(
    id
) {

    const peer =
        studentPeers.get(
            id
        );


    if (
        !peer
    ) {

        return;

    }


    // Xóa khỏi map trước.
    // Callback của peer cũ sẽ không retry nhầm.

    studentPeers.delete(
        id
    );


    try {

        peer.ontrack =
            null;


        peer.onicecandidate =
            null;


        peer.oniceconnectionstatechange =
            null;


        peer.onconnectionstatechange =
            null;


        peer.close();


    } catch (error) {

        console.log(
            "Close student peer:",
            error
        );

    }

}


// =====================================================
// CLOSE TEACHER PEER
// =====================================================

function closeTeacherPeer(
    id
) {

    const peer =
        teacherPeers.get(
            id
        );


    if (
        !peer
    ) {

        return;

    }


    teacherPeers.delete(
        id
    );


    try {

        peer.onicecandidate =
            null;


        peer.onconnectionstatechange =
            null;


        peer.close();


    } catch (error) {

        console.log(
            "Close teacher peer:",
            error
        );

    }

}


// =====================================================
// UPDATE COUNT
// =====================================================

function updateCount() {

    count.textContent =
        studentNames.size +
        " học sinh";

}


// =====================================================
// CẢNH BÁO HS RỜI LỚP
// =====================================================

function showStudentLeftAlert(
    name
) {

    let container =
        document.getElementById(
            "studentAlerts"
        );


    // =============================================
    // FALLBACK
    // =============================================

    if (
        !container
    ) {

        container =
            document.createElement(
                "div"
            );


        container.id =
            "studentAlerts";


        container.style.position =
            "fixed";

        container.style.top =
            "82px";

        container.style.right =
            "18px";

        container.style.width =
            "330px";

        container.style.maxWidth =
            "calc(100vw - 36px)";

        container.style.zIndex =
            "10000";

        container.style.display =
            "flex";

        container.style.flexDirection =
            "column";

        container.style.gap =
            "8px";

        container.style.pointerEvents =
            "none";


        document.body.appendChild(
            container
        );

    }


    // =============================================
    // ALERT BOX
    // =============================================

    const alertBox =
        document.createElement(
            "div"
        );


    alertBox.className =
        "student-alert";


    // =============================================
    // FALLBACK STYLE
    // =============================================

    alertBox.style.padding =
        "13px 15px";

    alertBox.style.color =
        "#ffffff";

    alertBox.style.background =
        "#7f1d1d";

    alertBox.style.border =
        "1px solid #ef4444";

    alertBox.style.borderRadius =
        "10px";

    alertBox.style.boxShadow =
        "0 10px 30px rgba(0,0,0,.45)";

    alertBox.style.transition =
        "all .4s ease";


    // =============================================
    // TITLE
    // =============================================

    const title =
        document.createElement(
            "div"
        );


    title.textContent =
        "⚠️ Học sinh đã rời lớp";


    title.style.fontWeight =
        "700";

    title.style.fontSize =
        "14px";

    title.style.color =
        "#fecaca";

    title.style.marginBottom =
        "5px";


    // =============================================
    // NAME
    // =============================================

    const student =
        document.createElement(
            "div"
        );


    student.textContent =
        name;


    student.style.fontSize =
        "15px";

    student.style.fontWeight =
        "700";

    student.style.marginBottom =
        "3px";


    // =============================================
    // DESCRIPTION
    // =============================================

    const description =
        document.createElement(
            "div"
        );


    description.textContent =
        "Đã đóng tab hoặc mất kết nối.";


    description.style.fontSize =
        "12px";

    description.style.color =
        "#fee2e2";


    // =============================================
    // APPEND
    // =============================================

    alertBox.appendChild(
        title
    );


    alertBox.appendChild(
        student
    );


    alertBox.appendChild(
        description
    );


    container.appendChild(
        alertBox
    );


    // =============================================
    // AUTO REMOVE
    // =============================================

    setTimeout(
        () => {

            alertBox.style.opacity =
                "0";


            alertBox.style.transform =
                "translateX(30px)";


            setTimeout(
                () => {

                    alertBox.remove();

                },
                400
            );

        },
        8000
    );

}


// =====================================================
// KẾT THÚC LỚP
// =====================================================

endClassButton.addEventListener(
    "click",
    () => {

        const ok =
            confirm(
                "Kết thúc lớp học?"
            );


        if (
            !ok
        ) {

            return;

        }


        // =============================================
        // STOP GV SHARE
        // =============================================

        if (
            teacherStream
        ) {

            stopTeacherShare();

        }


        // =============================================
        // CLEAR RETRY
        // =============================================

        studentRetryTimers.forEach(
            timer => {

                clearTimeout(
                    timer
                );

            }
        );


        studentRetryTimers.clear();


        // =============================================
        // CLEAR CONNECT TIMEOUT
        // =============================================

        studentConnectTimeouts.forEach(
            timer => {

                clearTimeout(
                    timer
                );

            }
        );


        studentConnectTimeouts.clear();


        studentRetryCounts.clear();


        pendingStudentIce.clear();

        pendingTeacherIce.clear();


        // =============================================
        // CLOSE STUDENT PEERS
        // =============================================

        studentPeers.forEach(
            peer => {

                try {

                    peer.close();

                } catch (_) {}

            }
        );


        // =============================================
        // CLOSE TEACHER PEERS
        // =============================================

        teacherPeers.forEach(
            peer => {

                try {

                    peer.close();

                } catch (_) {}

            }
        );


        studentPeers.clear();

        teacherPeers.clear();

        studentNames.clear();


        // =============================================
        // CLEAR UI
        // =============================================

        studentsBox.innerHTML =
            "";


        updateCount();


        empty.style.display =
            "block";


        // =============================================
        // SERVER
        // =============================================

        socket.emit(
            "end-class"
        );

    }
);


// =====================================================
// PAGE CLOSE
// =====================================================

window.addEventListener(
    "beforeunload",
    () => {

        // =============================================
        // CLEAR RETRY
        // =============================================

        studentRetryTimers.forEach(
            timer => {

                clearTimeout(
                    timer
                );

            }
        );


        // =============================================
        // CLEAR CONNECTION TIMEOUT
        // =============================================

        studentConnectTimeouts.forEach(
            timer => {

                clearTimeout(
                    timer
                );

            }
        );


        // =============================================
        // CLOSE STUDENT PEERS
        // =============================================

        studentPeers.forEach(
            peer => {

                try {

                    peer.close();

                } catch (_) {}

            }
        );


        // =============================================
        // CLOSE TEACHER PEERS
        // =============================================

        teacherPeers.forEach(
            peer => {

                try {

                    peer.close();

                } catch (_) {}

            }
        );

    }
);