const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const morgan = require("morgan");
const pool = require("./db");
// โครงงานระยะที่ 2
const swaggerUi = require("swagger-ui-express");
const YAML = require("js-yaml");
const fs = require("fs");
const path = require("path");
const { checkHoliday } = require("./services/external-api");
const { requestContext } = require("./middleware/request-context");
const { parsePlayerFilters } = require("./middleware/player-filters");
const { notFound, errorHandler } = require("./middleware/http-errors");
const { requireStaff, readSession, setSession, createAccessToken, COOKIE_NAME } = require("./middleware/staff-auth");
const { hashPassword, verifyPassword } = require("./services/passwords");
const { apiRateLimit } = require("./middleware/rate-limit");
const { protectBoardgameMutations } = require("./middleware/staff-routes");
const crypto = require("node:crypto");

const app = express();

// ลำดับ middleware มีความสำคัญ: security header → CORS → logger → body parser
app.use(helmet());
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGIN,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    exposedHeaders: ["X-Request-ID"],
  }),
);
app.use(requestContext);
morgan.token("request-id", (req) => req.id);
app.use(morgan(":request-id :method :url :status :response-time ms"));
app.use(express.json({ limit: "10kb" }));
app.use("/api/v1", apiRateLimit);
app.get("/staff", (req, res) => {
  if (!readSession(req)) return res.redirect("/staff/login");
  res.sendFile(path.join(__dirname, "..", "frontend", "staff.html"));
});
app.get("/staff.html", (req, res) => res.redirect("/staff"));
app.get("/staff/login", (req, res) => {
  if (readSession(req)) return res.redirect("/staff");
  res.sendFile(path.join(__dirname, "..", "frontend", "staff-login.html"));
});
app.use(express.static(path.join(__dirname, "..", "frontend")));

app.post("/api/v1/auth/signup", async (req, res, next) => {
  try {
    if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32) return res.status(503).json({ error: { code: "AUTH_NOT_CONFIGURED", message: "กรุณาตั้งค่า AUTH_SECRET อย่างน้อย 32 ตัวอักษรใน .env" } });
    const { username, password, signup_key: signupKey } = req.body;
    if (typeof username !== "string" || !/^[A-Za-z0-9_.-]{3,50}$/.test(username) || typeof password !== "string" || password.length < 10 || password.length > 128) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "ชื่อผู้ใช้ต้องมี 3-50 ตัวอักษร และรหัสผ่านต้องมี 10-128 ตัวอักษร" } });
    }
    if (!process.env.STAFF_SIGNUP_KEY) return res.status(503).json({ error: { code: "SIGNUP_DISABLED", message: "ยังไม่ได้เปิดระบบสร้างบัญชีพนักงาน" } });
    const expected = Buffer.from(process.env.STAFF_SIGNUP_KEY);
    const supplied = Buffer.from(typeof signupKey === "string" ? signupKey : "");
    if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) return res.status(403).json({ error: { code: "INVALID_SIGNUP_KEY", message: "รหัสเปิดรับสมัครไม่ถูกต้อง" } });
    const passwordHash = await hashPassword(password);
    const [result] = await pool.query("INSERT INTO staff_users (username, password_hash) VALUES (?, ?)", [username, passwordHash]);
    const staff = { id: result.insertId, username };
    setSession(res, staff);
    res.status(201).json({ message: "สร้างบัญชีพนักงานสำเร็จ", data: staff, access_token: createAccessToken(staff), token_type: "Bearer", expires_in: 28800 });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ error: { code: "USERNAME_TAKEN", message: "ชื่อผู้ใช้นี้ถูกใช้แล้ว" } });
    next(err);
  }
});

