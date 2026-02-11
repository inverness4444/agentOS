const { safeEqual } = require("./security.js");

const isSuperAdmin = (role) => String(role || "").toUpperCase() === "SUPER_ADMIN";
const isActiveUser = (status) => String(status || "").toUpperCase() === "ACTIVE";

const requireSuperAdminCore = ({ role, status }) => {
  if (!isSuperAdmin(role)) {
    return { ok: false, code: "FORBIDDEN", status: 403 };
  }
  if (!isActiveUser(status)) {
    return { ok: false, code: "USER_BLOCKED", status: 403 };
  }
  return { ok: true };
};

const verifyCsrfCore = ({ headerToken, cookieToken }) => {
  const left = String(headerToken || "");
  const right = String(cookieToken || "");
  if (!left || !right) return false;
  return safeEqual(left, right);
};

module.exports = {
  isSuperAdmin,
  isActiveUser,
  requireSuperAdminCore,
  verifyCsrfCore
};
