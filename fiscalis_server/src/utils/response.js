// src/utils/response.js
const ok = (res, data = null, message = "Success", code = 200) =>
  res.status(code).json({ success: true, message, data });

const fail = (res, message = "Error", code = 400, data = null) =>
  res.status(code).json({ success: false, message, data });

module.exports = { ok, fail };
