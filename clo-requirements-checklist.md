# CLO Requirements Checklist — Phase 3

อ้างอิง requirement ใน `wk15-project-phase3.md` และระบบ Boardgame Café (Pno 8)

| CLO / ข้อกำหนด | สถานะ | หลักฐานใน repo |
| --- | --- | --- |
| CLO8 — ระบบรวมทำงานกับ MySQL | 🟡 ต้องยืนยันในเครื่อง demo | `src/app.js`, `src/db.js`, `schema.sql`, `seed.sql`; ต้องใช้ `.env` และฐานข้อมูลพร้อม |
| CLO8 — Authentication และ migration | ✅ มี staff signup/login, scrypt password hash, JWT Bearer + HttpOnly cookie; migration รันซ้ำได้ | `src/middleware/staff-auth.js`, `src/services/passwords.js`, `scripts/migrate-auth.js`, `migrate-auth.sql`, `schema.sql` |
| CLO8 — ไม่มี merge conflict marker | ✅ ตรวจในไฟล์ source/docs แล้ว | ตรวจซ้ำก่อนส่งด้วย `rg -n '<<<<<<<|=======|>>>>>>>' --glob '*.js' --glob '*.yaml' .` |
| CLO8 — OpenAPI สอดคล้องกับ routes | ✅ YAML parse ผ่าน; paths/methods และ protected operations เทียบกับ `src/app.js`; ระบุ cookie/JWT auth และ 401, ส่วน 429 อธิบายใน contract ระดับ API | `openapi.yaml`, routes ใน `src/app.js`, Swagger UI `/api-docs` |
| CLO8 — Tests/coverage | ✅ มี Node built-in tests; ไม่ได้ใช้ Jest/Supertest | `test/`, คำสั่ง `npm test`; coverage report ระบุเฉพาะ modules ที่ถูกโหลด |
| CLO8 — Resilience ของ external API | ✅ timeout/retry/fallback สำหรับ Nager.Date | `src/services/external-api.js`, `test/external-api.test.js` |
| CLO8 — Rate limiting | ✅ มี in-memory per-IP limiter และ quota ปรับได้; default 1,000 requests/15 นาที | `src/middleware/rate-limit.js`, `test/rate-limit.test.js`, `.env.example` |
| CLO8 — Migration/scalability design | ✅ เอกสารกับ additive auth migration | `scalability-design.md`, `scripts/migrate-auth.js` |
| CLO8 — Microservices design | ✅ เป็นเอกสาร target design; implementation ยังเป็น monolith | `microservices-design.md` |
| CLO6 — Frontend ใช้ API พร้อม loading/error | ✅ ลูกค้าและพนักงานเรียกหลาย endpoints; staff writes ต้อง auth | `frontend/app.js`, `frontend/staff.js`, `frontend/staff-login.js` |
| CLO7 — Demo และคำตอบป้องกัน | 🟡 เตรียมแนวทาง; ต้องซ้อม/นำเสนอจริง | `DEFENSE.md` |
| CLO8 — Checklist พร้อมหลักฐาน | ✅ | เอกสารนี้ |
| CLO6 — Frontend เรียก API จริงอย่างน้อย 3 endpoints และมี GET + mutation | ✅ | `frontend/app.js`: อ่านเกม/รายละเอียด/รีวิว/หมวดหมู่/การจอง และเพิ่มแก้ไขลบเกม/หมวดหมู่/รีวิว/จอง/เปลี่ยนสถานะ |
| CLO6 — loading/error state และแบบฟอร์มตรวจข้อมูล | ✅ | `frontend/app.js` และ `frontend/index.html`: live status, `required`, type/length constraints และตรวจเบอร์/วันที่ก่อนส่ง |
| CLO7 — Demo สดอย่างน้อยหนึ่ง use case | 🟡 เตรียม flow แล้ว; ต้องนำเสนอจริง | `DEFENSE.md`: live-demo walkthrough สำหรับค้นหาเกม → จอง → ตรวจรายการ → เปลี่ยนสถานะ |
| CLO7 — อธิบาย architecture และตอบคำถาม | 🟡 เตรียมโน้ตแล้ว; ประเมินโดยผู้สอนขณะนำเสนอ | `DEFENSE.md` สรุป architecture, transaction, retry/fallback และข้อจำกัด |

## ช่องว่างที่ยังต้องแจ้งในการนำเสนอ

- Rate limiter เก็บ quota ใน memory ของ process เดียว; หากขยายหลาย instance ต้องใช้ shared store เช่น Redis; ระบบ microservices เป็นแบบออกแบบในเอกสารเท่านั้น
- Automated tests ยังไม่ใช่ Jest/Supertest และยังไม่มี route/database integration tests หรือ frontend/UI tests
- Coverage เป็นเฉพาะไฟล์ source ที่ test โหลด ไม่ใช่ coverage ทั้งระบบ
- ก่อนสาธิตต้องมี MySQL, migration/seed, `.env` ครบ และบัญชีพนักงานพร้อมล็อกอิน
