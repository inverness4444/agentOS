const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const getSuperAdminAllowlist = () =>
  String(process.env.SUPER_ADMIN_EMAILS || "")
    .split(",")
    .map((item) => normalizeEmail(item))
    .filter(Boolean);

const isAllowlistedSuperAdminEmail = (email) => {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  return getSuperAdminAllowlist().includes(normalized);
};

module.exports = {
  normalizeEmail,
  getSuperAdminAllowlist,
  isAllowlistedSuperAdminEmail
};
