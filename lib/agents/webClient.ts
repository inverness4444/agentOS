export type WebSearchResult = {
  url: string;
  title: string;
  snippet: string;
  query?: string;
  engine?: string;
};

export type WebPage = {
  url: string;
  title: string;
  html: string;
  text: string;
};

export type WebStats = {
  requests_made: number;
  blocked_count: number;
  errors_count: number;
  duration_ms: number;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const stripHtml = (html: string) => {
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

const extractTitle = (html: string) => {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match ? match[1].trim() : "";
};

const extractLinks = (html: string) => {
  const links: string[] = [];
  const regex = /href\s*=\s*["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html))) {
    const href = match[1];
    if (href.startsWith("http")) {
      links.push(href);
    }
  }
  return links;
};

const decodeYandexRedirect = (url: string) => {
  try {
    const parsed = new URL(url);
    const target = parsed.searchParams.get("url");
    return target ? decodeURIComponent(target) : url;
  } catch {
    return url;
  }
};

const extractRobotsRules = (content: string) => {
  const lines = content.split("\n").map((line) => line.trim());
  let apply = false;
  const disallow: string[] = [];
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

export class WebClient {
  private maxRequests: number;
  private minDelayMs: number;
  private userAgent: string;
  private timeoutMs: number;
  private lastRequestAt: number;
  private startTime: number;
  private stats: WebStats;
  private robotsCache: Map<string, string[]>;

  constructor(options: { maxRequests: number; minDelayMs?: number; userAgent?: string; timeoutMs?: number }) {
    this.maxRequests = options.maxRequests;
    this.minDelayMs = options.minDelayMs ?? 600;
    this.userAgent = options.userAgent ?? "Mozilla/5.0 (agentOS research bot)";
    this.timeoutMs = options.timeoutMs ?? 15000;
    this.lastRequestAt = 0;
    this.startTime = Date.now();
    this.stats = {
      requests_made: 0,
      blocked_count: 0,
      errors_count: 0,
      duration_ms: 0
    };
    this.robotsCache = new Map();
  }

  getStats(): WebStats {
    return { ...this.stats, duration_ms: Date.now() - this.startTime };
  }

  private async throttle() {
    const diff = Date.now() - this.lastRequestAt;
    if (diff < this.minDelayMs) {
      await sleep(this.minDelayMs - diff);
    }
    this.lastRequestAt = Date.now();
  }

  private async fetchWithLimit(url: string) {
    if (this.stats.requests_made >= this.maxRequests) {
      throw new Error("WEB_REQUEST_LIMIT");
    }
    await this.throttle();
    this.stats.requests_made += 1;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url, {
        cache: "no-store",
        headers: {
          "User-Agent": this.userAgent,
          "Accept-Language": "ru,en;q=0.8"
        },
        signal: controller.signal
      });
      const text = await response.text();
      clearTimeout(timeout);
      return { ok: response.ok, status: response.status, text };
    } catch (error) {
      clearTimeout(timeout);
      this.stats.errors_count += 1;
      throw error;
    }
  }

  private async canFetch(url: string) {
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

  async fetchPage(url: string): Promise<WebPage | { blocked: true; url: string }> {
    const allowed = await this.canFetch(url);
    if (!allowed) {
      this.stats.blocked_count += 1;
      return { blocked: true, url };
    }
    const response = await this.fetchWithLimit(url);
    if (!response.ok) {
      this.stats.errors_count += 1;
      return { blocked: true, url };
    }
    const html = response.text;
    const title = extractTitle(html);
    const text = stripHtml(html);
    return { url, title, html, text };
  }

  async search(query: string, engine: "yandex" | "duck" = "yandex", limit = 5): Promise<WebSearchResult[]> {
    const searchUrl =
      engine === "yandex"
        ? `https://yandex.ru/search/?text=${encodeURIComponent(query)}`
        : `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

    const page = await this.fetchPage(searchUrl);
    if ("blocked" in page) {
      return [];
    }

    const links = extractLinks(page.html)
      .map((link) => (link.includes("yandex") ? decodeYandexRedirect(link) : link))
      .filter((link) => link.startsWith("http"));

    const results: WebSearchResult[] = [];
    const seen = new Set<string>();

    for (const link of links) {
      if (results.length >= limit) break;
      try {
        const url = new URL(link);
        if (url.hostname.includes("yandex") || url.hostname.includes("duckduckgo")) {
          continue;
        }
      } catch {
        continue;
      }
      if (seen.has(link)) continue;
      seen.add(link);
      results.push({ url: link, title: page.title, snippet: query, query, engine });
    }

    return results;
  }
}
