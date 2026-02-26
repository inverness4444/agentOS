const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_1; rv:121.0) Gecko/20100101 Firefox/121.0",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1"
];

const DEFAULT_HEADERS = {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
  "Cache-Control": "no-cache",
  Pragma: "no-cache"
};

const stripHtml = (html) => {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
};

const extractTitle = (html) => {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match ? match[1].trim() : "";
};

const extractLinks = (html) => {
  const links = [];
  const regex = /href\s*=\s*["']([^"']+)["']/gi;
  let match = null;
  while ((match = regex.exec(html))) {
    const href = match[1];
    if (href.startsWith("http")) {
      links.push(href);
    }
  }
  return links;
};

const extractRssItemLinks = (xml) => {
  const links = [];
  const regex = /<item>[\s\S]*?<link>([^<]+)<\/link>[\s\S]*?<\/item>/gi;
  let match = null;
  while ((match = regex.exec(xml))) {
    if (match[1]) {
      links.push(match[1].trim());
    }
  }
  return links;
};

const decodeYandexRedirect = (url) => {
  try {
    const parsed = new URL(url);
    const target = parsed.searchParams.get("url");
    return target ? decodeURIComponent(target) : url;
  } catch {
    return url;
  }
};

const extractRobotsRules = (content) => {
  const lines = content.split("\n").map((line) => line.trim());
  let apply = false;
  const disallow = [];
  for (const line of lines) {
    if (!line || line.startsWith("#")) continue;
    const [rawKey, rawValue] = line.split(":");
    if (!rawKey || rawValue === undefined) continue;
    const key = rawKey.trim().toLowerCase();
    const value = rawValue.trim();
    if (key === "user-agent") {
      apply = value === "*";
    } else if (apply && key === "disallow") {
      disallow.push(value);
    }
  }
  return disallow;
};

const canonicalizeUrl = (url) => {
  try {
    const parsed = new URL(url);
    parsed.protocol = "https:";
    const paramsToRemove = [];
    parsed.searchParams.forEach((_, key) => {
      const lower = key.toLowerCase();
      if (
        lower.startsWith("utm_") ||
        ["gclid", "yclid", "fbclid", "ref", "from"].includes(lower)
      ) {
        paramsToRemove.push(key);
      }
    });
    paramsToRemove.forEach((key) => parsed.searchParams.delete(key));

    let hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    parsed.hostname = hostname;

    if (hostname === "t.me" || hostname === "telegram.me") {
      let path = parsed.pathname.replace(/\/+$/, "");
      if (path.startsWith("/s/")) path = path.slice(2);
      parsed.pathname = path || "/";
      parsed.search = "";
      return `https://t.me${parsed.pathname}`;
    }

    if (hostname === "vk.com") {
      const parts = parsed.pathname.split("/").filter(Boolean);
      parsed.pathname = parts.length ? `/${parts[0]}` : "/";
      parsed.search = "";
      return parsed.toString().replace(/\/$/, "");
    }

    parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url;
  }
};

const getDomain = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\\./, "").toLowerCase();
  } catch {
    return "";
  }
};

const isSearchEngineDomain = (domain) =>
  domain === "yandex.ru" ||
  domain === "ya.ru" ||
  domain === "duckduckgo.com" ||
  domain === "bing.com" ||
  domain === "search.brave.com";

class WebClient {
  constructor(options) {
    this.maxRequests = options.maxRequests;
    this.maxVisitedDomains =
      Number.isFinite(Number(options.maxVisitedDomains)) && Number(options.maxVisitedDomains) > 0
        ? Math.round(Number(options.maxVisitedDomains))
        : null;
    this.minDelayMs = options.minDelayMs ?? 600;
    this.userAgents = options.userAgents ?? USER_AGENTS;
    this.timeoutMs = options.timeoutMs ?? 15000;
    this.searchTimeoutMs = options.searchTimeoutMs ?? 12000;
    this.lastRequestAt = 0;
    this.startTime = Date.now();
    this.stats = {
      requests_made: 0,
      blocked_count: 0,
      errors_count: 0,
      duration_ms: 0,
      top_errors: [],
      warnings: []
    };
    this.robotsCache = new Map();
    this.domainFailures = new Map();
    this.domainCooldown = new Map();
    this.consecutiveRateLimit = 0;
    this.lowTrafficMode = false;
    this.trace = [];
    this.errorCounts = new Map();
    this.visitedDomains = new Set();
  }

