const { randomUUID } = require("node:crypto");

function requestContext(req, res, next) {
  req.id = randomUUID();
  res.setHeader("X-Request-ID", req.id);
  next();
}

module.exports = { requestContext };
