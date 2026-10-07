require("dotenv").config();

const db = require("./config/database");
const express = require("express");
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const XLSX = require("xlsx");
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
// =====================================================
// EXCEL UPLOAD CONFIG
// =====================================================

const excelUpload = multer({
    storage: multer.memoryStorage(),

    limits: {
        fileSize: 10 * 1024 * 1024
    },

    fileFilter: (req, file, cb) => {

        const fileName =
            String(file.originalname || "")
                .toLowerCase();

        const allowed =
            fileName.endsWith(".xlsx") ||
            fileName.endsWith(".xls");

        if (!allowed) {
            return cb(
                new Error(
                    "Chỉ chấp nhận file Excel .xlsx hoặc .xls"
                )
            );
        }

        cb(null, true);
    }
});

// =====================================================
// MIDDLEWARE
// =====================================================

app.use(express.json());

app.use(
    express.static(
        path.join(__dirname, "public")
    )
);


// =====================================================
// SERVER STATUS
// =====================================================

app.get("/api/status", (req, res) => {

    res.json({
        status: "online",
        system: "FPTBN Monitor V3",
        time: new Date().toISOString()
    });

});


// =====================================================
// DATABASE STATUS
// =====================================================

app.get("/api/v3/db-status", async (req, res) => {

    try {

        const [rows] = await db.query(
            `
            SELECT
                DATABASE() AS database_name,
                VERSION() AS database_version
            `
        );

        res.json({

            success: true,

            message:
                "FPTBN Monitor V3 database connected",

            database:
                rows[0].database_name,

            version:
                rows[0].database_version

        });

    } catch (error) {

        console.error(
            "DATABASE ERROR:",
            error
        );

        res.status(500).json({

            success: false,

            message:
                "Database connection failed"

        });

    }

});


// =====================================================
// ADMIN LOGIN
// =====================================================

app.post("/api/admin/login", async (req, res) => {

    try {

        const {
            username,
            password
        } = req.body;


        if (!username || !password) {

            return res.status(400).json({

                success: false,

                message:
                    "Vui lòng nhập tài khoản và mật khẩu"

            });

        }


        const cleanUsername =
            String(username).trim();


        const [rows] =
            await db.query(
                `
                SELECT
                    id,
                    username,
                    full_name,
                    password_hash,
                    is_active

                FROM admins

                WHERE username = ?

                LIMIT 1
                `,
                [
                    cleanUsername
                ]
            );


        if (rows.length === 0) {

            return res.status(401).json({

                success: false,

                message:
                    "Tài khoản không tồn tại"

            });

        }


        const admin =
            rows[0];


        if (
            Number(admin.is_active) !== 1
        ) {

            return res.status(403).json({

                success: false,

                message:
                    "Tài khoản đã bị khóa"

            });

        }


        /*
            TẠM THỜI:
            mật khẩu đang được so sánh trực tiếp.

            Sau khi hoàn thiện V3
            sẽ chuyển sang bcrypt.
        */

        if (
            password !==
            admin.password_hash
        ) {

            return res.status(401).json({

                success: false,

                message:
                    "Mật khẩu không đúng"

            });

        }


        res.json({

            success: true,

            message:
                "Đăng nhập thành công",

            admin: {

                id:
                    admin.id,

                username:
                    admin.username,

                full_name:
                    admin.full_name

            }

        });


    } catch (error) {

        console.error(
            "ADMIN LOGIN ERROR:",
            error
        );


        res.status(500).json({

            success: false,

            message:
                "Lỗi máy chủ"

        });

    }

});

// =====================================================
// ADMIN - PREVIEW STUDENT EXCEL
// Chỉ đọc và kiểm tra file.
// KHÔNG thay đổi database.
// =====================================================

app.post(
    "/api/admin/students/import-preview",
    excelUpload.single("file"),
    async (req, res) => {

        try {

            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    message: "Vui lòng chọn file Excel"
                });
            }

            // ==========================================
            // ĐỌC WORKBOOK
            // ==========================================

            const workbook =
                XLSX.read(
                    req.file.buffer,
                    {
                        type: "buffer"
                    }
                );

            if (
                !workbook.SheetNames ||
                workbook.SheetNames.length === 0
            ) {
                return res.status(400).json({
                    success: false,
                    message: "File Excel không có sheet dữ liệu"
                });
            }

            const sheetName =
                workbook.SheetNames[0];

            const worksheet =
                workbook.Sheets[sheetName];

            const rows =
                XLSX.utils.sheet_to_json(
                    worksheet,
                    {
                        defval: "",
                        raw: false
                    }
                );


            if (rows.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: "Không tìm thấy dữ liệu học sinh trong file"
                });
            }


            // ==========================================
            // TÌM TÊN CỘT
            // ==========================================

            const headers =
                Object.keys(rows[0] || {});


            function normalizeHeader(value) {

                return String(value || "")
                    .trim()
                    .toLowerCase()
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "")
                    .replace(/đ/g, "d")
                    .replace(/\s+/g, " ");

            }


            function findHeader(checkFunction) {

                return headers.find(header =>
                    checkFunction(
                        normalizeHeader(header)
                    )
                );

            }


            // Mã học sinh:
            // MSHS / Mã HS / Mã học sinh

            const studentCodeHeader =
                findHeader(h =>
                    h === "mshs" ||
                    h === "ma hs" ||
                    h === "ma hoc sinh" ||
                    h.includes("ma hoc sinh")
                );


            // Họ và tên

            const fullNameHeader =
                findHeader(h =>
                    h === "ho va ten" ||
                    h.includes("ho va ten")
                );


            // Lớp:
            // Lớp
            // Lớp năm học 2026-2027
            // Lớp năm học 2027-2028 ...

            const classHeader =
                findHeader(h =>
                    h === "lop" ||
                    h.startsWith("lop nam hoc") ||
                    h.includes("lop nam hoc")
                );


            if (
                !studentCodeHeader ||
                !fullNameHeader ||
                !classHeader
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Không nhận diện được đầy đủ các cột Mã HS, Họ và tên và Lớp.",

                    detected_headers:
                        headers,

                    detected: {
                        student_code:
                            studentCodeHeader || null,

                        full_name:
                            fullNameHeader || null,

                        class:
                            classHeader || null
                    }

                });

            }


            // ==========================================
            // PHÂN TÍCH DỮ LIỆU
            // ==========================================

            const students = [];

            const errors = [];

            const codeCount =
                new Map();

            const classSet =
                new Set();


            rows.forEach((row, index) => {

                // +2 vì:
                // dòng 1 = header
                // array bắt đầu từ 0

                const excelRow =
                    index + 2;


                const studentCode =
                    String(
                        row[studentCodeHeader] || ""
                    )
                        .trim()
                        .toUpperCase();


                const fullName =
                    String(
                        row[fullNameHeader] || ""
                    )
                        .trim();


                const classCode =
                    String(
                        row[classHeader] || ""
                    )
                        .trim();


                // Bỏ qua dòng trắng hoàn toàn

                if (
                    !studentCode &&
                    !fullName &&
                    !classCode
                ) {
                    return;
                }


                if (!studentCode) {

                    errors.push({
                        row: excelRow,
                        type: "missing_student_code",
                        message: "Thiếu Mã HS"
                    });

                } else if (
                    !/^FBN\d{5}$/.test(
                        studentCode
                    )
                ) {

                    errors.push({
                        row: excelRow,
                        type: "invalid_student_code",
                        message:
                            "Mã HS phải có dạng FBN + 5 số (ví dụ FBN12345)"
                    });

                }


                if (!fullName) {

                    errors.push({
                        row: excelRow,
                        type: "missing_full_name",
                        message: "Thiếu Họ và tên"
                    });

                }


                if (!classCode) {

                    errors.push({
                        row: excelRow,
                        type: "missing_class",
                        message: "Thiếu lớp"
                    });

                }


                if (studentCode) {

                    codeCount.set(
                        studentCode,
                        (codeCount.get(studentCode) || 0) + 1
                    );

                }


                if (classCode) {
                    classSet.add(classCode);
                }


                students.push({

                    student_code:
                        studentCode,

                    full_name:
                        fullName,

                    class_code:
                        classCode,

                    excel_row:
                        excelRow

                });

            });


            // ==========================================
            // KIỂM TRA MÃ HS TRÙNG
            // ==========================================

            const duplicateCodes = [];

            for (
                const [code, count]
                of codeCount.entries()
            ) {

                if (count > 1) {

                    duplicateCodes.push({
                        student_code: code,
                        count
                    });

                }

            }


            // ==========================================
            // THỐNG KÊ LỖI
            // ==========================================

            const missingStudentCode =
                errors.filter(
                    item =>
                        item.type ===
                        "missing_student_code"
                ).length;


            const invalidStudentCode =
                errors.filter(
                    item =>
                        item.type ===
                        "invalid_student_code"
                ).length;


            const missingFullName =
                errors.filter(
                    item =>
                        item.type ===
                        "missing_full_name"
                ).length;


            const missingClass =
                errors.filter(
                    item =>
                        item.type ===
                        "missing_class"
                ).length;


            const valid =
                errors.length === 0 &&
                duplicateCodes.length === 0;


            // ==========================================
            // TRẢ PREVIEW
            // ==========================================

            res.json({

                success: true,

                valid,

                file: {
                    name:
                        req.file.originalname,

                    size:
                        req.file.size,

                    sheet:
                        sheetName
                },

                columns: {
                    student_code:
                        studentCodeHeader,

                    full_name:
                        fullNameHeader,

                    class:
                        classHeader
                },

                summary: {

                    total_students:
                        students.length,

                    total_classes:
                        classSet.size,

                    missing_student_code:
                        missingStudentCode,

                    invalid_student_code:
                        invalidStudentCode,

                    missing_full_name:
                        missingFullName,

                    missing_class:
                        missingClass,

                    duplicate_student_codes:
                        duplicateCodes.length

                },

                classes:
                    Array.from(classSet)
                        .sort((a, b) =>
                            a.localeCompare(
                                b,
                                "vi",
                                {
                                    numeric: true
                                }
                            )
                        ),

                duplicate_codes:
                    duplicateCodes,

                errors:
                    errors.slice(0, 100),

                // Chỉ gửi 20 HS đầu tiên để xem trước,
                // tránh response quá lớn.

                preview:
                    students.slice(0, 20)

            });


        } catch (error) {

            console.error(
                "STUDENT EXCEL PREVIEW ERROR:",
                error
            );

            res.status(500).json({

                success: false,

                message:
                    "Không thể đọc file Excel",

                error:
                    error.message

            });

        }

    }
);
// =====================================================
// ADMIN - IMPORT / SYNC STUDENT EXCEL
// Đồng bộ Excel vào năm học hiện tại
// =====================================================