  getStats() {
    return { ...this.stats, duration_ms: Date.now() - this.startTime };
  }

  getTrace() {
    return [...this.trace];
  }

  recordWarning(message) {
    if (!this.stats.warnings.includes(message)) {
      this.stats.warnings.push(message);
    }
  }

  recordError(domain, code) {
    if (!domain) return;
    const key = `${domain}:${code || "ERR"}`;
    const next = (this.errorCounts.get(key) ?? 0) + 1;
    this.errorCounts.set(key, next);
    const entries = Array.from(this.errorCounts.entries())
      .map(([entryKey, count]) => {
        const [entryDomain, entryCode] = entryKey.split(":");
        return { domain: entryDomain, code: entryCode, count };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    this.stats.top_errors = entries;
  }

  async throttle() {
    const delay = this.lowTrafficMode ? Math.max(this.minDelayMs, 2000) : this.minDelayMs;
    const diff = Date.now() - this.lastRequestAt;
    if (diff < delay) {
      await sleep(delay - diff);
    }
    this.lastRequestAt = Date.now();
  }

  async fetchWithLimit(url, options = {}) {
    if (this.stats.requests_made >= this.maxRequests) {
      throw new Error("WEB_REQUEST_LIMIT");
    }
    const domain = getDomain(url);
    if (
      domain &&
      Number.isFinite(Number(this.maxVisitedDomains)) &&
      this.maxVisitedDomains > 0 &&
      !this.visitedDomains.has(domain) &&
      this.visitedDomains.size >= this.maxVisitedDomains
    ) {
      this.recordWarning("visited domain limit reached");
      throw new Error("WEB_DOMAIN_LIMIT");
    }
    if (domain) {
      this.visitedDomains.add(domain);
    }
    await this.throttle();
    this.stats.requests_made += 1;
    const userAgent =
      this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
    const headers = {
      ...DEFAULT_HEADERS,
      ...(options.headers || {}),
      "User-Agent": userAgent
    };
    let attempt = 0;
    let lastError = null;

    while (attempt < 3) {
      const controller = new AbortController();
      const timeoutMs = options.timeoutMs ?? this.timeoutMs;
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, {
          cache: "no-store",
          headers,
          signal: controller.signal
        });
        const text = await response.text();
        clearTimeout(timeout);

        if ([429, 503, 520, 522].includes(response.status)) {
          this.consecutiveRateLimit += 1;
          this.recordError(domain, response.status);
          if (this.consecutiveRateLimit >= 2 && !this.lowTrafficMode) {
            this.lowTrafficMode = true;
            this.recordWarning("rate-limited, switched to low-traffic mode");
            this.maxRequests = Math.max(10, Math.floor(this.maxRequests * 0.8));
          }
          const delay = Math.min(8000, 400 * 2 ** attempt);
          const jitter = delay * (0.5 + Math.random());
          await sleep(jitter);
          attempt += 1;
          continue;
        }

        this.consecutiveRateLimit = 0;
        return { ok: response.ok, status: response.status, text };
      } catch (error) {
        clearTimeout(timeout);
        lastError = error;
        this.stats.errors_count += 1;
        this.recordError(domain, "FETCH");
        const delay = Math.min(8000, 400 * 2 ** attempt);
        const jitter = delay * (0.5 + Math.random());
        await sleep(jitter);
        attempt += 1;
      }
    }

    if (lastError) throw lastError;
    throw new Error("FETCH_FAILED");
  }

  async canFetch(url) {
    try {
      const parsed = new URL(url);
      const domain = parsed.origin;
      if (!this.robotsCache.has(domain)) {
        try {
          const robotsUrl = `${domain}/robots.txt`;
          const response = await this.fetchWithLimit(robotsUrl);
          if (!response.ok) {
            this.robotsCache.set(domain, []);
          } else {
            const disallow = extractRobotsRules(response.text);
            this.robotsCache.set(domain, disallow);
          }
        } catch {
          this.robotsCache.set(domain, []);
        }
      }

      const rules = this.robotsCache.get(domain) ?? [];
      const path = parsed.pathname;
      if (rules.includes("/")) {
        return false;
      }
      return !rules.some((rule) => rule && path.startsWith(rule));
    } catch {
      return false;
    }
  }

