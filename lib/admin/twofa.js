const { authenticator } = require("otplib");
const QRCode = require("qrcode");

const APP_ISSUER = String(process.env.APP_NAME || "AgentOS");

const generateTotpSecret = () => authenticator.generateSecret();

const buildOtpAuthUrl = ({ email, secret }) =>
  authenticator.keyuri(String(email || "admin@agentos.local"), APP_ISSUER, String(secret));

const verifyTotp = ({ secret, token }) => {
  const normalized = String(token || "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(normalized)) return false;
  return authenticator.check(normalized, String(secret || ""));
};

const buildQrDataUrl = async (otpauthUrl) => QRCode.toDataURL(String(otpauthUrl || ""));

module.exports = {
  APP_ISSUER,
  generateTotpSecret,
  buildOtpAuthUrl,
  verifyTotp,
  buildQrDataUrl
};