app.post(
    "/api/admin/students/import",
    excelUpload.single("file"),
    async (req, res) => {

        let connection;

        try {

            // ==========================================
            // 1. KIỂM TRA FILE
            // ==========================================

            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    message: "Vui lòng chọn file Excel"
                });
            }


            // ==========================================
            // 2. ĐỌC EXCEL
            // ==========================================

            const workbook = XLSX.read(
                req.file.buffer,
                {
                    type: "buffer"
                }
            );


            if (
                !workbook.SheetNames ||
                workbook.SheetNames.length === 0
            ) {
                return res.status(400).json({
                    success: false,
                    message: "File Excel không có sheet dữ liệu"
                });
            }


            const sheetName =
                workbook.SheetNames[0];


            const worksheet =
                workbook.Sheets[sheetName];


            const rows =
                XLSX.utils.sheet_to_json(
                    worksheet,
                    {
                        defval: "",
                        raw: false
                    }
                );


            if (rows.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: "File Excel không có dữ liệu"
                });
            }


            // ==========================================
            // 3. NHẬN DIỆN CỘT
            // ==========================================

            const headers =
                Object.keys(rows[0] || {});


            function normalizeImportHeader(value) {

                return String(value || "")
                    .trim()
                    .toLowerCase()
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "")
                    .replace(/đ/g, "d")
                    .replace(/\s+/g, " ");

            }


            function findImportHeader(checkFunction) {

                return headers.find(header =>
                    checkFunction(
                        normalizeImportHeader(header)
                    )
                );

            }


            const studentCodeHeader =
                findImportHeader(h =>
                    h === "mshs" ||
                    h === "ma hs" ||
                    h === "ma hoc sinh" ||
                    h.includes("ma hoc sinh")
                );


            const fullNameHeader =
                findImportHeader(h =>
                    h === "ho va ten" ||
                    h.includes("ho va ten")
                );


            const classHeader =
                findImportHeader(h =>
                    h === "lop" ||
                    h.startsWith("lop nam hoc") ||
                    h.includes("lop nam hoc")
                );


            if (
                !studentCodeHeader ||
                !fullNameHeader ||
                !classHeader
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Không nhận diện được đầy đủ cột Mã HS, Họ và tên và Lớp"
                });

            }


            // ==========================================
            // 4. CHUẨN HÓA HỌC SINH
            // ==========================================

            const importedStudents = [];

            const studentCodeSet =
                new Set();


            for (
                let index = 0;
                index < rows.length;
                index++
            ) {

                const row =
                    rows[index];


                const excelRow =
                    index + 2;


                const studentCode =
                    String(
                        row[studentCodeHeader] || ""
                    )
                        .trim()
                        .toUpperCase();


                const fullName =
                    String(
                        row[fullNameHeader] || ""
                    )
                        .trim();


                const classCode =
                    String(
                        row[classHeader] || ""
                    )
                        .trim()
                        .toUpperCase();


                // Bỏ dòng trắng hoàn toàn

                if (
                    !studentCode &&
                    !fullName &&
                    !classCode
                ) {
                    continue;
                }


                if (!studentCode) {

                    return res.status(400).json({
                        success: false,
                        message:
                            `Dòng ${excelRow}: thiếu Mã học sinh`
                    });

                }


                if (
                    !/^FBN\d{5}$/.test(
                        studentCode
                    )
                ) {

                    return res.status(400).json({
                        success: false,
                        message:
                            `Dòng ${excelRow}: Mã HS phải có dạng FBN + 5 số`
                    });

                }


                if (!fullName) {

                    return res.status(400).json({
                        success: false,
                        message:
                            `Dòng ${excelRow}: thiếu Họ và tên`
                    });

                }


                if (!classCode) {

                    return res.status(400).json({
                        success: false,
                        message:
                            `Dòng ${excelRow}: thiếu lớp`
                    });

                }


                if (
                    studentCodeSet.has(
                        studentCode
                    )
                ) {

                    return res.status(400).json({
                        success: false,
                        message:
                            `Mã học sinh ${studentCode} bị trùng trong file Excel`
                    });

                }


                studentCodeSet.add(
                    studentCode
                );


                importedStudents.push({
                    student_code:
                        studentCode,

                    full_name:
                        fullName,

                    class_code:
                        classCode
                });

            }


            if (
                importedStudents.length === 0
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Không tìm thấy học sinh hợp lệ"
                });

            }


            // ==========================================
            // 5. BẮT ĐẦU TRANSACTION
            // ==========================================

            connection =
                await db.getConnection();


            await connection.beginTransaction();


            // ==========================================
            // 6. LẤY NĂM HỌC HIỆN TẠI
            // ==========================================

            const [yearRows] =
                await connection.query(
                    `
                    SELECT
                        id,
                        name

                    FROM school_years

                    WHERE is_current = 1

                    LIMIT 1
                    `
                );


            if (yearRows.length === 0) {

                throw new Error(
                    "Chưa thiết lập năm học hiện tại"
                );

            }


            const currentYear =
                yearRows[0];


            // ==========================================
            // 7. TẠO / CẬP NHẬT DANH SÁCH LỚP
            // ==========================================

            const classCodes =
                [
                    ...new Set(
                        importedStudents.map(
                            item =>
                                item.class_code
                        )
                    )
                ];


            const classMap =
                new Map();


            let classesCreated = 0;
            let classesUpdated = 0;


            for (
                const classCode
                of classCodes
            ) {

                // Xác định khối từ đầu mã lớp:
                // 1A1  -> 1
                // 10A1 -> 10
                // 12D3 -> 12
                // Class 1Eng -> null

                const gradeMatch =
                    classCode.match(
                        /^(\d{1,2})/
                    );


                const gradeLevel =
                    gradeMatch
                        ? Number(
                            gradeMatch[1]
                        )
                        : null;


                const [existingClasses] =
                    await connection.query(
                        `
                        SELECT id
                        FROM classes

                        WHERE
                            class_code = ?
                            AND school_year_id = ?

                        LIMIT 1
                        `,
                        [
                            classCode,
                            currentYear.id
                        ]
                    );


                if (
                    existingClasses.length > 0
                ) {

                    const classId =
                        existingClasses[0].id;


                    await connection.query(
                        `
                        UPDATE classes

                        SET
                            class_name = ?,
                            grade_level = ?,
                            is_active = 1

                        WHERE id = ?
                        `,
                        [
                            classCode,
                            gradeLevel,
                            classId
                        ]
                    );


                    classMap.set(
                        classCode,
                        classId
                    );


                    classesUpdated++;

                } else {

                    const [classResult] =
                        await connection.query(
                            `
                            INSERT INTO classes
                            (
                                class_code,
                                class_name,
                                grade_level,
                                school_year_id,
                                is_active
                            )

                            VALUES (?, ?, ?, ?, 1)
                            `,
                            [
                                classCode,
                                classCode,
                                gradeLevel,
                                currentYear.id
                            ]
                        );


                    classMap.set(
                        classCode,
                        classResult.insertId
                    );


                    classesCreated++;

                }

            }


            // ==========================================
            // 8. CÁC LỚP KHÔNG CÒN TRONG EXCEL
            // → KHÔNG XÓA
            // → CHỈ ĐẶT is_active = 0
            // ==========================================

            const [currentClasses] =
                await connection.query(
                    `
                    SELECT
                        id,
                        class_code

                    FROM classes

                    WHERE school_year_id = ?
                    `,
                    [
                        currentYear.id
                    ]
                );


            let classesDeactivated = 0;


            for (
                const currentClass
                of currentClasses
            ) {

                if (
                    !classMap.has(
                        String(
                            currentClass.class_code
                        ).toUpperCase()
                    )
                ) {

                    await connection.query(
                        `
                        UPDATE classes

                        SET is_active = 0

                        WHERE id = ?
                        `,
                        [
                            currentClass.id
                        ]
                    );


                    classesDeactivated++;

                }

            }


            // ==========================================
            // 9. LẤY HS HIỆN CÓ
            // ==========================================

            const [existingStudents] =
                await connection.query(
                    `
                    SELECT
                        id,
                        student_code,
                        full_name

                    FROM students
                    `
                );


            const existingStudentMap =
                new Map();


            for (
                const student
                of existingStudents
            ) {

                existingStudentMap.set(
                    String(
                        student.student_code
                    ).toUpperCase(),
                    student
                );

            }


            // ==========================================
            // 10. ĐỒNG BỘ HỌC SINH
            // ==========================================

            let studentsCreated = 0;
            let studentsUpdated = 0;
            let studentsUnchanged = 0;
            let enrollmentsCreated = 0;
            let enrollmentsUpdated = 0;


            for (
                const item
                of importedStudents
            ) {

                const classId =
                    classMap.get(
                        item.class_code
                    );


                if (!classId) {

                    throw new Error(
                        `Không tìm thấy lớp ${item.class_code}`
                    );

                }


                let studentId;


                const existingStudent =
                    existingStudentMap.get(
                        item.student_code
                    );


                // ======================================
                // HS ĐÃ TỒN TẠI
                // ======================================

                if (existingStudent) {

                    studentId =
                        existingStudent.id;


                    if (
                        String(
                            existingStudent.full_name
                        ).trim()
                        !==
                        item.full_name
                    ) {

                        await connection.query(
                            `
                            UPDATE students

                            SET
                                full_name = ?,
                                is_active = 1

                            WHERE id = ?
                            `,
                            [
                                item.full_name,
                                studentId
                            ]
                        );


                        studentsUpdated++;

                    } else {

                        // Nếu HS từng bị khóa do dữ liệu cũ,
                        // file chính thức đưa HS trở lại hoạt động.

                        await connection.query(
                            `
                            UPDATE students

                            SET is_active = 1

                            WHERE id = ?
                            `,
                            [
                                studentId
                            ]
                        );


                        studentsUnchanged++;

                    }

                }

                // ======================================
                // HS MỚI
                // ======================================

                else {

                    const [studentResult] =
                        await connection.query(
                            `
                            INSERT INTO students
                            (
                                student_code,
                                full_name,
                                password_hash,
                                is_active
                            )

                            VALUES (?, ?, ?, 1)
                            `,
                            [
                                item.student_code,
                                item.full_name,

                                // Mật khẩu mặc định hiện tại
                                // = Mã học sinh

                                item.student_code
                            ]
                        );


                    studentId =
                        studentResult.insertId;


                    existingStudentMap.set(
                        item.student_code,
                        {
                            id:
                                studentId,

                            student_code:
                                item.student_code,

                            full_name:
                                item.full_name
                        }
                    );


                    studentsCreated++;

                }


                // ======================================
                // 11. TÌM ENROLLMENT NĂM HIỆN TẠI
                // ======================================

                const [enrollmentRows] =
                    await connection.query(
                        `
                        SELECT
                            se.id,
                            se.class_id

                        FROM student_enrollments se

                        JOIN classes c
                            ON c.id = se.class_id

                        WHERE
                            se.student_id = ?
                            AND c.school_year_id = ?

                        LIMIT 1
                        `,
                        [
                            studentId,
                            currentYear.id
                        ]
                    );


                // ======================================
                // ĐÃ CÓ ENROLLMENT
                // ======================================

                if (
                    enrollmentRows.length > 0
                ) {

                    if (
                        Number(
                            enrollmentRows[0].class_id
                        )
                        !==
                        Number(classId)
                    ) {

                        await connection.query(
                            `
                            UPDATE student_enrollments

                            SET class_id = ?

                            WHERE id = ?
                            `,
                            [
                                classId,
                                enrollmentRows[0].id
                            ]
                        );


                        enrollmentsUpdated++;

                    }

                }

                // ======================================
                // CHƯA CÓ ENROLLMENT
                // ======================================

                else {

                    await connection.query(
                        `
                        INSERT INTO student_enrollments
                        (
                            student_id,
                            class_id
                        )

                        VALUES (?, ?)
                        `,
                        [
                            studentId,
                            classId
                        ]
                    );


                    enrollmentsCreated++;

                }

            }


            // ==========================================
            // 12. HS KHÔNG CÒN TRONG FILE NĂM HIỆN TẠI
            //
            // KHÔNG XÓA student.
            // KHÔNG XÓA lịch sử.
            //
            // Chỉ bỏ enrollment của năm hiện tại.
            // ==========================================

            const [currentEnrollments] =
                await connection.query(
                    `
                    SELECT
                        se.id,
                        s.student_code

                    FROM student_enrollments se

                    JOIN students s
                        ON s.id = se.student_id

                    JOIN classes c
                        ON c.id = se.class_id

                    WHERE
                        c.school_year_id = ?
                    `,
                    [
                        currentYear.id
                    ]
                );


            let enrollmentsRemoved = 0;


            for (
                const enrollment
                of currentEnrollments
            ) {

                const code =
                    String(
                        enrollment.student_code
                    )
                        .trim()
                        .toUpperCase();


                if (
                    !studentCodeSet.has(code)
                ) {

                    await connection.query(
                        `
                        DELETE FROM student_enrollments

                        WHERE id = ?
                        `,
                        [
                            enrollment.id
                        ]
                    );


                    enrollmentsRemoved++;

                }

            }


            // ==========================================
            // 13. COMMIT
            // ==========================================

            await connection.commit();


            // ==========================================
            // 14. TRẢ KẾT QUẢ
            // ==========================================

            res.json({

                success: true,

                message:
                    "Cập nhật danh sách toàn trường thành công",

                school_year: {
                    id:
                        currentYear.id,

                    name:
                        currentYear.name
                },

                summary: {

                    total_students:
                        importedStudents.length,

                    total_classes:
                        classCodes.length,

                    students_created:
                        studentsCreated,

                    students_updated:
                        studentsUpdated,

                    students_unchanged:
                        studentsUnchanged,

                    enrollments_created:
                        enrollmentsCreated,

                    enrollments_updated:
                        enrollmentsUpdated,

                    enrollments_removed:
                        enrollmentsRemoved,

                    classes_created:
                        classesCreated,

                    classes_updated:
                        classesUpdated,

                    classes_deactivated:
                        classesDeactivated

                }

            });


        } catch (error) {

            // ==========================================
            // ROLLBACK
            // ==========================================

            if (connection) {

                try {

                    await connection.rollback();

                } catch (_) {}

            }


            console.error(
                "IMPORT STUDENT EXCEL ERROR:",
                error
            );


            res.status(500).json({

                success: false,

                message:
                    "Không thể cập nhật danh sách toàn trường",

                error:
                    error.message

            });


        } finally {

            if (connection) {
                connection.release();
            }

        }

    }
);
// =====================================================
// ADMIN - GET STUDENTS + CURRENT CLASS
// =====================================================

