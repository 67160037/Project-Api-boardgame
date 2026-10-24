# Test Coverage Baseline — Phase 3

วันที่รัน: 24 ตุลาคม 2026 · คำสั่ง: `npm test` · Runtime: Node.js v24.14.0

## ผลการรัน

| ชุดทดสอบ | ผล | ขอบเขต |
| --- | --- | --- |
| `test/external-api.test.js` | ผ่าน 4/4 | ตรวจการตอบสำเร็จ, วันที่ไม่ถูกต้อง, retry เมื่อได้ 503 และ fallback เมื่อ upstream ล้มเหลว |
| `test/middleware.test.js` | ผ่าน 7/7 | ตรวจ player-filter validation, request ID และรูปแบบ error response |
| `test/staff-auth.test.js` | ผ่าน 4/4 | ตรวจ JWT Bearer valid/invalid/expired, HttpOnly session cookie, การปฏิเสธ cookie ผิด/ไม่มี และ password hash/verify |
| `test/staff-routes.test.js` | ผ่าน 2/2 | ตรวจว่า POST review เป็น public แต่ mutation ของ boardgame ต้องมี staff auth |
| `test/rate-limit.test.js` | ผ่าน 2/2 | ตรวจ quota, 429, Retry-After, reset window และแยก quota ตาม IP |
| รวม `npm test` | ผ่าน 19/19 | Node.js built-in test runner; ชุดนี้ไม่ใช่ Jest/Supertest |
| `test-failure-scenarios.js` (W13/W14 เดิม) | ไม่ได้รวมใน `npm test` | เป็นสคริปต์ทดสอบ end-to-end ที่ต้องมี MySQL และเริ่ม/หยุด API เอง; ใน ZIP ระยะก่อนหน้าไม่พบชุดทดสอบ W9 แยกต่างหาก ผลเดิม 8 สถานการณ์อ้างอิงได้จาก `failure-scenario-results.md` (4 ต.ค. 2026) แต่ไม่ได้รันซ้ำใน baseline นี้ |

## Coverage ที่วัดได้

Node.js built-in test coverage วัดไฟล์ที่ถูกโหลดและผ่านการทดสอบในชุดปัจจุบัน:

| ไฟล์ | Lines | Branches | Functions |
| --- | ---: | ---: | ---: |
| `src/middleware/http-errors.js` | 92.86% | 30.77% | 100.00% |
| `src/middleware/player-filters.js` | 100.00% | 90.91% | 100.00% |
| `src/middleware/rate-limit.js` | 94.29% | 72.73% | 100.00% |
| `src/middleware/request-context.js` | 100.00% | 100.00% | 100.00% |
| `src/services/external-api.js` | 100.00% | 67.86% | 100.00% |
| `src/middleware/staff-auth.js` | 100.00% | 82.22% | 100.00% |
| `src/middleware/staff-routes.js` | 100.00% | 77.78% | 100.00% |
| `src/services/passwords.js` | 100.00% | 75.00% | 100.00% |
| รวมไฟล์ที่ถูกรายงาน | 98.75% | 73.17% | 100.00% |

สามไฟล์ที่มี branch coverage ต่ำสุดในรอบนี้คือ `http-errors.js` (30.77%), `external-api.js` (67.86%) และ `rate-limit.js` (72.73%); กรณีที่ยังไม่ครอบคลุมเป็น error/branch edges ที่ระบุด้านล่าง

ตัวเลขนี้ **ไม่ใช่ coverage ของทั้งระบบ** เพราะชุดทดสอบปัจจุบันไม่ได้โหลด `src/app.js` และไม่ได้ instrument frontend/SQL จึงยังไม่มีเปอร์เซ็นต์ coverage สำหรับ auth/signup/login DB operations, route handlers, transaction การจอง, การเข้าถึงฐานข้อมูล และ UI. Course handout แนะนำ Jest/Supertest; โครงการนี้ยังใช้ Node built-in runner

## ช่องว่างที่ควรทดสอบเพิ่ม

- API integration ทุก route: HTTP status/body, validation, 404/409, query filters และการจัดการ DB error
- transaction การจอง: rollback เมื่อ customer/reservation/game link insert ล้มเหลว และการอ้างอิงเกมที่ไม่มีอยู่จริง
- route ที่เพิ่งเพิ่ม/ปรับปรุง: `/health`, หน้า frontend root และการส่งไฟล์ static
- frontend: loading/error, validation ก่อน submit, สร้างรีวิว/จอง/ปรับสถานะ และการแสดงผลเมื่อ API ใช้งานไม่ได้
- middleware branches ที่ยังไม่ครอบคลุม เช่น response headers ถูกส่งไปแล้ว และ error ภายใน 500
- external service branches ที่ยังไม่ครอบคลุม เช่น upstream 4xx, network error, timeout และข้อมูลตอบกลับที่ไม่ใช่ array

## Integration smoke check

ตรวจซ้ำหลังเตรียม MySQL บน port 3182: `GET /`, `GET /staff`, `GET /health`, `GET /api/v1/boardgames?minPlayers=3`, `GET /api/v1/categories` และ `GET /api/v1/reservations` ตอบ 200; ตัวกรองผิดรูปแบบ `GET /api/v1/boardgames?minPlayers=abc` ตอบ 400; response มี `X-Request-ID` การตรวจนี้ไม่ได้ยิงคำขอเขียนข้อมูล (POST/PATCH/DELETE)

หมายเหตุ: การตรวจรอบแรกก่อนฐานข้อมูลพร้อมเคยได้ 500 จาก `GET /api/v1/boardgames`; ผลล่าสุดข้างต้นเป็นผลหลังฐานข้อมูลเชื่อมต่อได้

## การรันซ้ำ

```bash
npm test
npm run coverage
```

สคริปต์ failure scenario เดิมรันแยกด้วย `node test-failure-scenarios.js` หลังตั้งค่า `.env` และเปิด MySQL พร้อมใช้งาน เพราะแต่ละสถานการณ์สร้าง reservation จริง
