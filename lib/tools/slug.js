const { prisma } = require("../prisma.js");

const slugify = (value) => {
  const raw = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "");
  return raw || "tool";
};

const ensureUniqueSlug = async (userId, baseSlug, excludeToolId) => {
  let slug = slugify(baseSlug);
  let suffix = 2;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await prisma.tool.findFirst({
      where: {
        userId,
        slug,
        ...(excludeToolId ? { id: { not: excludeToolId } } : {})
      },
      select: { id: true }
    });
    if (!existing) {
      return slug;
    }
    slug = `${slugify(baseSlug)}-${suffix}`;
    suffix += 1;
  }
};

module.exports = { slugify, ensureUniqueSlug };