app.get("/api/admin/students", async (req, res) => {

    try {

        const [rows] = await db.query(`
            SELECT
                s.id,
                s.student_code,
                s.full_name,
                s.is_active,
                s.created_at,
                s.updated_at,

                c.id AS class_id,
                c.class_code,
                c.class_name,
                c.grade_level,

                sy.id AS school_year_id,
                sy.name AS school_year_name

            FROM students s

            LEFT JOIN student_enrollments se
                ON se.student_id = s.id

            LEFT JOIN classes c
                ON c.id = se.class_id

            LEFT JOIN school_years sy
                ON sy.id = c.school_year_id
                AND sy.is_current = 1

            WHERE
                sy.is_current = 1

            ORDER BY
                c.grade_level ASC,
                c.class_code ASC,
                s.full_name ASC
        `);

        res.json({
            success: true,
            total: rows.length,
            students: rows
        });

    } catch (error) {

        console.error(
            "GET STUDENTS ERROR:",
            error
        );

        res.status(500).json({
            success: false,
            message:
                "Không thể lấy danh sách học sinh"
        });

    }

});


// =====================================================
// ADMIN - ADD STUDENT + ENROLL CLASS
// =====================================================

app.post("/api/admin/students", async (req, res) => {

    let connection;

    try {

        const studentCode =
            String(req.body.student_code || "")
                .trim()
                .toUpperCase();

        const fullName =
            String(req.body.full_name || "")
                .trim();

        const classId =
            Number(req.body.class_id);


        // ===============================
        // VALIDATE
        // ===============================

        if (!studentCode) {
            return res.status(400).json({
                success: false,
                message: "Vui lòng nhập Mã học sinh"
            });
        }

        if (!fullName) {
            return res.status(400).json({
                success: false,
                message: "Vui lòng nhập Họ và tên"
            });
        }

        if (
            !Number.isInteger(classId) ||
            classId <= 0
        ) {
            return res.status(400).json({
                success: false,
                message: "Vui lòng chọn lớp"
            });
        }


        connection =
            await db.getConnection();

        await connection.beginTransaction();


        // ===============================
        // CHECK STUDENT CODE
        // ===============================

        const [existingStudents] =
            await connection.query(
                `
                SELECT id
                FROM students
                WHERE student_code = ?
                LIMIT 1
                `,
                [studentCode]
            );

        if (existingStudents.length > 0) {

            await connection.rollback();

            return res.status(409).json({
                success: false,
                message: "Mã học sinh đã tồn tại"
            });
        }


        // ===============================
        // CHECK CLASS
        // Chỉ cho phép lớp thuộc năm hiện tại
        // ===============================

        const [classRows] =
            await connection.query(
                `
                SELECT
                    c.id,
                    c.class_code,
                    c.class_name
                FROM classes c
                JOIN school_years sy
                    ON sy.id = c.school_year_id
                WHERE
                    c.id = ?
                    AND c.is_active = 1
                    AND sy.is_current = 1
                LIMIT 1
                `,
                [classId]
            );

        if (classRows.length === 0) {

            await connection.rollback();

            return res.status(400).json({
                success: false,
                message:
                    "Lớp không tồn tại hoặc không thuộc năm học hiện tại"
            });
        }


        // ===============================
        // CREATE STUDENT
        // ===============================

        const [studentResult] =
            await connection.query(
                `
                INSERT INTO students
                (
                    student_code,
                    full_name,
                    password_hash,
                    is_active
                )
                VALUES (?, ?, ?, 1)
                `,
                [
                    studentCode,
                    fullName,

                    // Tạm thời giữ cách hiện tại:
                    // mật khẩu mặc định = Mã HS
                    studentCode
                ]
            );


        const studentId =
            studentResult.insertId;


        // ===============================
        // ENROLL STUDENT
        // ===============================

        await connection.query(
            `
            INSERT INTO student_enrollments
            (
                student_id,
                class_id
            )
            VALUES (?, ?)
            `,
            [
                studentId,
                classId
            ]
        );


        // ===============================
        // COMMIT
        // ===============================

        await connection.commit();


        res.status(201).json({
            success: true,

            message:
                "Đã thêm học sinh và xếp lớp thành công",

            student: {
                id: studentId,
                student_code: studentCode,
                full_name: fullName,
                class_id: classId,
                class_code:
                    classRows[0].class_code
            }
        });


    } catch (error) {

        if (connection) {

            try {
                await connection.rollback();
            } catch (_) {}

        }

        console.error(
            "ADD STUDENT ERROR:",
            error
        );

        res.status(500).json({
            success: false,
            message:
                "Không thể thêm học sinh"
        });


    } finally {

        if (connection) {
            connection.release();
        }

    }

});

// =====================================================
// ADMIN - UPDATE STUDENT + CURRENT CLASS
// =====================================================

