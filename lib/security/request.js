const getClientIp = (request) => {
  const forwarded = String(request.headers.get("x-forwarded-for") || "");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = String(request.headers.get("x-real-ip") || "").trim();
  return real || "unknown";
};

const getOriginHost = (request) => {
  const origin = String(request.headers.get("origin") || "").trim();
  const referer = String(request.headers.get("referer") || "").trim();
  const host = String(request.headers.get("host") || "").trim();
  if (!host) return null;

  const parseHost = (url) => {
    if (!url) return null;
    try {
      return new URL(url).host;
    } catch {
      return null;
    }
  };

  return {
    host,
    originHost: parseHost(origin),
    refererHost: parseHost(referer)
  };
};

const isSameOriginRequest = (request) => {
  const info = getOriginHost(request);
  if (!info) return false;
  const { host, originHost, refererHost } = info;
  if (originHost && originHost !== host) return false;
  if (refererHost && refererHost !== host) return false;
  return true;
};

module.exports = {
  getClientIp,
  getOriginHost,
  isSameOriginRequest
};
