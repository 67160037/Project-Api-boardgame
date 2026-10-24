const { sendError } = require("./http-errors");

function parsePlayerFilters(req, res, next) {
  const filters = {};
  for (const key of ["minPlayers", "maxPlayers"]) {
    const raw = req.query[key];
    if (raw === undefined || raw === "") continue;

    if (typeof raw !== "string") {
      return sendError(
        res,
        400,
        "VALIDATION_ERROR",
        `${key} ต้องระบุเป็นค่าเดียว`,
      );
    }

    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < 1) {
      return sendError(
        res,
        400,
        "VALIDATION_ERROR",
        `${key} ต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป`,
      );
    }
    filters[key] = value;
  }

  if (
    filters.minPlayers !== undefined &&
    filters.maxPlayers !== undefined &&
    filters.minPlayers > filters.maxPlayers
  ) {
    return sendError(
      res,
      400,
      "VALIDATION_ERROR",
      "minPlayers ต้องไม่มากกว่า maxPlayers",
    );
  }

  req.playerFilters = filters;
  return next();
}

module.exports = { parsePlayerFilters };
