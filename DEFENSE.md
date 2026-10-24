# แนวทางนำเสนอ Project Defense (5–7 นาที)

## Demo สด: Use Case จองโต๊ะ (ประมาณ 3–4 นาที)

1. เปิด `http://localhost:3000` และแสดงหน้าลูกค้าที่ดึงรายการเกมจาก API จริง; เปิด `http://localhost:3000/staff/login` แล้วลงชื่อเข้าใช้ก่อนเข้า `/staff`
2. ค้นหาตามจำนวนผู้เล่น เช่น 4 คน แล้วเปิดรายละเอียดเกมและรีวิว
3. เลือกเกม กรอกชื่อ/เบอร์/วันเวลา/จำนวนคน แล้วส่งคำขอจอง; ชี้ให้เห็นสถานะกำลังส่งและผลตรวจวันหยุดหรือ fallback
4. แสดงรายการจองที่โหลดจาก API แล้วเปลี่ยนสถานะเป็น “ยืนยันแล้ว” เพื่อสาธิตการเปลี่ยนแปลงข้อมูล
5. ส่งรีวิวเกมหนึ่งรายการ แล้วเปิดรายละเอียดเกมเพื่อแสดงรีวิว
6. ถ้ามีเวลา แสดงส่วนพนักงานเพิ่ม/แก้ไข/ลบเกมหรือหมวดหมู่ (การลบหมวดหมู่ที่ถูกใช้จะแสดง error จาก API)

## Architecture ที่ควรอธิบาย

- Frontend HTML/CSS/JavaScript เสิร์ฟจาก Express และเรียก API ด้วย relative URL
- Express API แยกข้อมูลเป็น `categories`, `boardgames`, `reviews`, `customers`, `reservations`, `reservation_games` ใน MySQL
- การจองบันทึกลูกค้า การจอง และเกมที่เลือกภายใน transaction เดียว; เรียก Nager.Date ก่อนขอ connection เพื่อไม่ถือ connection ระหว่างรอ
- การตรวจวันหยุดมี timeout/retry และ fallback เพราะบริการภายนอกเป็นข้อมูลเสริม ไม่ควรทำให้การจองล้ม
- API มี rate limit in-memory ต่อ client IP; ค่า default 1,000 requests/15 นาที (`RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS`) เผื่อการซ้อม demo; เมื่อมีหลาย API instances ต้องเปลี่ยนเป็น shared store
- OpenAPI YAML เป็นแหล่งของ Swagger UI ที่ `/api-docs`
- การจัดการ reservation/catalog รองรับ JWT Bearer และ staff session cookie สำหรับหน้าเว็บ; password เก็บเป็น scrypt hash. Signup ต้องใช้ `STAFF_SIGNUP_KEY`, token ลงนามด้วย `AUTH_SECRET` และหมดอายุใน 8 ชั่วโมง
- ระบบปัจจุบันยังเป็น monolith; `microservices-design.md` และ `scalability-design.md` เป็นแบบออกแบบ ไม่ใช่ implementation แยก process

## คำถามที่ควรเตรียมตอบ

- เหตุใดเลือก transaction สำหรับการจอง และ rollback เมื่อเกิดข้อผิดพลาดอย่างไร?
- ทำไม failure ของ Nager.Date ไม่ขัดขวางการบันทึก reservation?
- การค้นหาเกมใช้เงื่อนไข `max_players >= minPlayers` และ `min_players <= maxPlayers` อย่างไร?
- ตอนนี้มี test coverage เท่าใด และส่วนใดที่ยังไม่มี test? (รายงานเฉพาะ coverage ของ external service; route/DB/UI ยังไม่มี coverage)
- ข้อจำกัดปัจจุบันคืออะไร? (ยังไม่มี rate limiter, integration/UI test และยังไม่ได้แยก microservices; ต้องเตรียม MySQL ก่อน demo)

## ก่อนเข้าห้อง

1. กำหนด `.env` รวม DB credentials, `AUTH_SECRET` (อย่างน้อย 32 ตัวอักษร) และ `STAFF_SIGNUP_KEY`
2. เตรียมฐานข้อมูลตาม `schema.sql` และ `seed.sql`; ฐานข้อมูลเดิมใช้ `npm run migrate:auth`
3. สร้างบัญชีพนักงานล่วงหน้า แล้วตรวจว่า `/staff` ต้อง login จึงเข้าได้
4. รัน `npm test`, `npm start`; เปิดหน้าเว็บและ `/api-docs` ตรวจว่า MySQL ตอบสนอง