app.post("/api/admin/students/:id/update", async (req, res) => {

    let connection;

    try {

        // =============================================
        // LẤY DỮ LIỆU
        // =============================================

        const id =
            Number(req.params.id);

        const studentCode =
            String(req.body.student_code || "")
                .trim()
                .toUpperCase();

        const fullName =
            String(req.body.full_name || "")
                .trim();

        const classId =
            Number(req.body.class_id);


        // =============================================
        // VALIDATE ID
        // =============================================

        if (
            !Number.isInteger(id) ||
            id <= 0
        ) {

            return res.status(400).json({
                success: false,
                message: "ID học sinh không hợp lệ"
            });

        }


        // =============================================
        // VALIDATE MÃ HS
        // =============================================

        if (!studentCode) {

            return res.status(400).json({
                success: false,
                message: "Vui lòng nhập Mã học sinh"
            });

        }


        // =============================================
        // VALIDATE HỌ TÊN
        // =============================================

        if (!fullName) {

            return res.status(400).json({
                success: false,
                message: "Vui lòng nhập Họ và tên"
            });

        }


        // =============================================
        // VALIDATE LỚP
        // =============================================

        if (
            !Number.isInteger(classId) ||
            classId <= 0
        ) {

            return res.status(400).json({
                success: false,
                message: "Vui lòng chọn lớp"
            });

        }


        // =============================================
        // BẮT ĐẦU TRANSACTION
        // =============================================

        connection =
            await db.getConnection();

        await connection.beginTransaction();


        // =============================================
        // KIỂM TRA HỌC SINH CÓ TỒN TẠI
        // =============================================

        const [studentRows] =
            await connection.query(
                `
                SELECT
                    id,
                    student_code,
                    full_name
                FROM students
                WHERE id = ?
                LIMIT 1
                `,
                [id]
            );


        if (studentRows.length === 0) {

            await connection.rollback();

            return res.status(404).json({
                success: false,
                message: "Không tìm thấy học sinh"
            });

        }


        // =============================================
        // KIỂM TRA MÃ HS CÓ TRÙNG HS KHÁC KHÔNG
        // =============================================

        const [duplicateRows] =
            await connection.query(
                `
                SELECT id
                FROM students
                WHERE
                    student_code = ?
                    AND id <> ?
                LIMIT 1
                `,
                [
                    studentCode,
                    id
                ]
            );


        if (duplicateRows.length > 0) {

            await connection.rollback();

            return res.status(409).json({
                success: false,
                message:
                    "Mã học sinh đã được sử dụng bởi học sinh khác"
            });

        }


        // =============================================
        // KIỂM TRA LỚP
        //
        // Chỉ cho phép chuyển HS vào lớp:
        // - đang hoạt động
        // - thuộc năm học hiện tại
        // =============================================

        const [classRows] =
            await connection.query(
                `
                SELECT
                    c.id,
                    c.class_code,
                    c.class_name,
                    c.grade_level,
                    c.school_year_id,
                    sy.name AS school_year_name
                FROM classes c
                JOIN school_years sy
                    ON sy.id = c.school_year_id
                WHERE
                    c.id = ?
                    AND c.is_active = 1
                    AND sy.is_current = 1
                LIMIT 1
                `,
                [classId]
            );


        if (classRows.length === 0) {

            await connection.rollback();

            return res.status(400).json({
                success: false,
                message:
                    "Lớp không tồn tại hoặc không thuộc năm học hiện tại"
            });

        }


        // =============================================
        // CẬP NHẬT THÔNG TIN HỌC SINH
        // =============================================

        await connection.query(
            `
            UPDATE students
            SET
                student_code = ?,
                full_name = ?
            WHERE id = ?
            `,
            [
                studentCode,
                fullName,
                id
            ]
        );


        // =============================================
        // TÌM ENROLLMENT CỦA NĂM HỌC HIỆN TẠI
        //
        // QUAN TRỌNG:
        // Không update enrollment của năm học cũ.
        // =============================================

        const [enrollmentRows] =
            await connection.query(
                `
                SELECT
                    se.id,
                    se.class_id
                FROM student_enrollments se

                JOIN classes c
                    ON c.id = se.class_id

                JOIN school_years sy
                    ON sy.id = c.school_year_id

                WHERE
                    se.student_id = ?
                    AND sy.is_current = 1

                LIMIT 1
                `,
                [id]
            );


        // =============================================
        // NẾU HS ĐÃ CÓ LỚP TRONG NĂM HIỆN TẠI
        // → UPDATE
        // =============================================

        if (enrollmentRows.length > 0) {

            const enrollmentId =
                enrollmentRows[0].id;

            const oldClassId =
                Number(
                    enrollmentRows[0].class_id
                );


            // Chỉ update nếu lớp thực sự thay đổi
            if (oldClassId !== classId) {

                await connection.query(
                    `
                    UPDATE student_enrollments
                    SET class_id = ?
                    WHERE id = ?
                    `,
                    [
                        classId,
                        enrollmentId
                    ]
                );

            }

        }

        // =============================================
        // NẾU CHƯA CÓ LỚP TRONG NĂM HIỆN TẠI
        // → INSERT ENROLLMENT MỚI
        // =============================================

        else {

            await connection.query(
                `
                INSERT INTO student_enrollments
                (
                    student_id,
                    class_id
                )
                VALUES (?, ?)
                `,
                [
                    id,
                    classId
                ]
            );

        }


        // =============================================
        // COMMIT
        // =============================================

        await connection.commit();


        // =============================================
        // TRẢ KẾT QUẢ
        // =============================================

        res.json({

            success: true,

            message:
                "Cập nhật học sinh thành công",

            student: {

                id,

                student_code:
                    studentCode,

                full_name:
                    fullName,

                class_id:
                    classRows[0].id,

                class_code:
                    classRows[0].class_code,

                class_name:
                    classRows[0].class_name,

                grade_level:
                    classRows[0].grade_level,

                school_year_id:
                    classRows[0].school_year_id,

                school_year_name:
                    classRows[0].school_year_name

            }

        });


    } catch (error) {

        // =============================================
        // ROLLBACK NẾU CÓ LỖI
        // =============================================

        if (connection) {

            try {

                await connection.rollback();

            } catch (_) {}

        }


        console.error(
            "UPDATE STUDENT ERROR:",
            error
        );


        res.status(500).json({

            success: false,

            message:
                "Không thể cập nhật học sinh"

        });


    } finally {

        // =============================================
        // TRẢ CONNECTION VỀ POOL
        // =============================================

        if (connection) {

            connection.release();

        }

    }

});


// =====================================================
// ADMIN - LOCK / UNLOCK STUDENT
// =====================================================

app.patch(
    "/api/admin/students/:id/status",
    async (req, res) => {

        try {

            const id =
                Number(
                    req.params.id
                );


            const {
                is_active
            } = req.body;


            if (
                !Number.isInteger(id) ||
                id <= 0
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "ID học sinh không hợp lệ"

                });

            }


            const newStatus =
                Number(
                    is_active
                );


            if (
                ![0, 1].includes(
                    newStatus
                )
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Trạng thái học sinh không hợp lệ"

                });

            }


            const [result] =
                await db.query(
                    `
                    UPDATE students

                    SET is_active = ?

                    WHERE id = ?
                    `,
                    [
                        newStatus,
                        id
                    ]
                );


            if (
                result.affectedRows === 0
            ) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Không tìm thấy học sinh"

                });

            }


            res.json({

                success: true,

                message:
                    newStatus === 1
                        ? "Đã mở khóa học sinh"
                        : "Đã khóa học sinh",

                id,

                is_active:
                    newStatus

            });


        } catch (error) {

            console.error(
                "STUDENT STATUS ERROR:",
                error
            );


            res.status(500).json({

                success: false,

                message:
                    "Không thể thay đổi trạng thái học sinh"

            });

        }

    }
);


// =====================================================
// ADMIN - RESET STUDENT PASSWORD
// =====================================================

app.post(
    "/api/admin/students/:id/reset-password",
    async (req, res) => {

        try {

            const id =
                Number(
                    req.params.id
                );


            if (
                !Number.isInteger(id) ||
                id <= 0
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "ID học sinh không hợp lệ"

                });

            }


            const [rows] =
                await db.query(
                    `
                    SELECT
                        student_code

                    FROM students

                    WHERE id = ?

                    LIMIT 1
                    `,
                    [
                        id
                    ]
                );


            if (
                rows.length === 0
            ) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Không tìm thấy học sinh"

                });

            }


            const studentCode =
                rows[0].student_code;


            /*
                Mật khẩu mặc định
                tạm thời = Mã HS.

                Sau này chuyển bcrypt.
            */

            await db.query(
                `
                UPDATE students

                SET password_hash = ?

                WHERE id = ?
                `,
                [
                    studentCode,
                    id
                ]
            );


            res.json({

                success: true,

                message:
                    "Đã đặt lại mật khẩu về Mã học sinh",

                student_code:
                    studentCode

            });


        } catch (error) {

            console.error(
                "RESET STUDENT PASSWORD ERROR:",
                error
            );


            res.status(500).json({

                success: false,

                message:
                    "Không thể đặt lại mật khẩu học sinh"

            });

        }

    }
);


// =====================================================
// API V3 COMPATIBILITY
// =====================================================

app.get(
    "/api/v3/admin/students",
    async (req, res) => {

        try {

            const [rows] =
                await db.query(
                    `
                    SELECT
                        id,
                        student_code,
                        full_name,
                        is_active,
                        created_at,
                        updated_at

                    FROM students

                    ORDER BY
                        full_name ASC
                    `
                );


            res.json({

                success: true,

                total:
                    rows.length,

                students:
                    rows

            });


        } catch (error) {

            console.error(
                "GET V3 STUDENTS ERROR:",
                error
            );


            res.status(500).json({

                success: false,

                message:
                    "Không thể lấy danh sách học sinh"

            });

        }

    }
);
// =====================================================
// ADMIN - IMPORT / SYNC TEACHERS FROM EXCEL
// File chuẩn: MSNV | Họ và tên | Email
// Email FE là định danh đăng nhập giáo viên.
// =====================================================

