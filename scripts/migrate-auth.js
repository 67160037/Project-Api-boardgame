require("dotenv").config();
const mysql = require("mysql2/promise");

async function main() {
  const required = ["DB_HOST", "DB_USER", "DB_NAME"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) throw new Error(`กรุณาตั้งค่า ${missing.join(", ")} ใน .env`);

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME,
  });
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS staff_users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        password_hash VARCHAR(200) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log(`สร้าง/ตรวจสอบตาราง staff_users ในฐานข้อมูล ${process.env.DB_NAME} สำเร็จ`);
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(`Migration ไม่สำเร็จ: ${error.code || error.message}`);
  process.exitCode = 1;
});
