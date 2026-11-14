// 8号 h18 · IP 归属（统一数据源）
//   本机模式与「输入任意 IP」模式，全部只读随站部署的 DB-IP Lite 离线库。
//   Cloudflare 边缘只提供 cf-connecting-ip 这一个「本次连接的 IP 字符串」；
//   request.cf 里的 country / region / city / asn / asOrganization / timezone 一律
//   不参与归属判断 —— 那是连接侧路由视图，实测 ASN 与 IP 段注册归属不一致。
//   两路现在共用同一个 fromLibrary()，不会出现两个 ASN。
//   零外网、零第三方、零日志；缺值明写缺失，绝不编造近似值。
import { lookup, libMeta, ipKind, normalizeIp, ATTRIBUTION } from './geodb.js';

export const IP_SOURCE = 'DB-IP Lite offline library (local read, no external request)';
export const LOOKUP_SOURCE = IP_SOURCE;
export const IP_LIB_VERSION_FALLBACK = 'DB-IP Lite offline library not loaded (version unknown)';

const FIELD_KEYS = ['country', 'region', 'city', 'asn', 'isp', 'tz', 'colo'];

function emptyFields() {
  return { country: null, region: null, city: null, asn: null, isp: null, tz: null, colo: null };
}

function attribution() {
  return {
    label: ATTRIBUTION.label,
    url: ATTRIBUTION.url,
    license: ATTRIBUTION.license,
    licenseUrl: ATTRIBUTION.licenseUrl,
    geonamesUrl: ATTRIBUTION.geonamesUrl,
    modified: ATTRIBUTION.modified,
    persistent: true,
  };
}

function libVersionOf(lib) {
  return lib.status === 'ready'
    ? 'DB-IP Lite ' + (lib.version || lib.buildMonth || 'unknown') + ' (fetched ' + (lib.fetchedAt || 'unknown') + ', ' + lib.from + ')'
    : IP_LIB_VERSION_FALLBACK;
}

function precision() {
  return {
    country: 'IP-range registration, library field',
    region: 'IP-range registration, library field; absent for some ranges',
    asn: 'IP-range registration, autonomous system of the announcing network',
    city: 'library estimate, not exact physical location; not emitted in this build',
    tz: 'not a library field; not emitted in this build',
  };
}

function rules(mode) {
  return {
    input: mode === 'manual' ? 'user-supplied string, validated as IPv4 or IPv6' : 'cf-connecting-ip header only',
    lookup: 'local offline index only (static library files deployed with the site)',
    dataSource: 'DB-IP Lite offline library only; Cloudflare edge GeoIP metadata is NOT used for attribution',
    edgeAttributionUsed: false,
    trust: 'cf-connecting-ip only (X-Forwarded-For / X-Real-IP ignored as forgeable)',
    thirdPartyEgress: false,
    serverLogs: false,
    queryHistory: 'none — the queried IP is never stored or logged',
    subjectOnly: true,
    storage: 'none (no visitor data, no D1, response Cache-Control: no-store)',
    offlineLibrary: 'static library files deployed with the site; read-only at runtime',
    note: 'Results describe the IP range, not a person. Missing values are reported as missing; no approximate value is generated. Library rows are never fabricated.',
  };
}

async function fromLibrary(ip, env, mode, ipVersion, pre) {
  const lib = await libMeta(env);
  const base = {
    ip: ip,
    queryIp: ip,
    fields: emptyFields(),
    missing: FIELD_KEYS.slice(),
    source: LOOKUP_SOURCE,
    libVersion: libVersionOf(lib),
    lib: lib,
    secondary: null,
    crossCheck: { state: 'unified', diffs: [] },
    observedAt: new Date().toISOString(),
    precision: precision(),
    queryMode: mode,
    ipVersion: ipVersion,
    dataSource: 'DB-IP Lite offline library only (unified for self + manual)',
    edgeAttributionUsed: false,
    attribution: attribution(),
    rules: rules(mode),
    status: 'ok',
  };
  if (pre) return Object.assign(base, pre);
  if (ip == null) {
    return Object.assign(base, {
      status: 'no-ip',
      message: 'Cloudflare did not inject cf-connecting-ip for this request. No IP was looked up.',
    });
  }
  if (lib.status !== 'ready') {
    return Object.assign(base, {
      status: 'lib-not-loaded',
      message: 'Offline DB-IP Lite library is not loaded, so this IP cannot be looked up. Run the monthly rebuild workflow once; no value has been fabricated.',
    });
  }
  const hit = await lookup(ip, env);
  if (!hit) {
    return Object.assign(base, {
      status: 'no-row',
      message: 'No public attribution row covers this address in the loaded library build. Reserved, private or newly allocated ranges commonly have no row.',
    });
  }
  const fields = {
    country: hit.country || null,
    region: hit.region || null,
    city: null, // 城市是库估计，本版不输出，避免假装精确
    asn: hit.asn || null,
    isp: hit.org || null,
    tz: null,
    colo: null,
  };
  return Object.assign(base, {
    status: 'ok',
    fields: fields,
    secondary: hit,
    missing: FIELD_KEYS.filter(function (k) { return fields[k] == null || fields[k] === ''; }),
    message: 'Local library row found. Values describe the IP range, not the person using it.',
  });
}

// 本机检测：拿边缘给的 IP 字符串，再用同一个离线库查它。
export async function readIpInfo(request, env) {
  const ip = request.headers.get('cf-connecting-ip') || null;
  const ver = ip ? (ip.indexOf(':') >= 0 ? 6 : 4) : null;
  return fromLibrary(ip, env, 'self', ver, null);
}

// 输入任意 IP：与本机模式完全同一套库、同一套字段。
export async function readArbitraryIp(rawIp, env) {
  const kind = ipKind(rawIp);
  if (!kind) {
    return fromLibrary(null, env, 'manual', null, {
      status: 'invalid',
      message: 'Not a valid IPv4 or IPv6 address. Nothing was looked up.',
    });
  }
  return fromLibrary(normalizeIp(rawIp), env, 'manual', kind, null);
}
