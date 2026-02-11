#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const resolvePath = (...parts) => path.join(root, ...parts);

const results = [];

const readText = (filePath) => {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
};

const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
};

const checkFileExists = (relativePath) => {
  const fullPath = resolvePath(relativePath);
  const exists = fs.existsSync(fullPath);
  check(`file:${relativePath}`, exists, exists ? "" : "missing file");
};

const publicPages = [
  { route: "/", file: "app/page.tsx" },
  { route: "/pricing", file: "app/pricing/page.tsx" },
  { route: "/faq", file: "app/faq/page.tsx" },
  { route: "/terms", file: "app/terms/page.tsx" },
  { route: "/privacy", file: "app/privacy/page.tsx" },
  { route: "/contacts", file: "app/contacts/page.tsx" },
  { route: "/demo", file: "app/demo/page.tsx" }
];

const privatePages = [
  "app/(app)/layout.tsx",
  "app/login/page.tsx",
  "app/register/page.tsx",
  "app/auth/verify-request/page.tsx",
  "app/checkout/page.tsx",
  "app/workflows/layout.tsx"
];

const mustExist = [
  "app/layout.tsx",
  "app/robots.ts",
  "app/sitemap.ts",
  "app/manifest.ts",
  "lib/seo/metadata.ts",
  "lib/seo/schema.ts",
  "components/seo/JsonLd.tsx",
  "components/seo/Analytics.tsx",
  "public/og/agentos-og.svg",
  "public/og/agentos-og-fallback.svg",
  "public/icons/icon.svg",
  "public/icons/apple-touch-icon.svg"
];

mustExist.forEach(checkFileExists);

publicPages.forEach(({ route, file }) => {
  const fullPath = resolvePath(file);
  const content = readText(fullPath);
  const hasMetadataHelper = content.includes("buildPageMetadata({");
  const hasPath = route === "/" ? content.includes('path: "/"') : content.includes(`path: "${route}"`);
  check(`public_metadata:${file}`, hasMetadataHelper, hasMetadataHelper ? "" : "buildPageMetadata missing");
  check(`public_canonical_path:${file}`, hasPath, hasPath ? "" : `path for ${route} missing`);
});

privatePages.forEach((file) => {
  const content = readText(resolvePath(file));
  const hasNoindex =
    content.includes("privateRobots") || content.includes("noIndex: true") || content.includes("robots: privateRobots");
  check(`private_noindex:${file}`, hasNoindex, hasNoindex ? "" : "noindex/private robots missing");
});

const robots = readText(resolvePath("app/robots.ts"));
const robotsChecks = [
  robots.includes("sitemap.xml"),
  robots.includes('"/api/"'),
  robots.includes('"/admin"'),
  robots.includes('"/board"')
];
check(
  "robots_rules",
  robotsChecks.every(Boolean),
  robotsChecks.every(Boolean) ? "" : "missing disallow rules or sitemap"
);

const sitemap = readText(resolvePath("app/sitemap.ts"));
const expectedRoutes = ["/", "/pricing", "/faq", "/terms", "/privacy", "/contacts", "/demo"];
const missingInSitemap = expectedRoutes.filter((route) => !sitemap.includes(`"${route}"`));
check(
  "sitemap_public_routes",
  missingInSitemap.length === 0,
  missingInSitemap.length === 0 ? "" : `missing routes: ${missingInSitemap.join(", ")}`
);

const home = readText(resolvePath("app/page.tsx"));
check(
  "schema_home",
  home.includes("JsonLd") && home.includes("buildOrganizationSchema") && home.includes("buildWebApplicationSchema"),
  "home page should include organization/webapplication schema"
);

const pricing = readText(resolvePath("app/pricing/page.tsx"));
check("schema_pricing", pricing.includes("buildProductSchema"), "pricing page should include product schema");

const faq = readText(resolvePath("app/faq/page.tsx"));
check("schema_faq", faq.includes("buildFaqSchema"), "faq page should include FAQ schema");

const packageJson = JSON.parse(readText(resolvePath("package.json")) || "{}");
const hasScript = Boolean(packageJson.scripts && packageJson.scripts["seo:check"]);
check("package_script:seo:check", hasScript, hasScript ? "" : "missing seo:check script");

const passed = results.filter((item) => item.ok).length;
const failed = results.length - passed;

console.log("\nSEO check report");
console.log("=".repeat(60));
results.forEach((item) => {
  const icon = item.ok ? "PASS" : "FAIL";
  const details = item.detail ? ` (${item.detail})` : "";
  console.log(`${icon}  ${item.name}${details}`);
});
console.log("-".repeat(60));
console.log(`Total: ${results.length}, Passed: ${passed}, Failed: ${failed}`);

if (failed > 0) {
  process.exitCode = 1;
}
