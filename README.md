# Boardgame Café — Project Phase 3

ระบบจัดการบอร์ดเกม รีวิว และการจองโต๊ะ พร้อม frontend สำหรับลูกค้า/พนักงาน และการตรวจวันหยุดผ่าน Nager.Date

## เริ่มต้นใช้งาน

1. ใช้ MySQL สร้างฐานข้อมูลและตารางจาก `schema.sql`; เพิ่มข้อมูลตัวอย่างด้วย `seed.sql` (ไฟล์ schema เริ่มด้วย `DROP DATABASE` จึงลบฐานข้อมูลเดิมก่อนสร้าง)
2. คัดลอก `.env.example` เป็น `.env` แล้วกำหนด `PORT`, `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `ALLOWED_ORIGIN`, `AUTH_SECRET` (สุ่มค่าอย่างน้อย 32 ตัวอักษร) และ `STAFF_SIGNUP_KEY` (รหัสลับสำหรับเปิดบัญชีพนักงาน)
3. ติดตั้ง dependencies และรัน:

```bash
npm install
npm test
npm start
```

หน้าลูกค้า: `http://localhost:3000` · หน้าจัดการร้าน: `http://localhost:3000/staff` · Health: `http://localhost:3000/health` · Swagger UI: `http://localhost:3000/api-docs`

## บัญชีและสิทธิ์พนักงาน

- หลังตั้งค่า `.env` ให้รัน `npm run migrate:auth` กับฐานข้อมูลเดิมเพื่อเพิ่มตาราง `staff_users`; คำสั่งนี้ใช้ไดรเวอร์ของโปรเจกต์และไม่ต้องติดตั้ง MySQL CLI หากสร้างฐานข้อมูลใหม่ด้วย `schema.sql` ตารางนี้ถูกรวมไว้แล้ว
- เปิด `http://localhost:3000/staff/login` เลือก “สร้างบัญชีพนักงาน” แล้วกรอก `STAFF_SIGNUP_KEY`, ชื่อผู้ใช้ และรหัสผ่านอย่างน้อย 10 ตัวอักษร
- Login คืน JWT `access_token` อายุ 8 ชั่วโมงสำหรับ API clients (ส่ง `Authorization: Bearer <access_token>`) และตั้ง HttpOnly cookie อายุเท่ากันสำหรับหน้าเว็บ `/staff`
- หากสมัครไม่ผ่าน ให้ตรวจว่ารหัสเปิดรับสมัครตรงกับ `.env`; เปลี่ยนหรือเอา `STAFF_SIGNUP_KEY` ออกจาก `.env` เพื่อปิดการสมัครหลังสร้างบัญชีที่ต้องการแล้ว
- การดู/เปลี่ยนสถานะคำขอจองและการเพิ่ม แก้ไข ลบเกม/หมวดหมู่ ต้องเข้าสู่ระบบ ส่วนลูกค้ายังค้นหาเกม ส่งรีวิว และสร้างคำขอจองได้ตามเดิม
- ลบคำขอจองผ่าน Postman ได้ด้วย `DELETE {{baseUrl}}/api/v1/reservations/{{reservationId}}` โดยต้องมี JWT พนักงาน; เป็นการลบถาวรและลบแถวเกมที่เชื่อมกับคำขอนั้นด้วย
- หน้า `/staff` มีปุ่ม “ลบคำขอ” ในแต่ละรายการ ระบบถามยืนยันก่อนลบถาวร
- API มี in-memory rate limit แยกตาม IP; ค่าเริ่มต้น 1,000 requests ต่อ 15 นาที ปรับด้วย `RATE_LIMIT_MAX` และ `RATE_LIMIT_WINDOW_MS`; เกิน quota ได้ HTTP 429
- Postman/Newman: ตั้ง `staffUsername` และ `staffPassword` ใน environment แล้วรัน request `POST Staff Login` ก่อน request ที่จัดการข้อมูล; collection เก็บ JWT ใน `staffToken` และแนบ Bearer header ให้อัตโนมัติ

## โครงสร้าง backend

- `src/app.js` ประกอบ Express app, middleware, routes และ error handling โดยไม่เปิด port เอง
- `src/server.js` โหลด environment แล้วเปิด HTTP server; ใช้ `npm start` หรือ `npm run dev`
- `src/index.js` คงไว้เป็น compatibility entry point สำหรับ `node src/index.js`
- `src/middleware/` มี request ID, validation ตัวกรองจำนวนผู้เล่น, staff authentication, rate limiting และ error response กลาง

## API และข้อมูลโครงการ

- OpenAPI: `openapi.yaml`
- Database schema/seed: `schema.sql`, `seed.sql`
- Use cases และ domain: `requirement.md`
- Coverage: `coverage-report.md`
- CLO evidence / defense preparation: `clo-requirements-checklist.md`, `DEFENSE.md`
- Week 13–14 architecture and scaling notes: `microservices-design.md`, `scalability-design.md`
- Postman collection/environment: `postman_collection.json`, `environment.json`
- Failure scenario ของบริการวันหยุด: `test-failure-scenarios.js` และผลเดิม `failure-scenario-results.md`

## ขอบเขตปัจจุบัน

การจัดการหลังบ้านจำกัดด้วยบัญชีพนักงาน แต่ระบบปัจจุบันยังเป็น monolith; microservices เป็น target design ในเอกสารเท่านั้น, rate limiter เป็น in-memory ต่อ process และ automated tests ใช้ Node built-in runner (ยังไม่มี Jest/Supertest หรือ DB/UI integration suite)
