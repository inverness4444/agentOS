const { setTimeout: delay } = require("timers/promises");
const dns = require("dns").promises;
const net = require("net");

const PRIVATE_IP_RANGES = [
  { from: "0.0.0.0", to: "0.255.255.255" },
  { from: "10.0.0.0", to: "10.255.255.255" },
  { from: "127.0.0.0", to: "127.255.255.255" },
  { from: "169.254.0.0", to: "169.254.255.255" },
  { from: "172.16.0.0", to: "172.31.255.255" },
  { from: "192.168.0.0", to: "192.168.255.255" }
];

const isIpInRange = (ip, range) => {
  const ipNum = ip
    .split(".")
    .map((part) => parseInt(part, 10))
    .reduce((acc, part) => (acc << 8) + part, 0);
  const fromNum = range.from
    .split(".")
    .map((part) => parseInt(part, 10))
    .reduce((acc, part) => (acc << 8) + part, 0);
  const toNum = range.to
    .split(".")
    .map((part) => parseInt(part, 10))
    .reduce((acc, part) => (acc << 8) + part, 0);
  return ipNum >= fromNum && ipNum <= toNum;
};

const isPrivateIp = (ip) => {
  if (!net.isIP(ip)) return false;
  if (ip.includes(":")) {
    const lower = ip.toLowerCase();
    if (lower === "::1") return true;
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
    if (lower.startsWith("fe80")) return true;
    return false;
  }
  return PRIVATE_IP_RANGES.some((range) => isIpInRange(ip, range));
};

const isSafeUrl = async (url) => {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (!parsed.protocol || !["http:", "https:"].includes(parsed.protocol)) return false;
  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    return false;
  }
  if (net.isIP(hostname) && isPrivateIp(hostname)) {
    return false;
  }
  try {
    const lookup = await dns.lookup(hostname, { all: true });
    if (!lookup || lookup.length === 0) return false;
    if (lookup.some((entry) => isPrivateIp(entry.address))) return false;
  } catch {
    return false;
  }
  return true;
};

const fetchWithTimeout = async (url, options = {}, timeoutMs = 15000) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeout);
  }
};

const fetchTextWithLimit = async (url, options = {}, { timeoutMs = 15000, maxBytes = 1024 * 1024 * 2 } = {}) => {
  const response = await fetchWithTimeout(url, options, timeoutMs);
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  const reader = response.body?.getReader();
  if (!reader) {
    return response.text();
  }
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.length;
      if (total > maxBytes) {
        throw new Error("Response too large");
      }
      chunks.push(Buffer.from(value));
    }
  }
  return Buffer.concat(chunks).toString("utf8");
};

const fetchJsonWithRetry = async (url, options = {}, { timeoutMs = 15000, retries = 1 } = {}) => {
  let attempt = 0;
  while (true) {
    try {
      const response = await fetchWithTimeout(url, options, timeoutMs);
      if (response.status === 429 && attempt < retries) {
        attempt += 1;
        await delay(800 + Math.random() * 600);
        continue;
      }
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }
      return response.json();
    } catch (error) {
      if (attempt < retries) {
        attempt += 1;
        await delay(800 + Math.random() * 600);
        continue;
      }
      throw error;
    }
  }
};

module.exports = {
  isSafeUrl,
  fetchWithTimeout,
  fetchTextWithLimit,
  fetchJsonWithRetry
};