app.post("/api/v1/auth/login", async (req, res, next) => {
  try {
    if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32) return res.status(503).json({ error: { code: "AUTH_NOT_CONFIGURED", message: "กรุณาตั้งค่า AUTH_SECRET อย่างน้อย 32 ตัวอักษรใน .env" } });
    const { username, password } = req.body;
    if (typeof username !== "string" || typeof password !== "string") return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "กรุณาระบุชื่อผู้ใช้และรหัสผ่าน" } });
    const [rows] = await pool.query("SELECT id, username, password_hash FROM staff_users WHERE username = ?", [username]);
    const valid = rows.length ? await verifyPassword(password, rows[0].password_hash) : false;
    if (!valid) return res.status(401).json({ error: { code: "INVALID_CREDENTIALS", message: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" } });
    const staff = { id: rows[0].id, username: rows[0].username };
    setSession(res, staff);
    res.status(200).json({ message: "เข้าสู่ระบบสำเร็จ", data: staff, access_token: createAccessToken(staff), token_type: "Bearer", expires_in: 28800 });
  } catch (err) { next(err); }
});

app.post("/api/v1/auth/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/" });
  res.status(200).json({ message: "ออกจากระบบแล้ว" });
});
app.get("/api/v1/auth/me", requireStaff, (req, res) => res.status(200).json({ data: req.staff }));

// Mutating catalog operations and all staff reservation operations require a valid session.
app.use("/api/v1/boardgames", protectBoardgameMutations);
app.use("/api/v1/categories", (req, res, next) => ["POST", "PATCH", "DELETE"].includes(req.method) ? requireStaff(req, res, next) : next());
app.use("/api/v1/reservations", (req, res, next) => req.method === "GET" || req.method === "PATCH" || req.method === "DELETE" ? requireStaff(req, res, next) : next());

// url endpointสำหรับตรวจสอบสถานะ API
app.get("/health", (req, res) => {
  res.status(200).json({ message: "Boardgame API พร้อมใช้งาน" });
});

// โครงงานระยะที่ 2 ส่วนที่ 1: Swagger UI อ่านจาก openapi.yaml ที่รากโปรเจกต์
const openapiDocument = YAML.load(
  fs.readFileSync(path.join(__dirname, "..", "openapi.yaml"), "utf8"),
);
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(openapiDocument));

/* ==========================================================
   Boardgames (Use Case 1, 2, 6)
   ========================================================== */

// 1. GET: ค้นหาเกมตามจำนวนผู้เล่น รองรับ ?minPlayers=&maxPlayers=
app.get("/api/v1/boardgames", parsePlayerFilters, async (req, res, next) => {
  try {
    const { minPlayers, maxPlayers } = req.playerFilters;
    let sql = `SELECT b.id, b.name, b.min_players, b.max_players,
                      c.name AS category_name
               FROM boardgames b
               JOIN categories c ON b.category_id = c.id
               WHERE 1=1`;
    const params = [];
    if (minPlayers) {
      sql += " AND b.max_players >= ?";
      params.push(Number(minPlayers));
    }
    if (maxPlayers) {
      sql += " AND b.min_players <= ?";
      params.push(Number(maxPlayers));
    }
    sql += " ORDER BY b.id";
    const [rows] = await pool.query(sql, params);
    res.status(200).json({ message: "สำเร็จ", data: rows });
  } catch (err) {
    next(err);
  }
});

// 2. GET: รายละเอียดเกมพร้อมรีวิว
app.get("/api/v1/boardgames/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const [games] = await pool.query(
      `SELECT b.id, b.name, b.min_players, b.max_players,
              c.name AS category_name
       FROM boardgames b
       JOIN categories c ON b.category_id = c.id
       WHERE b.id = ?`,
      [id],
    );

    if (games.length === 0) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: `ไม่พบบอร์ดเกม id=${id}` },
      });
    }

    const [reviews] = await pool.query(
      `SELECT reviewer_name, rating, comment, created_at
       FROM reviews WHERE boardgame_id = ? ORDER BY created_at DESC`,
      [id],
    );
    res.status(200).json({ message: "สำเร็จ", data: { ...games[0], reviews } });
  } catch (err) {
    next(err);
  }
});

