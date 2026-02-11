const fs = require("fs");
const path = require("path");

const target = path.join(process.cwd(), ".next");

try {
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
    // eslint-disable-next-line no-console
    console.log("[clean-next] Removed .next");
  } else {
    // eslint-disable-next-line no-console
    console.log("[clean-next] .next not found");
  }
} catch (error) {
  // eslint-disable-next-line no-console
  console.error("[clean-next] Failed to remove .next", error);
  process.exit(1);
}
