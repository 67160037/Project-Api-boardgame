function sendError(res, statusCode, code, message) {
  return res.status(statusCode).json({ error: { code, message } });
}

function notFound(req, res) {
  return sendError(res, 404, "ROUTE_NOT_FOUND", "ไม่พบเส้นทางที่ร้องขอ");
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  const statusCode = err.status || err.statusCode || 500;
  const isInternalError = statusCode >= 500;
  if (isInternalError) {
    console.error(`[${req.id || "no-request-id"}]`, err.stack || err);
  }

  const code = isInternalError
    ? "INTERNAL_SERVER_ERROR"
    : err.type || err.code || "ERROR";
  const message = isInternalError
    ? "เกิดข้อผิดพลาดที่ไม่คาดคิดภายในระบบ"
    : err.message || "คำขอไม่ถูกต้อง";

  return sendError(res, statusCode, code, message);
}

module.exports = { sendError, notFound, errorHandler };
