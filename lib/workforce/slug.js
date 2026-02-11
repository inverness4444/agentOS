const { prisma } = require("../prisma.js");

const slugify = (value) => {
  const raw = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "");
  return raw || "workflow";
};

const ensureUniqueWorkflowSlug = async (userId, baseSlug, excludeWorkflowId) => {
  let slug = slugify(baseSlug);
  let suffix = 2;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await prisma.workforceWorkflow.findFirst({
      where: {
        userId,
        slug,
        ...(excludeWorkflowId ? { id: { not: excludeWorkflowId } } : {})
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

module.exports = { slugify, ensureUniqueWorkflowSlug };