// 3. POST: เพิ่มบอร์ดเกม
app.post("/api/v1/boardgames", async (req, res, next) => {
  try {
    const { name, min_players, max_players, category_id } = req.body;

    if (!name || !min_players || !max_players || !category_id) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "กรุณาระบุ name, min_players, max_players, category_id",
        },
      });
    }

    const [result] = await pool.query(
      `INSERT INTO boardgames (name, min_players, max_players, category_id)
       VALUES (?, ?, ?, ?)`,
      [name, min_players, max_players, category_id],
    );
    res.status(201).json({
      message: "เพิ่มข้อมูลบอร์ดเกมสำเร็จ",
      data: {
        id: result.insertId,
        name,
        min_players,
        max_players,
        category_id,
      },
    });
  } catch (err) {
    next(err);
  }
});

// 4. PATCH: แก้ไขบอร์ดเกม
app.patch("/api/v1/boardgames/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, min_players, max_players, category_id } = req.body;
    const fields = [];
    const params = [];

    if (name !== undefined) {
      fields.push("name = ?");
      params.push(name);
    }
    if (min_players !== undefined) {
      fields.push("min_players = ?");
      params.push(min_players);
    }
    if (max_players !== undefined) {
      fields.push("max_players = ?");
      params.push(max_players);
    }
    if (category_id !== undefined) {
      fields.push("category_id = ?");
      params.push(category_id);
    }

    if (fields.length === 0) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "ต้องระบุอย่างน้อยหนึ่งฟิลด์ที่จะแก้ไข",
        },
      });
    }

    params.push(id);
    const [result] = await pool.query(
      `UPDATE boardgames SET ${fields.join(", ")} WHERE id = ?`,
      params,
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: `ไม่พบบอร์ดเกม id=${id}` },
      });
    }

    res.status(200).json({ message: "แก้ไขข้อมูลบอร์ดเกมสำเร็จ" });
  } catch (err) {
    next(err);
  }
});

// 5. DELETE: ลบบอร์ดเกม
app.delete("/api/v1/boardgames/:id", async (req, res, next) => {
  try {
    const [result] = await pool.query("DELETE FROM boardgames WHERE id = ?", [
      req.params.id,
    ]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        error: {
          code: "NOT_FOUND",
          message: `ไม่พบบอร์ดเกม id=${req.params.id}`,
        },
      });
    }

    res.status(200).json({ message: "ลบข้อมูลบอร์ดเกมสำเร็จ" });
  } catch (err) {
    next(err);
  }
});

// 6. POST: เขียนรีวิว
app.post("/api/v1/boardgames/:id/reviews", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reviewer_name, rating, comment } = req.body;

    if (!reviewer_name || !rating) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "ต้องระบุ reviewer_name และ rating",
        },
      });
    }
    if (rating < 1 || rating > 5) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "rating ต้องอยู่ระหว่าง 1-5",
        },
      });
    }

    const [result] = await pool.query(
      `INSERT INTO reviews (boardgame_id, reviewer_name, rating, comment) VALUES (?, ?, ?, ?)`,
      [id, reviewer_name, rating, comment || null],
    );

    res.status(201).json({
      message: "เพิ่มรีวิวสำเร็จ",
      data: {
        id: result.insertId,
        boardgame_id: Number(id),
        reviewer_name,
        rating,
        comment,
      },
    });
  } catch (err) {
    next(err);
  }
});

// 7. GET: ดูรีวิวทั้งหมดของบอร์ดเกมแต่ละอัน
app.get("/api/v1/boardgames/:id/reviews", async (req, res, next) => {
  try {
    const { id } = req.params;

    // เช็คก่อนว่ามีบอร์ดเกมนี้อยู่ในระบบหรือไม่
    const [games] = await pool.query("SELECT id FROM boardgames WHERE id = ?", [
      id,
    ]);

    if (games.length === 0) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: `ไม่พบบอร์ดเกม id=${id}` },
      });
    }

    // ดึงข้อมูลรีวิวของบอร์ดเกมนั้นๆ เรียงจากใหม่ไปเก่า
    const [reviews] = await pool.query(
      `SELECT id, reviewer_name, rating, comment, created_at
       FROM reviews WHERE boardgame_id = ? ORDER BY created_at DESC`,
      [id],
    );

    res.status(200).json({ message: "สำเร็จ", data: reviews });
  } catch (err) {
    next(err);
  }
});

/* ==========================================================
   Categories (Use Case 5)
   ========================================================== */

