const { requireStaff } = require("./staff-auth");

function protectBoardgameMutations(req, res, next) {
  const path = (req.originalUrl || req.url || "").split("?")[0];
  const isCreateGame = req.method === "POST" && path === "/api/v1/boardgames";
  const isUpdateOrDeleteGame = ["PATCH", "DELETE"].includes(req.method) && /^\/api\/v1\/boardgames\/\d+$/.test(path);
  if (isCreateGame || isUpdateOrDeleteGame) return requireStaff(req, res, next);
  return next();
}

module.exports = { protectBoardgameMutations };