  async fetchPage(url, options = {}) {
    const canonicalUrl = canonicalizeUrl(url);
    const domain = getDomain(canonicalUrl);
    const skipRobotsCheck = options.skipRobotsCheck === true || isSearchEngineDomain(domain);
    const cooldownUntil = this.domainCooldown.get(domain);
    if (cooldownUntil && cooldownUntil > Date.now()) {
      this.stats.blocked_count += 1;
      this.stats.errors_count += 1;
      this.recordError(domain, "COOLDOWN");
      return { blocked: true, url: canonicalUrl };
    }

    const allowed = skipRobotsCheck ? true : await this.canFetch(canonicalUrl);
    if (!allowed) {
      this.stats.blocked_count += 1;
      this.stats.errors_count += 1;
      this.recordError(domain, "ROBOTS");
      return { blocked: true, url: canonicalUrl };
    }
    this.trace.push({ domain, type: options.type || "page" });
    let response;
    try {
      response = await this.fetchWithLimit(canonicalUrl, {
        timeoutMs: options.timeoutMs
      });
    } catch (error) {
      const failures = (this.domainFailures.get(domain) ?? 0) + 1;
      this.domainFailures.set(domain, failures);
      if (failures >= 5) {
        this.domainCooldown.set(domain, Date.now() + 10 * 60 * 1000);
        this.recordWarning(`circuit-breaker:${domain}`);
      }
      this.stats.errors_count += 1;
      this.recordError(domain, "FETCH");
      return { blocked: true, url: canonicalUrl };
    }
    if (!response.ok) {
      this.stats.errors_count += 1;
      this.recordError(domain, response.status);
      const failures = (this.domainFailures.get(domain) ?? 0) + 1;
      this.domainFailures.set(domain, failures);
      if (failures >= 5) {
        this.domainCooldown.set(domain, Date.now() + 10 * 60 * 1000);
        this.recordWarning(`circuit-breaker:${domain}`);
      }
      return { blocked: true, url: canonicalUrl };
    }
    this.domainFailures.set(domain, 0);
    const html = response.text;
    const title = extractTitle(html);
    const text = stripHtml(html);
    return { url: canonicalUrl, title, html, text };
  }

  async search(query, engine = "yandex", limit = 5) {
    const preferred =
      engine === "duckduckgo"
        ? "duckduckgo"
        : engine === "brave"
          ? "brave"
        : engine === "bing"
          ? "bing_rss"
          : "yandex";
    const baseCandidates = [
      {
        engine: "brave",
        searchUrl: `https://search.brave.com/search?q=${encodeURIComponent(query)}`,
        parser: "html"
      },
      {
        engine: "yandex",
        searchUrl: `https://yandex.ru/search/?text=${encodeURIComponent(query)}`,
        parser: "html"
      },
      {
        engine: "duckduckgo",
        searchUrl: `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
        parser: "html"
      },
      {
        engine: "bing_rss",
        searchUrl: `https://www.bing.com/search?format=rss&q=${encodeURIComponent(query)}`,
        parser: "rss"
      }
    ];
    const candidates = [
      ...baseCandidates.filter((item) => item.engine === preferred),
      ...baseCandidates.filter((item) => item.engine !== preferred)
    ];

    for (const candidate of candidates) {
      const page = await this.fetchPage(candidate.searchUrl, {
        timeoutMs: this.searchTimeoutMs,
        type: "search",
        skipRobotsCheck: true
      });
      if ("blocked" in page) continue;

      const rawLinks =
        candidate.parser === "rss" ? extractRssItemLinks(page.html) : extractLinks(page.html);
      const links = rawLinks
        .map((link) => (link.includes("yandex") ? decodeYandexRedirect(link) : link))
        .map((link) => link.replace(/&amp;/g, "&"))
        .filter((link) => link.startsWith("http"));

      const results = [];
      const seen = new Set();

      for (const link of links) {
        if (results.length >= limit) break;
        try {
          const url = new URL(link);
          const host = url.hostname.toLowerCase();
          if (
            host.includes("yandex") ||
            host.includes("duckduckgo") ||
            host.includes("brave.com") ||
            host.includes("bing.com") ||
            host.startsWith("r.bing") ||
            host.startsWith("th.bing")
          ) {
            continue;
          }
        } catch {
          continue;
        }
        if (seen.has(link)) continue;
        seen.add(link);
        results.push({
          url: canonicalizeUrl(link),
          title: page.title,
          snippet: query,
          query,
          engine: candidate.engine,
          source_url: candidate.searchUrl
        });
      }

      if (results.length > 0) return results;
    }

    return [];
  }
}

module.exports = {
  WebClient,
  canonicalizeUrl
};