app.post(
    "/api/admin/teachers/import",
    excelUpload.single("file"),
    async (req, res) => {

        let connection;

        try {

            if (!req.file) {

                return res.status(400).json({
                    success: false,
                    message: "Vui lòng chọn file Excel giáo viên"
                });

            }


            const workbook =
                XLSX.read(
                    req.file.buffer,
                    { type: "buffer" }
                );


            const sheetName =
                workbook.SheetNames?.[0];


            if (!sheetName) {

                return res.status(400).json({
                    success: false,
                    message: "File Excel không có sheet dữ liệu"
                });

            }


            const rows =
                XLSX.utils.sheet_to_json(
                    workbook.Sheets[sheetName],
                    {
                        defval: "",
                        raw: false
                    }
                );


            if (!rows.length) {

                return res.status(400).json({
                    success: false,
                    message: "File Excel không có dữ liệu giáo viên"
                });

            }


            const normalizeHeader =
                value =>
                    String(value || "")
                        .trim()
                        .toLowerCase()
                        .normalize("NFD")
                        .replace(/[\u0300-\u036f]/g, "")
                        .replace(/đ/g, "d")
                        .replace(/\s+/g, " ");


            const headers =
                Object.keys(rows[0] || {});


            const nameHeader =
                headers.find(
                    header => {
                        const h =
                            normalizeHeader(header);

                        return (
                            h === "ho va ten" ||
                            h.includes("ho va ten")
                        );
                    }
                );


            const emailHeader =
                headers.find(
                    header =>
                        normalizeHeader(header) ===
                        "email"
                );


            if (!nameHeader || !emailHeader) {

                return res.status(400).json({
                    success: false,
                    message:
                        "File cần có cột Họ và tên và Email"
                });

            }


            const teachers = [];

            const errors = [];

            const seenEmails =
                new Set();


            rows.forEach(
                (row, index) => {

                    const fullName =
                        String(
                            row[nameHeader] || ""
                        ).trim();


                    const email =
                        String(
                            row[emailHeader] || ""
                        )
                        .trim()
                        .toLowerCase();


                    if (!fullName && !email) {
                        return;
                    }


                    if (
                        !/^[^\s@]+@fe\.edu\.vn$/i.test(
                            email
                        )
                    ) {

                        errors.push({
                            row: index + 2,
                            message:
                                "Email FE không hợp lệ: " +
                                email
                        });

                        return;

                    }


                    if (seenEmails.has(email)) {

                        errors.push({
                            row: index + 2,
                            message:
                                "Email bị trùng trong file: " +
                                email
                        });

                        return;

                    }


                    if (!fullName) {

                        errors.push({
                            row: index + 2,
                            message:
                                "Thiếu họ và tên giáo viên"
                        });

                        return;

                    }


                    seenEmails.add(email);


                    teachers.push({
                        email,
                        full_name: fullName
                    });

                }
            );


            if (!teachers.length) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Không có giáo viên hợp lệ để import",
                    errors
                });

            }


            connection =
                await db.getConnection();


            await connection.beginTransaction();


            let added = 0;

            let updated = 0;


            for (const teacher of teachers) {

                const [existing] =
                    await connection.query(
                        `
                        SELECT id
                        FROM teachers
                        WHERE LOWER(email) = ?
                        LIMIT 1
                        `,
                        [teacher.email]
                    );


                if (existing.length) {

                    await connection.query(
                        `
                        UPDATE teachers
                        SET
                            full_name = ?,
                            email = ?,
                            is_active = 1
                        WHERE id = ?
                        `,
                        [
                            teacher.full_name,
                            teacher.email,
                            existing[0].id
                        ]
                    );


                    updated += 1;

                } else {

                    await connection.query(
                        `
                        INSERT INTO teachers
                        (
                            email,
                            full_name,
                            password_hash,
                            is_active
                        )
                        VALUES (?, ?, ?, 1)
                        `,
                        [
                            teacher.email,
                            teacher.full_name,
                            "123456"
                        ]
                    );


                    added += 1;

                }

            }


            await connection.commit();


            res.json({
                success: true,
                message:
                    "Đồng bộ danh sách giáo viên thành công",
                total_valid: teachers.length,
                added,
                updated,
                skipped: errors.length,
                errors: errors.slice(0, 50)
            });


        } catch (error) {

            if (connection) {

                try {
                    await connection.rollback();
                } catch (_) {}

            }


            console.error(
                "IMPORT TEACHERS ERROR:",
                error
            );


            res.status(500).json({
                success: false,
                message:
                    "Không thể import danh sách giáo viên",
                error: error.message
            });


        } finally {

            if (connection) {
                connection.release();
            }

        }

    }
);


// =====================================================
// ADMIN - GET TEACHERS
// =====================================================

app.get("/api/admin/teachers", async (req, res) => {

    try {

        const [rows] = await db.query(`
            SELECT
                id,
                email,
                full_name,
                is_active,
                created_at,
                updated_at
            FROM teachers
            ORDER BY full_name ASC
        `);

        res.json({
            success: true,
            total: rows.length,
            teachers: rows
        });

    } catch (error) {

        console.error(
            "GET TEACHERS ERROR:",
            error
        );

        res.status(500).json({
            success: false,
            message:
                "Không thể lấy danh sách giáo viên"
        });

    }

});


// =====================================================
// ADMIN - ADD TEACHER
// =====================================================

app.post("/api/admin/teachers", async (req, res) => {

    try {

        const {
            email,
            full_name
        } = req.body;


        if (!email || !full_name) {

            return res.status(400).json({
                success: false,
                message:
                    "Vui lòng nhập email và họ tên giáo viên"
            });

        }


        const cleanEmail =
            String(email)
                .trim()
                .toLowerCase();


        const cleanName =
            String(full_name)
                .trim();


        if (
            !/^[^\\s@]+@fe\\.edu\\.vn$/i.test(
                cleanEmail
            )
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "Giáo viên phải sử dụng email @fe.edu.vn"
            });

        }


        const [existing] = await db.query(
            `
            SELECT id
            FROM teachers
            WHERE email = ?
            LIMIT 1
            `,
            [cleanEmail]
        );


        if (existing.length > 0) {

            return res.status(409).json({
                success: false,
                message:
                    "Email giáo viên đã tồn tại"
            });

        }


        // Mật khẩu mặc định tạm thời:
        // 123456
        //
        // Sau này sẽ chuyển sang bcrypt.

        const defaultPassword =
            "123456";


        const [result] = await db.query(
            `
            INSERT INTO teachers
            (
                email,
                full_name,
                password_hash,
                is_active
            )
            VALUES (?, ?, ?, 1)
            `,
            [
                cleanEmail,
                cleanName,
                defaultPassword
            ]
        );


        res.status(201).json({

            success: true,

            message:
                "Thêm giáo viên thành công",

            teacher: {

                id:
                    result.insertId,

                email:
                    cleanEmail,

                full_name:
                    cleanName,

                is_active:
                    1

            }

        });


    } catch (error) {

        console.error(
            "ADD TEACHER ERROR:",
            error
        );

        res.status(500).json({
            success: false,
            message:
                "Không thể thêm giáo viên"
        });

    }

});


// =====================================================
// ADMIN - UPDATE TEACHER (POST)
// LiteSpeed hosting chặn PUT ở một số cấu hình.
// =====================================================

app.post(
    "/api/admin/teachers/:id/update",
    async (req, res) => {

        try {

            const id =
                Number(req.params.id);


            const cleanEmail =
                String(req.body.email || "")
                    .trim()
                    .toLowerCase();


            const cleanName =
                String(req.body.full_name || "")
                    .trim();


            if (
                !Number.isInteger(id) ||
                id <= 0
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "ID giáo viên không hợp lệ"
                });

            }


            if (
                !cleanName ||
                !/^[^\s@]+@fe\.edu\.vn$/i.test(
                    cleanEmail
                )
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Vui lòng nhập họ tên và email @fe.edu.vn hợp lệ"
                });

            }


            const [duplicate] =
                await db.query(
                    `
                    SELECT id
                    FROM teachers
                    WHERE
                        LOWER(email) = ?
                        AND id <> ?
                    LIMIT 1
                    `,
                    [
                        cleanEmail,
                        id
                    ]
                );


            if (duplicate.length) {

                return res.status(409).json({
                    success: false,
                    message:
                        "Email giáo viên đã được sử dụng"
                });

            }


            const [result] =
                await db.query(
                    `
                    UPDATE teachers
                    SET
                        email = ?,
                        full_name = ?
                    WHERE id = ?
                    `,
                    [
                        cleanEmail,
                        cleanName,
                        id
                    ]
                );


            if (!result.affectedRows) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Không tìm thấy giáo viên"
                });

            }


            res.json({
                success: true,
                message:
                    "Cập nhật giáo viên thành công"
            });


        } catch (error) {

            console.error(
                "UPDATE TEACHER POST ERROR:",
                error
            );


            res.status(500).json({
                success: false,
                message:
                    "Không thể cập nhật giáo viên"
            });

        }

    }
);


// =====================================================
// ADMIN - UPDATE TEACHER
// =====================================================

app.put("/api/admin/teachers/:id", async (req, res) => {

    try {

        const id =
            Number(req.params.id);

        const {
            email,
            full_name
        } = req.body;


        if (
            !Number.isInteger(id) ||
            id <= 0
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "ID giáo viên không hợp lệ"
            });

        }


        if (!email || !full_name) {

            return res.status(400).json({
                success: false,
                message:
                    "Vui lòng nhập email và họ tên giáo viên"
            });

        }


        const cleanEmail =
            String(email)
                .trim()
                .toLowerCase();

        const cleanName =
            String(full_name)
                .trim();


        const [teacherRows] =
            await db.query(
                `
                SELECT id
                FROM teachers
                WHERE id = ?
                LIMIT 1
                `,
                [id]
            );


        if (teacherRows.length === 0) {

            return res.status(404).json({
                success: false,
                message:
                    "Không tìm thấy giáo viên"
            });

        }


        const [duplicateRows] =
            await db.query(
                `
                SELECT id
                FROM teachers
                WHERE
                    email = ?
                    AND id <> ?
                LIMIT 1
                `,
                [
                    cleanEmail,
                    id
                ]
            );


        if (duplicateRows.length > 0) {

            return res.status(409).json({
                success: false,
                message:
                    "Email đã được sử dụng bởi giáo viên khác"
            });

        }


        await db.query(
            `
            UPDATE teachers
            SET
                email = ?,
                full_name = ?
            WHERE id = ?
            `,
            [
                cleanEmail,
                cleanName,
                id
            ]
        );


        res.json({

            success: true,

            message:
                "Cập nhật giáo viên thành công",

            teacher: {
                id,
                email:
                    cleanEmail,
                full_name:
                    cleanName
            }

        });


    } catch (error) {

        console.error(
            "UPDATE TEACHER ERROR:",
            error
        );

        res.status(500).json({
            success: false,
            message:
                "Không thể cập nhật giáo viên"
        });

    }

});


// =====================================================
// ADMIN - LOCK / UNLOCK TEACHER
// =====================================================

app.patch(
    "/api/admin/teachers/:id/status",
    async (req, res) => {

        try {

            const id =
                Number(req.params.id);

            const newStatus =
                Number(
                    req.body.is_active
                );


            if (
                !Number.isInteger(id) ||
                id <= 0
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "ID giáo viên không hợp lệ"
                });

            }


            if (
                ![0, 1].includes(
                    newStatus
                )
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Trạng thái không hợp lệ"
                });

            }


            const [result] =
                await db.query(
                    `
                    UPDATE teachers
                    SET is_active = ?
                    WHERE id = ?
                    `,
                    [
                        newStatus,
                        id
                    ]
                );


            if (
                result.affectedRows === 0
            ) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Không tìm thấy giáo viên"
                });

            }


            res.json({

                success: true,

                message:
                    newStatus === 1
                        ? "Đã mở khóa giáo viên"
                        : "Đã khóa giáo viên",

                id,

                is_active:
                    newStatus

            });


        } catch (error) {

            console.error(
                "TEACHER STATUS ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Không thể thay đổi trạng thái giáo viên"
            });

        }

    }
);


// =====================================================
// ADMIN - RESET TEACHER PASSWORD
// =====================================================

