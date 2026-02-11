const { prisma } = require("../prisma.js");

const toNullableText = (value, max = 2000) => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.slice(0, max);
};

const toJson = (value) => {
  if (value === undefined || value === null) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ warning: "metadata_serialization_failed" });
  }
};

const logAdminAction = async ({
  actorUserId,
  actionType,
  targetUserId = null,
  targetTxId = null,
  metadata = null,
  ip = null,
  userAgent = null
}) => {
  if (!actorUserId || !actionType) return null;

  return prisma.adminActionLog.create({
    data: {
      actorUserId: String(actorUserId),
      actionType: String(actionType).slice(0, 120),
      targetUserId: toNullableText(targetUserId, 191),
      targetTxId: toNullableText(targetTxId, 191),
      metadataJson: toJson(metadata),
      ip: toNullableText(ip, 120),
      userAgent: toNullableText(userAgent, 500)
    }
  });
};

module.exports = {
  logAdminAction
};