// 1. GET: ดึงรายการหมวดหมู่บอร์ดเกมทั้งหมดจากฐานข้อมูล
app.get("/api/v1/categories", async (req, res, next) => {
  try {
    const [rows] = await pool.query("SELECT * FROM categories ORDER BY id");
    res.status(200).json({ message: "สำเร็จ", data: rows });
  } catch (err) {
    next(err);
  }
});

// 2. POST: เพิ่มหมวดหมู่บอร์ดเกมใหม่ (ต้องระบุ name)
app.post("/api/v1/categories", async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "ต้องระบุ name" },
      });
    }

    const [result] = await pool.query(
      "INSERT INTO categories (name) VALUES (?)",
      [name],
    );
    res.status(201).json({
      message: "เพิ่มหมวดหมู่สำเร็จ",
      data: { id: result.insertId, name },
    });
  } catch (err) {
    next(err);
  }
});

// 3. DELETE: ลบหมวดหมู่ตาม ID ที่ระบุ
// (มีการดักจับ Error กรณีที่หมวดหมู่นั้นถูกใช้งานในบอร์ดเกมอยู่ จะลบไม่ได้)
app.delete("/api/v1/categories/:id", async (req, res, next) => {
  try {
    const [result] = await pool.query("DELETE FROM categories WHERE id = ?", [
      req.params.id,
    ]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        error: {
          code: "NOT_FOUND",
          message: `ไม่พบหมวดหมู่ id=${req.params.id}`,
        },
      });
    }
    res.status(200).json({ message: "ลบหมวดหมู่สำเร็จ" });
  } catch (err) {
    // ดัก Error กรณีหมวดหมู่นี้ถูกใช้งานอยู่ในตาราง boardgames (ON DELETE RESTRICT)
    if (err.code === "ER_ROW_IS_REFERENCED_2") {
      return res.status(409).json({
        error: {
          code: "CATEGORY_IN_USE",
          message: "ไม่สามารถลบได้เนื่องจากมีบอร์ดเกมอยู่ในหมวดหมู่นี้",
        },
      });
    }
    next(err);
  }
});

// 4. PATCH: แก้ไขชื่อหมวดหมู่ตาม ID ที่ระบุ (ต้องส่ง name ค่าใหม่มาด้วย)
app.patch("/api/v1/categories/:id", async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "ต้องระบุ name" },
      });
    }

    const [result] = await pool.query(
      "UPDATE categories SET name = ? WHERE id = ?",
      [name, req.params.id],
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        error: {
          code: "NOT_FOUND",
          message: `ไม่พบหมวดหมู่ id=${req.params.id}`,
        },
      });
    }
    res.status(200).json({ message: "แก้ไขหมวดหมู่สำเร็จ" });
  } catch (err) {
    next(err);
  }
});

/* ==========================================================
   Reservations (Use Case 3, 4) - Using Transactions
   ========================================================== */

