// สคริปต์ทดสอบ Failure Scenario ของโครงงานระยะที่ 2 ส่วนที่ 2
// วิธีรัน: ต้องเปิดฐานข้อมูล MySQL ไว้ก่อน แล้วรัน  node test-failure-scenarios.js
// สคริปต์จะ (1) เปิด API ภายนอกจำลองหลายโหมดที่พอร์ต 4011 (2) สตาร์ตเซิร์ฟเวอร์จริงที่พอร์ต 3100 ทีละสถานการณ์
// (3) ยิง POST /api/v1/reservations แล้ววัดเวลา / จำนวนครั้งที่เรียก API ภายนอก / ผลที่ผู้ใช้ได้รับ
const http = require("http");
const { spawn } = require("child_process");

const MOCK_PORT = 4011;
const APP_PORT = 3100;
const holidayData = JSON.stringify([
  {
    date: "2026-12-10",
    localName: "วันรัฐธรรมนูญ",
    name: "Constitution Day",
    countryCode: "TH",
  },
]);
const hits = {};

// ---- API ภายนอกจำลอง ----
const mock = http.createServer((req, res) => {
  const mode = req.url.split("/")[1];
  hits[mode] = (hits[mode] || 0) + 1;
  const n = hits[mode];
  res.setHeader("Content-Type", "application/json");
  if (mode === "ok") return res.end(holidayData);
  if (mode === "err500") {
    res.statusCode = 500;
    return res.end("{}");
  }
  if (mode === "err404") {
    res.statusCode = 404;
    return res.end("{}");
  }
  if (mode === "slow") return setTimeout(() => res.end(holidayData), 20000); // ตอบช้ากว่า timeout
  if (mode === "flaky") {
    // ล้ม (503) 2 ครั้งแรก แล้วกลับมาปกติ
    if (n <= 2) {
      res.statusCode = 503;
      return res.end("{}");
    }
    return res.end(holidayData);
  }
  res.statusCode = 400;
  res.end("{}");
});

const scenarios = [
  {
    name: "S1 ปกติ (API ตอบทันที)",
    url: `http://127.0.0.1:${MOCK_PORT}/ok`,
    mode: "ok",
  },
  {
    name: "S2 API ล้ม 2 ครั้ง (503) แล้วหาย → Retry สำเร็จ",
    url: `http://127.0.0.1:${MOCK_PORT}/flaky`,
    mode: "flaky",
  },
  {
    name: "S3 API ตอบ 500 ตลอด → Retry ครบแล้ว Fallback",
    url: `http://127.0.0.1:${MOCK_PORT}/err500`,
    mode: "err500",
  },
  {
    name: "S4 API ตอบ 404 (คำขอผิด) → ไม่ Retry แล้ว Fallback",
    url: `http://127.0.0.1:${MOCK_PORT}/err404`,
    mode: "err404",
  },
  {
    name: "S5 API ตอบช้าเกิน Timeout 3 วินาที (ค่าเริ่มต้น)",
    url: `http://127.0.0.1:${MOCK_PORT}/slow`,
    mode: "slow",
  },
  {
    name: "S6 API ตอบช้า ตั้ง Timeout 1 วินาที",
    url: `http://127.0.0.1:${MOCK_PORT}/slow`,
    mode: "slow",
    env: { EXTERNAL_TIMEOUT_MS: "1000" },
  },
  {
    name: "S7 เชื่อมต่อไม่ได้ (พอร์ตปิด / จำลองไม่มีเครือข่าย)",
    url: "http://127.0.0.1:9",
    mode: null,
  },
  {
    name: "S8 โดเมนไม่มีอยู่จริง (DNS ล้มเหลว)",
    url: "http://nager-not-exist.invalid/api/v3",
    mode: null,
    env: {
      NO_PROXY: "*",
      no_proxy: "*",
      HTTP_PROXY: "",
      HTTPS_PROXY: "",
      http_proxy: "",
      https_proxy: "",
    },
  },
];

function post(phone) {
  const body = JSON.stringify({
    customer_name: "ทดสอบ Failure",
    customer_phone: phone,
    reservation_date: "2026-12-10",
    reservation_time: "18:00",
    party_size: 2,
  });
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port: APP_PORT,
        path: "/api/v1/reservations",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let text = "";
        res.on("data", (c) => (text += c));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            ms: Date.now() - started,
            json: JSON.parse(text),
          }),
        );
      },
    );
    req.on("error", reject);
    req.end(body);
  });
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function runScenario(s, i) {
  if (s.mode) hits[s.mode] = 0;
  const logs = [];
  const child = spawn("node", ["src/index.js"], {
    env: {
      ...process.env,
      PORT: String(APP_PORT),
      HOLIDAY_API_URL: s.url,
      ...(s.env || {}),
    },
  });
  const grab = (d) =>
    d
      .toString()
      .split("\n")
      .filter((l) => l.includes("[external-api]"))
      .forEach((l) => logs.push(l.trim()));
  child.stdout.on("data", grab);
  child.stderr.on("data", grab);
  await wait(1500);
  const r = await post(`081000${String(i).padStart(4, "0")}`);
  child.kill();
  await wait(300);
  return { s, r, logs, apiHits: s.mode ? hits[s.mode] : "-" };
}

(async () => {
  await new Promise((r) => mock.listen(MOCK_PORT, r));
  console.log(
    "# ผลทดสอบ Failure Scenario (รันเมื่อ " + new Date().toISOString() + ")\n",
  );
  for (let i = 0; i < scenarios.length; i++) {
    const { s, r, logs, apiHits } = await runScenario(scenarios[i], i + 1);
    console.log(`## ${s.name}`);
    console.log(
      `- HOLIDAY_API_URL = ${s.url}${s.env ? "  (env เพิ่มเติม: " + JSON.stringify(s.env) + ")" : ""}`,
    );
    console.log(
      `- HTTP ที่ผู้ใช้ได้รับ: ${r.status} | ใช้เวลา: ${(r.ms / 1000).toFixed(2)} วินาที | API ภายนอกถูกเรียก: ${apiHits} ครั้ง`,
    );
    console.log(`- holiday_check: ${JSON.stringify(r.json.holiday_check)}`);
    console.log(
      `- log ของระบบ:\n${logs.map((l) => "    " + l).join("\n") || "    (ไม่มี warning)"}\n`,
    );
  }
  mock.close();
  process.exit(0);
})();