app.post(
    "/api/admin/teachers/:id/reset-password",
    async (req, res) => {

        try {

            const id =
                Number(req.params.id);


            const [rows] =
                await db.query(
                    `
                    SELECT id
                    FROM teachers
                    WHERE id = ?
                    LIMIT 1
                    `,
                    [id]
                );


            if (rows.length === 0) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Không tìm thấy giáo viên"
                });

            }


            const defaultPassword =
                "123456";


            await db.query(
                `
                UPDATE teachers
                SET password_hash = ?
                WHERE id = ?
                `,
                [
                    defaultPassword,
                    id
                ]
            );


            res.json({

                success: true,

                message:
                    "Đã đặt lại mật khẩu giáo viên",

                default_password:
                    defaultPassword

            });


        } catch (error) {

            console.error(
                "RESET TEACHER PASSWORD ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Không thể đặt lại mật khẩu"
            });

        }

    }
);
// =====================================================
// ADMIN - GET CLASSES
// =====================================================

app.get("/api/admin/classes", async (req, res) => {

    try {

        const [rows] = await db.query(`
            SELECT
                c.id,
                c.class_code,
                c.class_name,
                c.grade_level,
                c.school_year_id,
                c.is_active,
                c.created_at,
                sy.name AS school_year_name
            FROM classes c
            LEFT JOIN school_years sy
                ON sy.id = c.school_year_id
            ORDER BY
                c.grade_level ASC,
                c.class_code ASC
        `);

        res.json({
            success: true,
            total: rows.length,
            classes: rows
        });

    } catch (error) {

        console.error(
            "GET CLASSES ERROR:",
            error
        );

        res.status(500).json({
            success: false,
            message:
                "Không thể lấy danh sách lớp học"
        });

    }

});


// =====================================================
// ADMIN - GET SCHOOL YEARS
// Dùng cho ô chọn năm học khi tạo lớp
// =====================================================

app.get("/api/admin/school-years", async (req, res) => {

    try {

        const [rows] = await db.query(`
            SELECT
                id,
                name,
                start_date,
                end_date,
                is_current
            FROM school_years
            ORDER BY start_date DESC
        `);

        res.json({
            success: true,
            school_years: rows
        });

    } catch (error) {

        console.error(
            "GET SCHOOL YEARS ERROR:",
            error
        );

        res.status(500).json({
            success: false,
            message:
                "Không thể lấy danh sách năm học"
        });

    }

});
// =====================================================
// ADMIN - CREATE + ACTIVATE SCHOOL YEAR
// Tạo năm học mới và đặt làm năm học hiện tại
// =====================================================

app.post(
    "/api/admin/school-years/create-and-activate",
    async (req, res) => {

        let connection;

        try {

            const name =
                String(req.body.name || "")
                    .trim();

            const startDate =
                String(req.body.start_date || "")
                    .trim();

            const endDate =
                String(req.body.end_date || "")
                    .trim();


            // ==========================================
            // VALIDATE
            // ==========================================

            if (!name) {

                return res.status(400).json({
                    success: false,
                    message: "Vui lòng nhập tên năm học"
                });

            }


            if (!startDate || !endDate) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Vui lòng nhập ngày bắt đầu và ngày kết thúc"
                });

            }


            connection =
                await db.getConnection();

            await connection.beginTransaction();


            // ==========================================
            // KIỂM TRA NĂM HỌC ĐÃ TỒN TẠI CHƯA
            // ==========================================

            const [existingRows] =
                await connection.query(
                    `
                    SELECT
                        id,
                        name

                    FROM school_years

                    WHERE name = ?

                    LIMIT 1
                    `,
                    [name]
                );


            let schoolYearId;


            if (existingRows.length > 0) {

                schoolYearId =
                    existingRows[0].id;


                // Nếu đã tồn tại thì cập nhật ngày

                await connection.query(
                    `
                    UPDATE school_years

                    SET
                        start_date = ?,
                        end_date = ?

                    WHERE id = ?
                    `,
                    [
                        startDate,
                        endDate,
                        schoolYearId
                    ]
                );

            } else {

                // ======================================
                // TẠO NĂM HỌC MỚI
                // ======================================

                const [result] =
                    await connection.query(
                        `
                        INSERT INTO school_years
                        (
                            name,
                            start_date,
                            end_date,
                            is_current
                        )

                        VALUES (?, ?, ?, 0)
                        `,
                        [
                            name,
                            startDate,
                            endDate
                        ]
                    );


                schoolYearId =
                    result.insertId;

            }


            // ==========================================
            // BỎ CURRENT CỦA TẤT CẢ NĂM HỌC
            // ==========================================

            await connection.query(
                `
                UPDATE school_years

                SET is_current = 0
                `
            );


            // ==========================================
            // ĐẶT NĂM MỚI LÀ CURRENT
            // ==========================================

            await connection.query(
                `
                UPDATE school_years

                SET is_current = 1

                WHERE id = ?
                `,
                [schoolYearId]
            );


            // ==========================================
            // COMMIT
            // ==========================================

            await connection.commit();


            res.json({

                success: true,

                message:
                    "Đã chuyển sang năm học " + name,

                school_year: {

                    id:
                        schoolYearId,

                    name:
                        name,

                    start_date:
                        startDate,

                    end_date:
                        endDate,

                    is_current:
                        1

                }

            });


        } catch (error) {

            if (connection) {

                try {
                    await connection.rollback();
                } catch (_) {}

            }


            console.error(
                "CREATE SCHOOL YEAR ERROR:",
                error
            );


            res.status(500).json({

                success: false,

                message:
                    "Không thể tạo hoặc chuyển năm học",

                error:
                    error.message

            });


        } finally {

            if (connection) {
                connection.release();
            }

        }

    }
);

// =====================================================
// ADMIN - ADD CLASS
// =====================================================

app.post("/api/admin/classes", async (req, res) => {

    try {

        const {
            class_code,
            class_name,
            grade_level,
            school_year_id
        } = req.body;


        const cleanCode =
            String(class_code || "")
                .trim()
                .toUpperCase();


        const cleanName =
            String(class_name || "")
                .trim();


        const grade =
            Number(grade_level);


        const yearId =
            Number(school_year_id);


        if (
            !cleanCode ||
            !cleanName
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "Vui lòng nhập mã lớp và tên lớp"
            });

        }


        if (
            !Number.isInteger(grade) ||
            grade < 1 ||
            grade > 12
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "Khối lớp không hợp lệ"
            });

        }


        if (
            !Number.isInteger(yearId) ||
            yearId <= 0
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "Năm học không hợp lệ"
            });

        }


        // Kiểm tra năm học tồn tại

        const [yearRows] =
            await db.query(
                `
                SELECT id
                FROM school_years
                WHERE id = ?
                LIMIT 1
                `,
                [yearId]
            );


        if (yearRows.length === 0) {

            return res.status(404).json({
                success: false,
                message:
                    "Không tìm thấy năm học"
            });

        }


        // Không cho trùng mã lớp
        // trong cùng một năm học

        const [existing] =
            await db.query(
                `
                SELECT id
                FROM classes
                WHERE
                    class_code = ?
                    AND school_year_id = ?
                LIMIT 1
                `,
                [
                    cleanCode,
                    yearId
                ]
            );


        if (existing.length > 0) {

            return res.status(409).json({
                success: false,
                message:
                    "Mã lớp đã tồn tại trong năm học này"
            });

        }


        const [result] =
            await db.query(
                `
                INSERT INTO classes
                (
                    class_code,
                    class_name,
                    grade_level,
                    school_year_id,
                    is_active
                )
                VALUES (?, ?, ?, ?, 1)
                `,
                [
                    cleanCode,
                    cleanName,
                    grade,
                    yearId
                ]
            );


        res.status(201).json({

            success: true,

            message:
                "Thêm lớp học thành công",

            class: {

                id:
                    result.insertId,

                class_code:
                    cleanCode,

                class_name:
                    cleanName,

                grade_level:
                    grade,

                school_year_id:
                    yearId,

                is_active:
                    1

            }

        });


    } catch (error) {

        console.error(
            "ADD CLASS ERROR:",
            error
        );

        res.status(500).json({
            success: false,
            message:
                "Không thể thêm lớp học"
        });

    }

});


// =====================================================
// ADMIN - UPDATE CLASS
// =====================================================

app.put("/api/admin/classes/:id", async (req, res) => {

    try {

        const id =
            Number(req.params.id);


        const {
            class_code,
            class_name,
            grade_level,
            school_year_id
        } = req.body;


        if (
            !Number.isInteger(id) ||
            id <= 0
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "ID lớp học không hợp lệ"
            });

        }


        const cleanCode =
            String(class_code || "")
                .trim()
                .toUpperCase();


        const cleanName =
            String(class_name || "")
                .trim();


        const grade =
            Number(grade_level);


        const yearId =
            Number(school_year_id);


        if (
            !cleanCode ||
            !cleanName
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "Vui lòng nhập mã lớp và tên lớp"
            });

        }


        if (
            !Number.isInteger(grade) ||
            grade < 1 ||
            grade > 12
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "Khối lớp không hợp lệ"
            });

        }


        if (
            !Number.isInteger(yearId) ||
            yearId <= 0
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "Năm học không hợp lệ"
            });

        }


        const [classRows] =
            await db.query(
                `
                SELECT id
                FROM classes
                WHERE id = ?
                LIMIT 1
                `,
                [id]
            );


        if (classRows.length === 0) {

            return res.status(404).json({
                success: false,
                message:
                    "Không tìm thấy lớp học"
            });

        }


        const [yearRows] =
            await db.query(
                `
                SELECT id
                FROM school_years
                WHERE id = ?
                LIMIT 1
                `,
                [yearId]
            );


        if (yearRows.length === 0) {

            return res.status(404).json({
                success: false,
                message:
                    "Không tìm thấy năm học"
            });

        }


        const [duplicateRows] =
            await db.query(
                `
                SELECT id
                FROM classes
                WHERE
                    class_code = ?
                    AND school_year_id = ?
                    AND id <> ?
                LIMIT 1
                `,
                [
                    cleanCode,
                    yearId,
                    id
                ]
            );


        if (duplicateRows.length > 0) {

            return res.status(409).json({
                success: false,
                message:
                    "Mã lớp đã tồn tại trong năm học này"
            });

        }


        await db.query(
            `
            UPDATE classes
            SET
                class_code = ?,
                class_name = ?,
                grade_level = ?,
                school_year_id = ?
            WHERE id = ?
            `,
            [
                cleanCode,
                cleanName,
                grade,
                yearId,
                id
            ]
        );


        res.json({

            success: true,

            message:
                "Cập nhật lớp học thành công"

        });


    } catch (error) {

        console.error(
            "UPDATE CLASS ERROR:",
            error
        );

        res.status(500).json({
            success: false,
            message:
                "Không thể cập nhật lớp học"
        });

    }

});