// POST: จองโต๊ะพร้อมระบุเกม
app.post("/api/v1/reservations", async (req, res, next) => {
  let conn;
  try {
    const {
      customer_name,
      customer_phone,
      customer_email,
      reservation_date,
      reservation_time,
      party_size,
      boardgame_ids,
    } = req.body;

    if (
      typeof customer_name !== "string" || !customer_name.trim() ||
      typeof customer_phone !== "string" || !customer_phone.trim() ||
      typeof reservation_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(reservation_date) ||
      typeof reservation_time !== "string" || !/^\d{2}:\d{2}(?::\d{2})?$/.test(reservation_time) ||
      !Number.isInteger(Number(party_size)) || Number(party_size) < 1
    ) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message:
            "ต้องระบุ customer_name, customer_phone, reservation_date, reservation_time, party_size",
        },
      });
    }

    if (!Array.isArray(boardgame_ids) || boardgame_ids.length === 0 || boardgame_ids.some((id) => !Number.isInteger(Number(id)) || Number(id) < 1)) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "กรุณาเลือกเกมอย่างน้อย 1 เกม และระบุ boardgame_ids เป็น array ของ ID ที่ถูกต้อง" } });
    }

    // ตรวจวันหยุดก่อนขอ connection เพื่อไม่ถือ connection ค้างระหว่างรอ API ภายนอก
    const holidayCheck = await checkHoliday(reservation_date);
    conn = await pool.getConnection();

    await conn.beginTransaction();

    let [existing] = await conn.query(
      "SELECT id FROM customers WHERE phone = ?",
      [customer_phone],
    );

    let customerId;
    if (existing.length > 0) {
      customerId = existing[0].id;
    } else {
      const [custResult] = await conn.query(
        "INSERT INTO customers (name, phone, email) VALUES (?, ?, ?)",
        [customer_name, customer_phone, customer_email || null],
      );
      customerId = custResult.insertId;
    }

    const [resResult] = await conn.query(
      `INSERT INTO reservations (customer_id, reservation_date, reservation_time, party_size, status)
       VALUES (?, ?, ?, ?, 'pending')`,
      [customerId, reservation_date, reservation_time, party_size],
    );
    const reservationId = resResult.insertId;

    if (Array.isArray(boardgame_ids) && boardgame_ids.length > 0) {
      const values = boardgame_ids.map((gid) => [reservationId, gid]);
      await conn.query(
        "INSERT INTO reservation_games (reservation_id, boardgame_id) VALUES ?",
        [values],
      );
    }

    await conn.commit();
    res.status(201).json({
      message: "ทำการจองสำเร็จ",
      data: {
        id: reservationId,
        customer_id: customerId,
        reservation_date,
        reservation_time,
        party_size,
        status: "pending",
        boardgame_ids: boardgame_ids || [],
      },
      holiday_check: holidayCheck,
    });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
      if (conn) conn.release();
  }
});

// GET: ดูรายการจองทั้งหมด
app.get("/api/v1/reservations", async (req, res, next) => {
  try {
    const [reservations] = await pool.query(
      `SELECT r.id, r.reservation_date, r.reservation_time, r.party_size, r.status,
              c.name AS customer_name, c.phone AS customer_phone
       FROM reservations r
       JOIN customers c ON r.customer_id = c.id
       ORDER BY r.reservation_date, r.reservation_time`,
    );

    for (const r of reservations) {
      const [games] = await pool.query(
        `SELECT b.name FROM boardgames b
         JOIN reservation_games rg ON b.id = rg.boardgame_id
         WHERE rg.reservation_id = ?`,
        [r.id],
      );
      r.boardgames = games.map((g) => g.name);
    }

    res.status(200).json({ message: "สำเร็จ", data: reservations });
  } catch (err) {
    next(err);
  }
});

// DELETE: ลบคำขอจองถาวร (reservation_games ถูกลบตามด้วย ON DELETE CASCADE)
app.delete("/api/v1/reservations/:id", async (req, res, next) => {
  try {
    const [result] = await pool.query("DELETE FROM reservations WHERE id = ?", [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: `ไม่พบการจอง id=${req.params.id}` },
      });
    }
    res.status(200).json({ message: "ลบคำขอจองสำเร็จ" });
  } catch (err) {
    next(err);
  }
});

// PATCH: อัปเดตสถานะการจอง
app.patch("/api/v1/reservations/:id/status", async (req, res, next) => {
  try {
    const { status } = req.body;
    const validStatuses = ["pending", "confirmed", "cancelled"];

    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: `status ต้องเป็นหนึ่งใน: ${validStatuses.join(", ")}`,
        },
      });
    }

    const [result] = await pool.query(
      "UPDATE reservations SET status = ? WHERE id = ?",
      [status, req.params.id],
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        error: {
          code: "NOT_FOUND",
          message: `ไม่พบการจอง id=${req.params.id}`,
        },
      });
    }
    res.status(200).json({ message: "อัปเดตสถานะการจองสำเร็จ" });
  } catch (err) {
    next(err);
  }
});

/* ==========================================================
   Error handling
   ========================================================== */

// 404: ไม่พบ route ที่ร้องขอ (ต้องอยู่หลัง route ทั้งหมด)
app.use(notFound);

// Error-handling middleware (ต้องมีพารามิเตอร์ 4 ตัวเสมอ)
app.use(errorHandler);

module.exports = app;
