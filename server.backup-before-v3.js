const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

app.use(
    express.static(
        path.join(__dirname, "public")
    )
);

app.get("/api/status", (req, res) => {

    res.json({
        status: "online",
        system: "FPTBN Monitor V2",
        time: new Date().toISOString()
    });

});


// =====================================================
// CLASS STATE
// =====================================================

let teacherId = null;

const students = new Map();


function getStudentList() {

    return Array.from(
        students.entries()
    ).map(
        ([id, student]) => ({

            id,

            name:
                student.name,

            screenReady:
                student.screenReady

        })
    );

}


// =====================================================
// SOCKET.IO
// =====================================================

io.on(
    "connection",
    socket => {

        console.log(
            "Connected:",
            socket.id
        );


        // =============================================
        // TEACHER JOIN
        // =============================================

        socket.on(
            "teacher-join",
            () => {

                socket.data.role =
                    "teacher";

                teacherId =
                    socket.id;

                socket.join(
                    "teacher"
                );


                console.log(
                    "Teacher joined:",
                    socket.id
                );


                socket.emit(
                    "teacher-ready"
                );


                // GV refresh/reconnect:
                // gửi lại toàn bộ HS đang có.

                socket.emit(
                    "student-list",
                    getStudentList()
                );

            }
        );


        // =============================================
        // STUDENT JOIN
        // =============================================

        socket.on(
            "student-join",
            data => {

                const name =
                    data?.name?.trim() ||
                    "Học sinh";


                socket.data.role =
                    "student";

                socket.data.name =
                    name;


                students.set(
                    socket.id,
                    {
                        name,
                        screenReady: false
                    }
                );


                console.log(
                    "Student joined:",
                    name,
                    socket.id
                );


                io.to("teacher").emit(
                    "student-joined",
                    {
                        id:
                            socket.id,

                        name
                    }
                );


                socket.emit(
                    "class-info",
                    {
                        teacherOnline:
                            !!teacherId
                    }
                );

            }
        );


        // =============================================
        // STUDENT SCREEN READY
        // =============================================

        socket.on(
            "screen-ready",
            () => {

                const student =
                    students.get(
                        socket.id
                    );


                if (student) {

                    student.screenReady =
                        true;

                }


                console.log(
                    "Student screen ready:",
                    socket.data.name,
                    socket.id
                );


                io.to("teacher").emit(
                    "student-screen-ready",
                    {
                        id:
                            socket.id,

                        name:
                            socket.data.name ||
                            "Học sinh"
                    }
                );

            }
        );


        // =============================================
        // STUDENT STOPPED SCREEN
        // =============================================

        socket.on(
            "student-screen-stopped",
            () => {

                const student =
                    students.get(
                        socket.id
                    );


                if (student) {

                    student.screenReady =
                        false;

                }


                io.to("teacher").emit(
                    "student-screen-stopped",
                    {
                        id:
                            socket.id,

                        name:
                            socket.data.name ||
                            "Học sinh"
                    }
                );

            }
        );


        // =============================================
        // WEBRTC OFFER
        // =============================================

        socket.on(
            "webrtc-offer",
            data => {

                if (
                    !data ||
                    !data.target
                ) {
                    return;
                }


                console.log(
                    "WEBRTC OFFER:",
                    data.type,
                    socket.id,
                    "->",
                    data.target
                );


                io.to(
                    data.target
                ).emit(
                    "webrtc-offer",
                    {
                        from:
                            socket.id,

                        type:
                            data.type,

                        sdp:
                            data.sdp
                    }
                );

            }
        );


        // =============================================
        // WEBRTC ANSWER
        // =============================================

        socket.on(
            "webrtc-answer",
            data => {

                if (
                    !data ||
                    !data.target
                ) {
                    return;
                }


                console.log(
                    "WEBRTC ANSWER:",
                    data.type,
                    socket.id,
                    "->",
                    data.target
                );


                io.to(
                    data.target
                ).emit(
                    "webrtc-answer",
                    {
                        from:
                            socket.id,

                        type:
                            data.type,

                        sdp:
                            data.sdp
                    }
                );

            }
        );


        // =============================================
        // WEBRTC ICE
        // =============================================

        socket.on(
            "webrtc-ice",
            data => {

                if (
                    !data ||
                    !data.target ||
                    !data.candidate
                ) {
                    return;
                }


                io.to(
                    data.target
                ).emit(
                    "webrtc-ice",
                    {
                        from:
                            socket.id,

                        type:
                            data.type,

                        candidate:
                            data.candidate
                    }
                );

            }
        );


        // =============================================
        // TEACHER START SHARE
        // =============================================

        socket.on(
            "teacher-share-started",
            () => {

                if (
                    socket.id !==
                    teacherId
                ) {
                    return;
                }


                io.emit(
                    "teacher-share-started"
                );

            }
        );


        // =============================================
        // TEACHER STOP SHARE
        // =============================================

        socket.on(
            "teacher-share-stopped",
            () => {

                if (
                    socket.id !==
                    teacherId
                ) {
                    return;
                }


                io.emit(
                    "teacher-share-stopped"
                );

            }
        );


        // =============================================
        // END CLASS
        // =============================================

        socket.on(
            "end-class",
            () => {

                if (
                    socket.id !==
                    teacherId
                ) {
                    return;
                }


                console.log(
                    "Teacher ended class"
                );


                io.emit(
                    "class-ended"
                );


                students.clear();

            }
        );


        // =============================================
        // DISCONNECT
        // =============================================

        socket.on(
            "disconnect",
            reason => {

                console.log(
                    "Disconnected:",
                    socket.id,
                    reason
                );


                // -------------------------------------
                // STUDENT
                // -------------------------------------

                if (
                    socket.data.role ===
                    "student"
                ) {

                    const student =
                        students.get(
                            socket.id
                        );


                    const studentName =
                        student?.name ||
                        socket.data.name ||
                        "Học sinh";


                    students.delete(
                        socket.id
                    );


                    // Gửi cả tên HS về GV
                    // để hiển thị cảnh báo.

                    io.to("teacher").emit(
                        "student-left",
                        {
                            id:
                                socket.id,

                            name:
                                studentName,

                            reason
                        }
                    );


                    console.log(
                        "Student left:",
                        studentName,
                        socket.id
                    );

                }


                // -------------------------------------
                // TEACHER
                // -------------------------------------

                if (
                    socket.id ===
                    teacherId
                ) {

                    teacherId =
                        null;


                    io.emit(
                        "teacher-offline"
                    );


                    console.log(
                        "Teacher offline"
                    );

                }

            }
        );

    }
);


// =====================================================
// SERVER
// =====================================================

server.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            "================================"
        );

        console.log(
            " FPTBN MONITOR V2 FIXED"
        );

        console.log(
            "================================"
        );

        console.log(
            "Server running on port",
            PORT
        );

    }
);