// =====================================================
// ADMIN - LOCK / UNLOCK CLASS
// =====================================================

app.patch(
    "/api/admin/classes/:id/status",
    async (req, res) => {

        try {

            const id =
                Number(req.params.id);


            const status =
                Number(req.body.is_active);


            if (
                !Number.isInteger(id) ||
                id <= 0
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "ID lớp học không hợp lệ"
                });

            }


            if (
                ![0, 1].includes(status)
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Trạng thái không hợp lệ"
                });

            }


            const [result] =
                await db.query(
                    `
                    UPDATE classes
                    SET is_active = ?
                    WHERE id = ?
                    `,
                    [
                        status,
                        id
                    ]
                );


            if (
                result.affectedRows === 0
            ) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Không tìm thấy lớp học"
                });

            }


            res.json({

                success: true,

                message:
                    status === 1
                        ? "Đã mở lớp học"
                        : "Đã khóa lớp học",

                id,

                is_active:
                    status

            });


        } catch (error) {

            console.error(
                "CLASS STATUS ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Không thể thay đổi trạng thái lớp học"
            });

        }

    }
);
// =====================================================
// TEACHER LOGIN + CURRENT CLASSES
// =====================================================

const teacherLoginTokens = new Map();


app.post("/api/teacher/login", async (req, res) => {

    try {

        const email =
            String(req.body.email || "")
                .trim()
                .toLowerCase();


        if (!email) {

            return res.status(400).json({
                success: false,
                message: "Vui lòng nhập email giáo viên"
            });

        }


        const [rows] = await db.query(
            `
            SELECT
                id,
                email,
                full_name
            FROM teachers
            WHERE
                email = ?
                AND is_active = 1
            LIMIT 1
            `,
            [email]
        );


        if (rows.length === 0) {

            return res.status(401).json({
                success: false,
                message: "Email giáo viên không tồn tại hoặc đã bị khóa"
            });

        }


        const teacher = rows[0];

        const token =
            crypto.randomBytes(32)
                .toString("hex");


        teacherLoginTokens.set(
            token,
            {
                teacherId: teacher.id,
                email: teacher.email,
                fullName: teacher.full_name,
                createdAt: Date.now()
            }
        );


        res.json({
            success: true,
            token,
            teacher: {
                id: teacher.id,
                email: teacher.email,
                full_name: teacher.full_name
            }
        });


    } catch (error) {

        console.error(
            "TEACHER LOGIN ERROR:",
            error
        );


        res.status(500).json({
            success: false,
            message: "Không thể đăng nhập giáo viên"
        });

    }

});


app.get("/api/teacher/classes", async (req, res) => {

    try {

        const token =
            String(
                req.headers["x-teacher-token"] ||
                ""
            ).trim();


        if (
            !token ||
            !teacherLoginTokens.has(token)
        ) {

            return res.status(401).json({
                success: false,
                message: "Phiên đăng nhập giáo viên không hợp lệ"
            });

        }


        const [rows] = await db.query(
            `
            SELECT
                c.id,
                c.class_code,
                c.class_name,
                c.grade_level,
                sy.name AS school_year
            FROM classes c
            INNER JOIN school_years sy
                ON sy.id = c.school_year_id
            WHERE
                c.is_active = 1
                AND sy.is_current = 1
            ORDER BY
                c.grade_level ASC,
                c.class_code ASC
            `
        );


        res.json({
            success: true,
            classes: rows
        });


    } catch (error) {

        console.error(
            "GET TEACHER CLASSES ERROR:",
            error
        );


        res.status(500).json({
            success: false,
            message: "Không thể lấy danh sách lớp"
        });

    }

});


// =====================================================
// STUDENT LOGIN / LOOKUP
// =====================================================

app.post("/api/student/login", async (req, res) => {

    try {

        const studentCode =
            String(req.body.student_code || "")
                .trim()
                .toUpperCase();

        if (!studentCode) {

            return res.status(400).json({
                success: false,
                message: "Vui lòng nhập Mã học sinh"
            });

        }


        const [rows] = await db.query(
            `
            SELECT
                s.id AS student_id,
                s.student_code,
                s.full_name,

                c.id AS class_id,
                c.class_code,
                c.class_name,
                c.grade_level,

                sy.id AS school_year_id,
                sy.name AS school_year

            FROM students s

            LEFT JOIN student_enrollments se
                ON se.student_id = s.id

            LEFT JOIN classes c
                ON c.id = se.class_id

            LEFT JOIN school_years sy
                ON sy.id = c.school_year_id

            WHERE
                s.student_code = ?
                AND s.is_active = 1
                AND c.is_active = 1
                AND sy.is_current = 1

            LIMIT 1
            `,
            [studentCode]
        );


        if (rows.length === 0) {

            return res.status(404).json({
                success: false,
                message:
                    "Không tìm thấy học sinh hoặc học sinh chưa được xếp lớp."
            });

        }


        const student = rows[0];


        res.json({

            success: true,

            student: {

                id:
                    student.student_id,

                student_code:
                    student.student_code,

                full_name:
                    student.full_name,

                class_id:
                    student.class_id,

                class_code:
                    student.class_code,

                class_name:
                    student.class_name,

                grade_level:
                    student.grade_level,

                school_year_id:
                    student.school_year_id,

                school_year:
                    student.school_year

            }

        });


    } catch (error) {

        console.error(
            "STUDENT LOGIN ERROR:",
            error
        );

        res.status(500).json({
            success: false,
            message:
                "Không thể đăng nhập học sinh"
        });

    }

});
// =====================================================
// CLASS / ROOM STATE
// =====================================================

// Mỗi lớp là một Socket.IO room riêng.
// Ví dụ class_code = 9A3 -> room = class:9A3

const students = new Map();
const teachersByClass = new Map();


function normalizeClassCode(value) {

    return String(value || "")
        .trim()
        .toUpperCase();

}


function getClassRoom(classCode) {

    return "class:" + normalizeClassCode(classCode);

}


function getStudentList(classCode) {

    const normalizedClassCode =
        normalizeClassCode(classCode);

    return Array.from(
        students.entries()
    )
        .filter(
            ([, student]) =>
                student.classCode ===
                normalizedClassCode
        )
        .map(
            ([id, student]) => ({

                id,

                studentId:
                    student.studentId,

                studentCode:
                    student.studentCode,

                name:
                    student.name,

                classId:
                    student.classId,

                classCode:
                    student.classCode,

                className:
                    student.className,

                schoolYear:
                    student.schoolYear,

                screenReady:
                    student.screenReady

            })
        );

}


// =====================================================
// ADMIN - REALTIME SYSTEM MONITOR
// Chỉ trả trạng thái kết nối, KHÔNG trả nội dung màn hình.
// =====================================================

