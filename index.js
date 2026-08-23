require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const morgan = require("morgan");
const pool = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

// ลำดับ middleware มีความสำคัญ: security header → CORS → logger → body parser
app.use(helmet());
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGIN,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  }),
);
app.use(morgan("dev"));
app.use(express.json({ limit: "10kb" }));

// url endpointสำหรับตรวจสอบสถานะ API
app.get("/", (req, res) => {
  res.status(200).json({ message: "Boardgame API พร้อมใช้งาน" });
});

/* ==========================================================
   Boardgames (Use Case 1, 2, 6)
   ========================================================== */

// 1. GET: ค้นหาเกมตามจำนวนผู้เล่น รองรับ ?minPlayers=&maxPlayers=
app.get("/api/v1/boardgames", async (req, res, next) => {
  try {
    const { minPlayers, maxPlayers } = req.query;
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
  const conn = await pool.getConnection();
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
      !customer_name ||
      !customer_phone ||
      !reservation_date ||
      !reservation_time ||
      !party_size
    ) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message:
            "ต้องระบุ customer_name, customer_phone, reservation_date, reservation_time, party_size",
        },
      });
    }

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
    });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
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
app.use((req, res) => {
  res.status(404).json({
    error: { code: "ROUTE_NOT_FOUND", message: "ไม่พบเส้นทางที่ร้องขอ" },
  });
});

// Error-handling middleware (ต้องมีพารามิเตอร์ 4 ตัวเสมอ)
app.use((err, req, res, next) => {
  console.error(err.stack);
  const statusCode = err.status || err.statusCode || 500;
  res.status(statusCode).json({
    error: {
      code: statusCode === 500 ? "INTERNAL_SERVER_ERROR" : err.type || "ERROR",
      message:
        statusCode === 500
          ? "เกิดข้อผิดพลาดที่ไม่คาดคิดภายในระบบ"
          : err.message,
    },
  });
});

app.listen(PORT, () => {
  console.log(
    `Server กำลังทำงานที่ http://localhost:${PORT} (${process.env.NODE_ENV})`,
  );
});
