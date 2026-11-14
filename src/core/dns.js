// L1 · DNS 泄露「协议层」。h1 不伪造 resolver 列表：权威 NS 未委派时返回空。
// L3（域名绑定）才做：通配子域委派 → 自建权威 NS + UDP/53 记录 → 按 token 回查。
export const DNS_PROTOCOL = 'ipckit-token-probe-v1';

export const DNS_CONFIG = Object.freeze({
  configured: false,
  protocol: DNS_PROTOCOL,
  reason: 'authoritative NS for the wildcard probe zone is not delegated (L3); no resolver can be observed yet',
  authorityZone: null,
  requiredForH2: [
    'delegate a wildcard subdomain (e.g. *.probe.<zone>) to a self-hosted authoritative NS',
    'run a UDP/53 listener that records the source IP of each query keyed by the random token',
    'expose a token-scoped result endpoint, fetched only after the user clicks Run',
  ],
});

export function newProbe() {
  let token = '';
  try {
    token = globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 20);
  } catch (e) {
    token = Math.random().toString(36).slice(2, 14) + Date.now().toString(36);
  }
  return { token: token, createdAt: new Date().toISOString(), protocol: DNS_PROTOCOL };
}

export function buildProbeHost(token, zone) {
  if (!zone) return null;
  return token + '.probe.' + zone;
}

export function emptyResult() {
  return {
    configured: false,
    protocol: DNS_PROTOCOL,
    resolvers: [],
    reason: DNS_CONFIG.reason,
    observedAt: new Date().toISOString(),
  };
}

// 权威 NS 日志 → 去重后的 resolver 列表。records: [{ sourceIp, at, qname }]
export function normalizeResolverHits(records) {
  if (!Array.isArray(records)) return [];
  const seen = new Map();
  for (const r of records) {
    if (!r || !r.sourceIp) continue;
    const key = String(r.sourceIp);
    if (!seen.has(key)) {
      seen.set(key, { ip: key, hits: 0, firstAt: r.at || null, lastAt: r.at || null, qname: r.qname || null });
    }
    const e = seen.get(key);
    e.hits += 1;
    if (r.at) e.lastAt = r.at;
  }
  return Array.from(seen.values());
}

// 浏览器侧注入：同一份函数体，由 toString() 生成，零重复代码。
export const DNS_BROWSER_SRC = [
  'const DNS_PROTOCOL = ' + JSON.stringify(DNS_PROTOCOL) + ';',
  'const DNS_CONFIG = ' + JSON.stringify(DNS_CONFIG) + ';',
  newProbe.toString(),
  buildProbeHost.toString(),
  emptyResult.toString(),
  normalizeResolverHits.toString(),
  'window.IPCK_DNS = { newProbe, buildProbeHost, emptyResult, normalizeResolverHits, DNS_PROTOCOL, DNS_CONFIG };',
].join('\n');
