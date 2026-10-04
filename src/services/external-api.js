// โครงงานระยะที่ 2 ส่วนที่ 2 (สัปดาห์ที่ 11): เรียก API ภายนอกอย่างทนทานต่อความผิดพลาด
// ใช้ Nager.Date (API สาธารณะ ไม่ต้องใช้ key) ตรวจว่าวันที่จองตรงกับวันหยุดราชการไทยหรือไม่
// เพื่อให้ร้านเตรียมรับลูกค้าจำนวนมากในวันหยุด
const axios = require("axios");

// ค่าตั้งต้น ปรับได้ผ่าน .env (ใช้ตอนทดสอบ failure scenario)
const BASE_URL = process.env.HOLIDAY_API_URL || "https://date.nager.at/api/v3";
const TIMEOUT_MS = Number(process.env.EXTERNAL_TIMEOUT_MS) || 3000; // Timeout ต่อ 1 ครั้งที่เรียก
const MAX_RETRIES =
  process.env.EXTERNAL_MAX_RETRIES !== undefined
    ? Number(process.env.EXTERNAL_MAX_RETRIES)
    : 2; // ลองใหม่ 2 ครั้ง (รวมเรียกสูงสุด 3 ครั้ง)
const BASE_DELAY_MS = Number(process.env.EXTERNAL_RETRY_DELAY_MS) || 300; // exponential backoff: 300, 600, ...

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ควรลองใหม่เฉพาะ network error / timeout / 5xx เท่านั้น (4xx คือคำขอผิด ลองใหม่ก็ไม่หาย)
function isRetryable(err) {
  if (!err.response) return true; // ไม่มี response = network error หรือ timeout
  return err.response.status >= 500;
}

// เรียก GET พร้อม Timeout + Retry (exponential backoff) คืน { data, attempts } หรือ throw เมื่อล้มเหลวครบทุกครั้ง
async function getWithRetry(url) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    try {
      const res = await axios.get(url, { timeout: TIMEOUT_MS });
      return { data: res.data, attempts: attempt };
    } catch (err) {
      lastErr = err;
      const reason =
        err.code || (err.response && err.response.status) || err.message;
      console.warn(
        `[external-api] ครั้งที่ ${attempt}/${MAX_RETRIES + 1} ล้มเหลว (${reason})`,
      );
      if (!isRetryable(err) || attempt === MAX_RETRIES + 1) break;
      await sleep(BASE_DELAY_MS * 2 ** (attempt - 1));
    }
  }
  throw lastErr;
}

// ตรวจวันหยุดราชการ — ไม่ throw เสมอ: ถ้า API ล้มเหลวจะ fallback เป็นผลที่บอกว่า "ตรวจสอบไม่ได้"
// เพื่อให้การจองโต๊ะยังสำเร็จตามปกติ ไม่ผูกความสำเร็จของระบบกับบริการภายนอก
async function checkHoliday(dateStr) {
  if (typeof dateStr !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return {
      checked: false,
      is_holiday: null,
      source: "skipped",
      note: "รูปแบบวันที่ไม่ถูกต้อง จึงไม่ได้ตรวจสอบวันหยุด",
    };
  }
  const year = dateStr.slice(0, 4);
  try {
    const { data, attempts } = await getWithRetry(
      `${BASE_URL}/PublicHolidays/${year}/TH`,
    );
    const found = Array.isArray(data)
      ? data.find((h) => h.date === dateStr)
      : null;
    return {
      checked: true,
      is_holiday: Boolean(found),
      holiday_name: found ? found.localName : null,
      source: "api",
      attempts,
    };
  } catch (err) {
    console.error(
      `[external-api] fallback: ตรวจวันหยุดไม่ได้ (${err.code || err.message})`,
    );
    return {
      checked: false,
      is_holiday: null,
      source: "fallback",
      note: "ไม่สามารถตรวจสอบวันหยุดได้ในขณะนี้ แต่การจองของคุณถูกบันทึกเรียบร้อยแล้ว",
    };
  }
}

module.exports = { checkHoliday, getWithRetry };