app.get(
    "/api/admin/system-monitor",
    async (req, res) => {

        try {

            const onlineStudents =
                Array.from(
                    students.values()
                );


            const classMap =
                new Map();


            for (
                const student
                of onlineStudents
            ) {

                const code =
                    normalizeClassCode(
                        student.classCode
                    ) || "UNKNOWN";


                if (!classMap.has(code)) {

                    classMap.set(
                        code,
                        {
                            class_code: code,
                            students_online: 0,
                            students_sharing: 0,
                            teacher_online:
                                teachersByClass.has(code)
                        }
                    );

                }


                const item =
                    classMap.get(code);


                item.students_online += 1;


                if (student.screenReady) {
                    item.students_sharing += 1;
                }

            }


            for (
                const classCode
                of teachersByClass.keys()
            ) {

                if (!classMap.has(classCode)) {

                    classMap.set(
                        classCode,
                        {
                            class_code: classCode,
                            students_online: 0,
                            students_sharing: 0,
                            teacher_online: true
                        }
                    );

                }

            }


            const classes =
                Array.from(
                    classMap.values()
                )
                .sort(
                    (a, b) =>
                        a.class_code.localeCompare(
                            b.class_code,
                            "vi",
                            { numeric: true }
                        )
                );


            res.json({
                success: true,
                summary: {
                    active_classes:
                        classes.length,
                    teachers_online:
                        teachersByClass.size,
                    students_online:
                        onlineStudents.length,
                    students_sharing:
                        onlineStudents.filter(
                            item =>
                                item.screenReady
                        ).length
                },
                classes
            });


        } catch (error) {

            console.error(
                "SYSTEM MONITOR ERROR:",
                error
            );


            res.status(500).json({
                success: false,
                message:
                    "Không thể tải trạng thái hệ thống"
            });

        }

    }
);


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
        //
        // Bước 1 vẫn giữ tương thích teacher.js cũ.
        // Khi teacher.js gửi classCode, GV chỉ nhận HS của lớp đó.
        // Nếu chưa gửi classCode, GV chưa vào room lớp nào.
        // =============================================

        socket.on(
            "teacher-join",
            async data => {

                try {

                    const token =
                        String(
                            data?.token ||
                            ""
                        ).trim();


                    const classCode =
                        normalizeClassCode(
                            data?.classCode
                        );


                    const login =
                        teacherLoginTokens.get(
                            token
                        );


                    if (
                        !login ||
                        !classCode
                    ) {

                        socket.emit(
                            "teacher-join-error",
                            {
                                message:
                                    "Phiên đăng nhập hoặc lớp học không hợp lệ."
                            }
                        );

                        return;

                    }


                    const [classRows] =
                        await db.query(
                            `
                            SELECT
                                c.id,
                                c.class_code,
                                c.class_name,
                                sy.name AS school_year
                            FROM classes c
                            INNER JOIN school_years sy
                                ON sy.id = c.school_year_id
                            WHERE
                                UPPER(c.class_code) = ?
                                AND c.is_active = 1
                                AND sy.is_current = 1
                            LIMIT 1
                            `,
                            [classCode]
                        );


                    if (
                        classRows.length === 0
                    ) {

                        socket.emit(
                            "teacher-join-error",
                            {
                                message:
                                    "Không tìm thấy lớp học đang hoạt động."
                            }
                        );

                        return;

                    }


                    const selectedClass =
                        classRows[0];

                    const room =
                        getClassRoom(
                            classCode
                        );


                    socket.data.role =
                        "teacher";

                    socket.data.teacherId =
                        login.teacherId;

                    socket.data.teacherName =
                        login.fullName;

                    socket.data.teacherEmail =
                        login.email;

                    socket.data.classCode =
                        classCode;


                    socket.join(
                        room
                    );


                    teachersByClass.set(
                        classCode,
                        socket.id
                    );


                    console.log(
                        "Teacher joined class:",
                        login.fullName,
                        classCode,
                        socket.id
                    );


                    socket.emit(
                        "teacher-ready",
                        {
                            teacher: {
                                id:
                                    login.teacherId,

                                email:
                                    login.email,

                                full_name:
                                    login.fullName
                            },

                            class: {
                                id:
                                    selectedClass.id,

                                class_code:
                                    selectedClass.class_code,

                                class_name:
                                    selectedClass.class_name,

                                school_year:
                                    selectedClass.school_year
                            }
                        }
                    );


                    socket.emit(
                        "student-list",
                        getStudentList(
                            classCode
                        )
                    );


                } catch (error) {

                    console.error(
                        "TEACHER JOIN ERROR:",
                        error
                    );


                    socket.emit(
                        "teacher-join-error",
                        {
                            message:
                                "Không thể vào phòng lớp."
                        }
                    );

                }

            }
        );


        // =============================================
        // STUDENT JOIN
        // =============================================

        socket.on(
            "student-join",
            async data => {

                try {

                    const studentId =
                        Number(
                            data?.studentId
                        );


                    if (
                        !Number.isInteger(
                            studentId
                        ) ||
                        studentId <= 0
                    ) {

                        socket.emit(
                            "student-join-error",
                            {
                                message:
                                    "Thông tin học sinh không hợp lệ."
                            }
                        );

                        return;

                    }


                    // Không tin classCode từ trình duyệt.
                    // Tra lại DB theo studentId và năm học hiện tại.

                    const [rows] =
                        await db.execute(
                            `
                            SELECT
                                s.id AS student_id,
                                s.student_code,
                                s.full_name,
                                c.id AS class_id,
                                c.class_code,
                                c.class_name,
                                sy.name AS school_year
                            FROM students s
                            INNER JOIN student_enrollments se
                                ON se.student_id = s.id
                            INNER JOIN classes c
                                ON c.id = se.class_id
                            INNER JOIN school_years sy
                                ON sy.id = c.school_year_id
                            WHERE
                                s.id = ?
                                AND s.is_active = 1
                                AND c.is_active = 1
                                AND sy.is_current = 1
                            LIMIT 1
                            `,
                            [
                                studentId
                            ]
                        );


                    if (
                        !rows ||
                        rows.length === 0
                    ) {

                        socket.emit(
                            "student-join-error",
                            {
                                message:
                                    "Không tìm thấy lớp hiện tại của học sinh."
                            }
                        );

                        return;

                    }


                    const dbStudent =
                        rows[0];


                    const classCode =
                        normalizeClassCode(
                            dbStudent.class_code
                        );


                    const room =
                        getClassRoom(
                            classCode
                        );


                    socket.data.role =
                        "student";

                    socket.data.name =
                        dbStudent.full_name;

                    socket.data.studentId =
                        dbStudent.student_id;

                    socket.data.studentCode =
                        dbStudent.student_code;

                    socket.data.classId =
                        dbStudent.class_id;

                    socket.data.classCode =
                        classCode;


                    socket.join(
                        room
                    );


                    students.set(
                        socket.id,
                        {
                            studentId:
                                dbStudent.student_id,

                            studentCode:
                                dbStudent.student_code,

                            name:
                                dbStudent.full_name,

                            classId:
                                dbStudent.class_id,

                            classCode,

                            className:
                                dbStudent.class_name,

                            schoolYear:
                                dbStudent.school_year,

                            screenReady:
                                false
                        }
                    );


                    console.log(
                        "Student joined class:",
                        dbStudent.full_name,
                        classCode,
                        socket.id
                    );


                    socket.to(
                        room
                    ).emit(
                        "student-joined",
                        {
                            id:
                                socket.id,

                            studentId:
                                dbStudent.student_id,

                            studentCode:
                                dbStudent.student_code,

                            name:
                                dbStudent.full_name,

                            classId:
                                dbStudent.class_id,

                            classCode,

                            className:
                                dbStudent.class_name,

                            schoolYear:
                                dbStudent.school_year
                        }
                    );


                    socket.emit(
                        "class-info",
                        {
                            classCode,

                            className:
                                dbStudent.class_name,

                            schoolYear:
                                dbStudent.school_year,

                            teacherOnline:
                                teachersByClass.has(
                                    classCode
                                )
                        }
                    );


                } catch (error) {

                    console.error(
                        "STUDENT JOIN ERROR:",
                        error
                    );


                    socket.emit(
                        "student-join-error",
                        {
                            message:
                                "Không thể đưa học sinh vào phòng lớp."
                        }
                    );

                }

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


                if (!student) {
                    return;
                }


                student.screenReady =
                    true;


                const room =
                    getClassRoom(
                        student.classCode
                    );


                console.log(
                    "Student screen ready:",
                    student.name,
                    student.classCode,
                    socket.id
                );


                socket.to(
                    room
                ).emit(
                    "student-screen-ready",
                    {
                        id:
                            socket.id,

                        studentId:
                            student.studentId,

                        studentCode:
                            student.studentCode,

                        name:
                            student.name,

                        classCode:
                            student.classCode
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


                if (!student) {
                    return;
                }


                student.screenReady =
                    false;


                socket.to(
                    getClassRoom(
                        student.classCode
                    )
                ).emit(
                    "student-screen-stopped",
                    {
                        id:
                            socket.id,

                        studentId:
                            student.studentId,

                        studentCode:
                            student.studentCode,

                        name:
                            student.name,

                        classCode:
                            student.classCode
                    }
                );

            }
        );


        // =============================================
        // WEBRTC SIGNALING
        // =============================================

        function canSignalTarget(
            targetSocket
        ) {

            if (!targetSocket) {
                return false;
            }


            const sourceClass =
                normalizeClassCode(
                    socket.data.classCode
                );


            const targetClass =
                normalizeClassCode(
                    targetSocket.data.classCode
                );


            return (
                sourceClass &&
                targetClass &&
                sourceClass === targetClass
            );

        }


        socket.on(
            "webrtc-offer",
            data => {

                if (
                    !data ||
                    !data.target
                ) {
                    return;
                }


                const targetSocket =
                    io.sockets.sockets.get(
                        data.target
                    );


                if (
                    !canSignalTarget(
                        targetSocket
                    )
                ) {

                    console.warn(
                        "Blocked cross-class WebRTC offer:",
                        socket.id,
                        "->",
                        data.target
                    );

                    return;

                }


                targetSocket.emit(
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


        socket.on(
            "webrtc-answer",
            data => {

                if (
                    !data ||
                    !data.target
                ) {
                    return;
                }


                const targetSocket =
                    io.sockets.sockets.get(
                        data.target
                    );


                if (
                    !canSignalTarget(
                        targetSocket
                    )
                ) {
                    return;
                }


                targetSocket.emit(
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


                const targetSocket =
                    io.sockets.sockets.get(
                        data.target
                    );


                if (
                    !canSignalTarget(
                        targetSocket
                    )
                ) {
                    return;
                }


                targetSocket.emit(
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
        // TEACHER REQUESTS STUDENT STREAM QUALITY
        // =============================================

        socket.on(
            "student-quality",
            data => {

                if (
                    socket.data.role !==
                    "teacher" ||
                    !data?.target
                ) {
                    return;
                }


                const targetSocket =
                    io.sockets.sockets.get(
                        data.target
                    );


                if (
                    !targetSocket ||
                    !canSignalTarget(
                        targetSocket
                    )
                ) {
                    return;
                }


                const mode =
                    data.mode === "focus"
                        ? "focus"
                        : "grid";


                targetSocket.emit(
                    "student-quality",
                    {
                        mode
                    }
                );

            }
        );


        // =============================================
        // TEACHER START / STOP SHARE
        // =============================================

        socket.on(
            "teacher-share-started",
            () => {

                if (
                    socket.data.role !==
                    "teacher"
                ) {
                    return;
                }


                const classCode =
                    normalizeClassCode(
                        socket.data.classCode
                    );


                if (!classCode) {
                    return;
                }


                socket.to(
                    getClassRoom(
                        classCode
                    )
                ).emit(
                    "teacher-share-started"
                );

            }
        );


        socket.on(
            "teacher-share-stopped",
            () => {

                if (
                    socket.data.role !==
                    "teacher"
                ) {
                    return;
                }


                const classCode =
                    normalizeClassCode(
                        socket.data.classCode
                    );


                if (!classCode) {
                    return;
                }


                socket.to(
                    getClassRoom(
                        classCode
                    )
                ).emit(
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
                    socket.data.role !==
                    "teacher"
                ) {
                    return;
                }


                const classCode =
                    normalizeClassCode(
                        socket.data.classCode
                    );


                if (!classCode) {
                    return;
                }


                const room =
                    getClassRoom(
                        classCode
                    );


                console.log(
                    "Teacher ended class:",
                    classCode
                );


                socket.to(
                    room
                ).emit(
                    "class-ended"
                );


                for (
                    const [id, student]
                    of students.entries()
                ) {

                    if (
                        student.classCode ===
                        classCode
                    ) {

                        students.delete(
                            id
                        );

                    }

                }


                teachersByClass.delete(
                    classCode
                );

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


                if (
                    socket.data.role ===
                    "student"
                ) {

                    const student =
                        students.get(
                            socket.id
                        );


                    if (student) {

                        students.delete(
                            socket.id
                        );


                        socket.to(
                            getClassRoom(
                                student.classCode
                            )
                        ).emit(
                            "student-left",
                            {
                                id:
                                    socket.id,

                                studentId:
                                    student.studentId,

                                studentCode:
                                    student.studentCode,

                                name:
                                    student.name,

                                classCode:
                                    student.classCode,

                                reason
                            }
                        );


                        console.log(
                            "Student left:",
                            student.name,
                            student.classCode,
                            socket.id
                        );

                    }

                }


                if (
                    socket.data.role ===
                    "teacher"
                ) {

                    const classCode =
                        normalizeClassCode(
                            socket.data.classCode
                        );


                    if (
                        classCode &&
                        teachersByClass.get(
                            classCode
                        ) === socket.id
                    ) {

                        teachersByClass.delete(
                            classCode
                        );


                        socket.to(
                            getClassRoom(
                                classCode
                            )
                        ).emit(
                            "teacher-offline"
                        );


                        console.log(
                            "Teacher offline:",
                            classCode
                        );

                    }

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
