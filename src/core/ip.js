// 8号 h10 · IP 归属。
//   本机模式（readIpInfo）：主观测源 = Cloudflare 边缘；第二观测源 = 本地离线 DB-IP Lite 索引。
//   输入模式（readArbitraryIp）：用户主动输入一个 IP，只查本地离线库，零外网、零第三方、
//     不写日志、不进 KV，结果只回给发起查询的这一个人。
// 两种模式都遵守：缺值明写缺失，绝不编造近似值；库未加载就明说未加载。
import { lookup, libMeta, crossCheck, ipKind, normalizeIp, ATTRIBUTION } from './geodb.js';

export const IP_SOURCE = 'Cloudflare request.cf (edge GeoIP metadata)';
export const LOOKUP_SOURCE = 'DB-IP Lite offline library (local read, no external request)';
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
    country: 'GeoIP field, high confidence',
    region: 'GeoIP field, may be absent for some ranges',
    asn: 'GeoIP field, autonomous system of the exit network',
    city: 'library estimate, not exact physical location',
    tz: 'edge metadata, not guaranteed on all plans',
  };
}

export async function readIpInfo(request, env) {
  const headers = request.headers;
  const cf = request.cf || {};
  // 坚决不回退到 X-Forwarded-For / X-Real-IP：可伪造，不是真实观测值。
  const ip = headers.get('cf-connecting-ip') || null;

  const fields = {
    country: cf.country || null,
    region: cf.region || null,
    city: cf.city || null,
    asn: cf.asn != null ? 'AS' + cf.asn : null,
    isp: cf.asOrganization || null,
    tz: cf.timezone || null,
    colo: cf.colo || null,
  };
  const missing = FIELD_KEYS.filter(function (k) { return fields[k] == null || fields[k] === ''; });

  const lib = await libMeta(env);
  const secondary = ip ? await lookup(ip, env) : null;
  const cross = crossCheck(fields, secondary);

  return {
    ip: ip,
    fields: fields,
    missing: missing,
    source: IP_SOURCE,
    libVersion: libVersionOf(lib),
    lib: lib,
    secondary: secondary,
    crossCheck: cross,
    observedAt: new Date().toISOString(),
    precision: precision(),
    queryMode: 'self',
    status: 'ok',
    rules: {
      trust: 'cf-connecting-ip only',
      ignore: ['x-forwarded-for', 'x-real-ip'],
      subjectOnly: true,
      thirdPartyEgress: false,
      serverLogs: false,
      offlineLibrary: 'static library files deployed with the site; read-only at runtime',
      storage: 'none (KV holds static library only; no visitor data, no D1, response Cache-Control: no-store)',
      note: 'Missing values are reported as missing; no approximate value is generated. Library rows are never fabricated.',
    },
    // 常驻：DB-IP 的许可条件是「显示或使用其结果的页面必须有回链」，
    // 因此即使离线索引未加载也返回署名，由 sourcebar 无条件渲染。
    attribution: attribution(),
  };
}

// h9 · 任意 IP 查询。CF 边缘字段只描述「本次连接」，对输入的 IP 完全无效，
// 所以此模式的唯一数据源是本地离线库；库没加载就不出数，绝不拿出口 IP 冒充。
export async function readArbitraryIp(rawIp, env) {
  const kind = ipKind(rawIp);
  const normalized = kind ? normalizeIp(rawIp) : null;
  const lib = await libMeta(env);
  const base = {
    ip: normalized,
    queryIp: normalized,
    fields: emptyFields(),
    missing: FIELD_KEYS.slice(),
    source: LOOKUP_SOURCE,
    libVersion: libVersionOf(lib),
    lib: lib,
    secondary: null,
    crossCheck: { state: 'manual', diffs: [] },
    observedAt: new Date().toISOString(),
    precision: Object.assign(precision(), {
      city: 'library estimate, not exact physical location; city field not present in this index build',
    }),
    queryMode: 'manual',
    ipVersion: kind,
    attribution: attribution(),
    rules: {
      input: 'user-supplied string, validated as IPv4 or IPv6',
      lookup: 'local offline index only (static files deployed with the site)',
      thirdPartyEgress: false,
      serverLogs: false,
      queryHistory: 'none — the queried IP is never stored or logged',
      subjectOnly: true,
      storage: 'none (KV holds static library only; no visitor data, no D1, response Cache-Control: no-store)',
      note: 'Results describe the IP range, not a person. No identity resolution, no profiling, no public disclosure.',
    },
  };

  if (!kind) {
    return Object.assign(base, {
      status: 'invalid',
      message: 'Not a valid IPv4 or IPv6 address. Nothing was looked up.',
    });
  }
  if (lib.status !== 'ready') {
    return Object.assign(base, {
      status: 'lib-not-loaded',
      message: 'Offline DB-IP Lite library is not loaded, so this IP cannot be looked up. It is built automatically at deploy time — no manual setup is needed; this clears after the next successful build. No value has been fabricated.',
    });
  }

  const hit = await lookup(normalized, env);
  if (!hit) {
    return Object.assign(base, {
      status: 'no-row',
      message: 'No public attribution row covers this address in the loaded library build. Reserved, private or newly allocated ranges commonly have no row.',
    });
  }

  const fields = {
    country: hit.country || null,
    region: hit.region || null,
    city: null, // 索引只保留国家/地区/ASN；城市是库估计，本版不输出，避免假装精确
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
