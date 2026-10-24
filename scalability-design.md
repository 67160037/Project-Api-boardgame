# Scalability and Migration Design — Boardgame & Brew Café

## Current baseline

- Express process เดียวเสิร์ฟ frontend และ REST API; MySQL เก็บข้อมูลทั้งหมดใน `boardgame_db`
- pool จำกัด connection 10; การจองใช้ transaction และดึงเกมของแต่ละ reservation แยก query
- การตรวจ holiday เรียก upstream ก่อนขอ database connection, timeout 3 วินาที/ครั้ง, retry สูงสุด 2 ครั้ง และ fallback
- การยืนยันพนักงานใช้ signed HttpOnly cookie; secret มาจาก environment
- API มี in-memory per-IP rate limiter ปรับ `RATE_LIMIT_MAX`/`RATE_LIMIT_WINDOW_MS` ได้ (ค่าเริ่มต้น 1,000 requests/15 นาที)

## เมื่อปริมาณเพิ่มขึ้น 10 เท่า

1. Query รายการจองอาจช้าจาก N+1 query ใน `GET /api/v1/reservations`; เปลี่ยนเป็น join/aggregate พร้อม pagination และตรวจ query plan
2. MySQL connection pool/CPU จะเป็นคอขวดก่อนเมื่อมี Express หลาย instance; กำหนด pool ต่อ instance, วัด pool saturation และใช้ connection budget ที่สัมพันธ์กับ `max_connections`
3. เพิ่ม index ตามรูปแบบค้นหาจริง (วันที่/สถานะ/foreign key) หลังตรวจ `EXPLAIN`; หลีกเลี่ยง index ที่ไม่รองรับ query และเพิ่มภาระเขียน
4. แยก static frontend ไป CDN ได้; เพิ่ม stateless Express instances หลัง reverse proxy โดย session cookie ที่ลงนามด้วย AUTH_SECRET ใช้ร่วมกันได้เมื่อทุก instance ใช้ secret เดียวและ clock sync
5. Rate limiter แบบ in-memory จะไม่ใช้ quota ร่วมกันระหว่างหลาย instance; ก่อน scale แนวนอนให้เปลี่ยนเป็น Redis/shared store และตั้งค่า limit ให้รองรับ demo/production
6. Cache รายการ catalog ที่อ่านบ่อยได้เมื่อมี invalidation strategy; ห้าม cache สถานะ reservation ที่ต้องเป็นข้อมูลล่าสุดโดยไม่มีข้อกำหนดชัดเจน

## Migration and rollout approach

| การเปลี่ยนแปลง | วิธี migrate | ความเสี่ยง/rollback |
| --- | --- | --- |
| เพิ่มบัญชีพนักงาน | `npm run migrate:auth` สร้าง `staff_users` แบบ `IF NOT EXISTS`; schema ใหม่มีตารางนี้แล้ว | additive และรันซ้ำได้; rollback คือหยุดใช้บัญชี/สำรองและลบตารางเมื่อแน่ใจว่าไม่ต้องใช้ |
| เพิ่ม index/column ในอนาคต | migration ใหม่แบบ additive ก่อน deploy โค้ดที่อ่าน field; backfill เป็น batch แล้วค่อยบังคับ constraint | อย่าแก้ schema.sql ที่มี `DROP DATABASE` เพื่อ migrate ฐานข้อมูลจริง; rollback ใช้ migration เฉพาะทางและ backup |
| แยก bounded context | เริ่มด้วย schema ownership และ API contract; dual-read/write เฉพาะช่วงย้ายที่ออกแบบชัดเจน, backfill, เปรียบเทียบผล แล้วสลับ traffic ผ่าน gateway | เตรียม compatibility window, idempotency, observability และแผนย้อน traffic ก่อนย้ายข้อมูล |

## ข้อจำกัด/งานต่อ

ระบบปัจจุบันยังไม่มี pagination/cache/rate limiter แบบ distributed และยังเป็น monolith; เอกสารนี้เป็นแผน scale ไม่ใช่การอ้างว่าฟีเจอร์เหล่านั้นถูกติดตั้งแล้ว ควรเพิ่ม metrics, load test และ migration versioning ก่อนใช้งานจริงใน production
