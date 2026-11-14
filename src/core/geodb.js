// 8号 h18 · 离线 IP 库查询层（唯一归属数据源）。零外网、零第三方：运行时只读随站点部署的静态库文件的一个分片或随包内联索引。
//            装库在部署构建阶段完成（tools/build-lib.mjs），本层永不下载 / 解压 / 解析。
// h12 关键修复：Workers KV 的 get() 返回字符串，旧对象存储的 get() 返回对象（需 .text()）。
//   统一走 readText()，否则换 KV 后会静默回退到内联空壳，「离线库未加载」永远消不掉。

// 同时兼容 Workers KV（string / null）与旧对象存储语义（{ text() } / null）。
async function readText(v) {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  if (typeof v.text === 'function') return await v.text();
  return null;
}

// h16：库随部署作为静态 assets 上传，运行时优先读 assets（用 deploy 已验证过的通道），
//      不写 KV、不依赖 KV 写权限、不碰 25 MiB 单值上限；assets 缺失时回退旧 KV 分片。
async function assetText(env, p) {
  const A = env && env.ASSETS;
  if (!A) return null;
  try {
    if (typeof A.fetch === 'function') {
      const r = await A.fetch(new Request('https://ipckit.assets' + p));
      return (r && r.ok) ? await r.text() : null;
    }
    if (typeof A.get === 'function') return await readText(await A.get(p.replace(/^\//, '')));
  } catch (_) { /* 回退，不抛 */ }
  return null;
}

async function readShardText(env, key) {
  const t = await assetText(env, '/geo/' + key);
  if (t != null) return t;
  if (env && env.GEO_DB) {
    try { const o = await env.GEO_DB.get(key); return o ? await readText(o) : null; }
    catch (_) { return null; }
  }
  return null;
}
// h9 新增：任意 IP 查询（用户主动输入）需要能查 IPv4 + IPv6，因此补齐 IPv6 索引分支。
//   - IPv4 沿用 h6/h8 的整数 /8 分片（已验证，不动）；
//   - IPv6 用 128bit → 定长 32 位十六进制字符串，字典序即数值序，
//     按首字节切 idx6/NN.json；跨首字节的段复制到两侧，绝不截断/采样。
// h18：本库是「本机检测 + 输入任意 IP」两个模式的唯一归属数据源。
// Cloudflare request.cf 只用来取得 cf-connecting-ip 这个 IP 字符串，不参与归属判断。
// h6 稳定性：每次查询只读一个分片、缓存 6 小时、读失败保留上一版、绝不编造库值。
import { IP_LIB } from '../data/ip-lib.js';

export const ATTRIBUTION = {
  label: 'IP Geolocation by DB-IP',
  url: 'https://db-ip.com/',
  license: 'CC BY 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  geonamesUrl: 'https://www.geonames.org/',
  geonamesLicense: 'CC BY 4.0',
  modified: 'Sorted CIDR index; adjacent identical ranges merged. Original values unchanged. Display-layer translations added in zh-CN.',
};

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
let CACHE = null;

// 仅供离线测试重置缓存；线上不调用。
export function __resetForTest() { CACHE = null; }

function fresh(c) { return !!(c && Date.now() - c.at < CACHE_TTL_MS); }

function metaFrom(j, fallback) {
  return {
    provider: j.provider || fallback.provider,
    license: j.license || fallback.license,
    attribution: j.attribution || fallback.attribution,
    attributionUrl: j.attributionUrl || fallback.attributionUrl,
    version: j.version || null,
    buildMonth: j.buildMonth || null,
    fetchedAt: j.fetchedAt || null,
    sourceUrl: j.sourceUrl || null,
    checksum: j.checksum || null,
    rowCount: j.rowCount || null,
    shardCount: j.shardCount || null,
    ipv6RowCount: j.ipv6RowCount || null,
    ipv6ShardCount: j.ipv6ShardCount || null,
    ipv6: !!j.ipv6,
    status: 'ready',
    // h16：子片路由表（baseKey → 各子片首行排序键）。缺省 {} 兼容旧版单分片库。
    parts: (j.parts && typeof j.parts === 'object') ? j.parts : {},
  };
}

async function load(env) {
  // 绑定 KV 后即便当前 isolate 还缓存着内联占位，也立刻重新探测，避免「库已上传却不生效」。
  if (CACHE && CACHE.mode === 'inline' && env && (env.GEO_DB || env.ASSETS)) CACHE = null;
  if (fresh(CACHE)) return CACHE;
  const prev = CACHE;
  // h16 首选：部署时生成、随代码上传的静态库。
  if (env && env.ASSETS) {
    try {
      const t = await assetText(env, '/geo/meta.json');
      if (t) {
        const j = JSON.parse(t);
        if (j && j.status === 'ready' && (j.mode === 'shard' || j.mode === 'shard6' || j.mode === 'shard8')) {
          CACHE = { mode: j.mode, source: 'assets', meta: metaFrom(j, IP_LIB), shards: {}, shards6: {}, at: Date.now() };
          return CACHE;
        }
      }
    } catch (e) { /* assets 缺失或格式异常 → 回退，绝不编造库数据 */ }
  }
  if (env && env.GEO_DB) {
    try {
      const metaObj = await env.GEO_DB.get('meta.json');
      if (metaObj) {
        const j = JSON.parse(await readText(metaObj));
        if (j && j.status === 'ready' && (j.mode === 'shard' || j.mode === 'shard6' || j.mode === 'shard8')) {
          CACHE = { mode: j.mode, source: 'kv', meta: metaFrom(j, IP_LIB), shards: {}, shards6: {}, at: Date.now() };
          return CACHE;
        }
      }
      // 兼容 h5 的整包格式 ip-lib.json
      const full = await env.GEO_DB.get('ip-lib.json');
      if (full) {
        const j = JSON.parse(await readText(full));
        if (j && Array.isArray(j.rows) && j.rows.length) {
          CACHE = { mode: 'full', meta: metaFrom(j, IP_LIB), rows: j.rows, at: Date.now() };
          return CACHE;
        }
      }
    } catch (e) { /* KV 未就绪时静默回退，绝不编造库数据 */ }
  }
  if (prev && prev.mode === 'full') return prev; // 读失败保留上一版有效库
  CACHE = {
    mode: 'inline',
    rows: IP_LIB.rows,
    rows6: IP_LIB.rows6 || [],
    meta: {
      provider: IP_LIB.provider, license: IP_LIB.license,
      attribution: IP_LIB.attribution, attributionUrl: IP_LIB.attributionUrl,
      version: IP_LIB.version, buildMonth: IP_LIB.buildMonth,
      fetchedAt: IP_LIB.fetchedAt, sourceUrl: IP_LIB.sourceUrl,
      checksum: IP_LIB.checksum, rowCount: IP_LIB.rows.length,
      ipv6RowCount: (IP_LIB.rows6 || []).length,
      shardCount: null, ipv6ShardCount: null, ipv6: !!(IP_LIB.rows6 || []).length,
      status: IP_LIB.status,
    },
    at: Date.now(),
  };
  return CACHE;
}

export async function libMeta(env) {
  const c = await load(env);
  const m = Object.assign({}, c.meta, {
    rowCount: c.mode === 'full' ? c.rows.length : c.meta.rowCount,
    from: (c.mode === 'shard' || c.mode === 'shard6' || c.mode === 'shard8') ? (c.source === 'assets' ? 'assets' : 'kv-sharded') : (c.mode === 'full' ? 'kv' : 'inline'),
    mode: c.mode,
  });
  delete m.parts; // 路由表只供内部查询，不塞进 /api/health 与页面
  return m;
}

function isIpv4(ip) {
  if (typeof ip !== 'string') return false;
  const p = ip.split('.');
  if (p.length !== 4) return false;
  for (let i = 0; i < 4; i++) {
    if (!/^\d{1,3}$/.test(p[i])) return false;
    const n = Number(p[i]);
    if (n < 0 || n > 255) return false;
  }
  return true;
}
function ipv4ToInt(ip) {
  const p = ip.split('.');
  return ((Number(p[0]) * 256 + Number(p[1])) * 256 + Number(p[2])) * 256 + Number(p[3]);
}

// ---- IPv6 -----------------------------------------------------------------
// 返回 128bit BigInt；拒绝 zone id、端口、非法缩写。末尾 IPv4 形式按 RFC 4291 展开。
export function parseIpv6(input) {
  let s = String(input == null ? '' : input).trim().toLowerCase();
  if (!s || s.indexOf('%') >= 0 || s.indexOf('[') >= 0) return null;
  if (s.indexOf('.') >= 0) {
    const last = s.lastIndexOf(':');
    if (last < 0) return null;
    const v4 = s.slice(last + 1);
    const p = v4.split('.');
    if (p.length !== 4) return null;
    const nums = [];
    for (let i = 0; i < 4; i++) {
      if (!/^\d{1,3}$/.test(p[i])) return null;
      const n = Number(p[i]);
      if (n > 255) return null;
      nums.push(n);
    }
    const n32 = ((nums[0] * 256 + nums[1]) * 256 + nums[2]) * 256 + nums[3];
    s = s.slice(0, last + 1) + (Math.floor(n32 / 65536)).toString(16) + ':' + (n32 % 65536).toString(16);
  }
  if (s.indexOf(':::') >= 0) return null;
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = (halves.length === 2 && halves[1]) ? halves[1].split(':') : [];
  let groups;
  if (halves.length === 2) {
    const missing = 8 - left.length - right.length;
    if (missing < 1) return null; // "::" 至少要压缩一段
    groups = left.concat(new Array(missing).fill('0'), right);
  } else groups = left;
  if (groups.length !== 8) return null;
  let v = 0n;
  for (let i = 0; i < 8; i++) {
    if (!/^[0-9a-f]{1,4}$/.test(groups[i])) return null;
    v = (v << 16n) | BigInt('0x' + groups[i]);
  }
  return v;
}

// 定长 32 位小写 hex：字典序 == 数值序，可直接用于二分，无需 BigInt 运行时开销。
function toHex32(big) { return big.toString(16).padStart(32, '0'); }

export function ipKind(ip) {
  if (isIpv4(ip)) return 4;
  if (parseIpv6(ip) !== null) return 6;
  return 0;
}

// 规范化的展示字符串（不改数据，仅统一格式）；非法返回 null。
export function normalizeIp(ip) {
  const s = String(ip == null ? '' : ip).trim();
  if (isIpv4(s)) return s.split('.').map(Number).join('.');
  const v = parseIpv6(s);
  if (v === null) return null;
  // 折叠成 RFC 5952 风格的压缩写法，便于阅读
  const h = toHex32(v);
  const g = [];
  for (let i = 0; i < 8; i++) g.push(h.slice(i * 4, i * 4 + 4).replace(/^0+(?=[0-9a-f])/, ''));
  let bestStart = -1, bestLen = 0, curStart = -1, curLen = 0;
  for (let i = 0; i < 8; i++) {
    if (g[i] === '0') {
      if (curStart < 0) { curStart = i; curLen = 1; } else curLen++;
      if (curLen > bestLen) { bestStart = curStart; bestLen = curLen; }
    } else { curStart = -1; curLen = 0; }
  }
  if (bestLen < 2) return g.join(':');
  return g.slice(0, bestStart).join(':') + '::' + g.slice(bestStart + bestLen).join(':');
}

// h16：按 meta.parts 二分定位唯一子片；无子片时沿用旧 key。查询仍只读一个 KV key。
function pickKey(baseKey, target, parts) {
  const bounds = parts && parts[baseKey];
  if (!Array.isArray(bounds) || bounds.length <= 1) return baseKey + '.json';
  let lo = 0, hi = bounds.length - 1, ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (bounds[mid] <= target) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return baseKey + '/' + ans + '.json';
}

async function shardRows(env, firstOctet, n, c) {
  const baseKey = 'idx/' + String(firstOctet).padStart(3, '0');
  const key = pickKey(baseKey, String(n).padStart(10, '0'), c.meta.parts);
  if (c.shards[key]) return c.shards[key];
  const txt = await readShardText(env, key);
  const rows = txt ? JSON.parse(txt) : [];
  c.shards[key] = rows;
  return rows;
}

async function shardRows6(env, firstByte, hex, c) {
  const baseKey = 'idx6/' + firstByte;
  const key = pickKey(baseKey, hex, c.meta.parts);
  if (c.shards6[key]) return c.shards6[key];
  const txt = await readShardText(env, key);
  const rows = txt ? JSON.parse(txt) : [];
  c.shards6[key] = rows;
  return rows;
}

// h20：8 列 [a,b,country,region,city,tz,asn,org]；旧 6 列 [a,b,country,region,asn,org] 兼容。
// 缺列一律 null，不猜、不拿别的字段顶替。
function rowToFields(r) {
  if (!r) return null;
  if (r.length >= 8) {
    return {
      country: r[2] || null,
      region: r[3] || null,
      city: r[4] || null,
      tz: r[5] || null,
      asn: r[6] != null && r[6] !== '' ? 'AS' + r[6] : null,
      org: r[7] || null,
    };
  }
  return {
    country: r[2] || null,
    region: r[3] || null,
    city: null,
    tz: null,
    asn: r[4] != null && r[4] !== '' ? 'AS' + r[4] : null,
    org: r[5] || null,
  };
}

function binaryLookup(rows, n) {
  let lo = 0, hi = rows.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const r = rows[mid];
    if (n < r[0]) hi = mid - 1;
    else if (n > r[1]) lo = mid + 1;
    else return rowToFields(r);
  }
  return null;
}

function binaryLookupHex(rows, hex) {
  let lo = 0, hi = rows.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const r = rows[mid];
    if (hex < r[0]) hi = mid - 1;
    else if (hex > r[1]) lo = mid + 1;
    else return rowToFields(r);
  }
  return null;
}

// 返回 {country, region, city, tz, asn, org} 或 null。库未加载 / 无命中都如实返回 null，不猜。
export async function lookup(ip, env) {
  const c = await load(env);
  if (c.meta.status !== 'ready') return null;
  const kind = ipKind(ip);
  if (kind === 4) {
    const n = ipv4ToInt(ip);
    const firstOctet = Number(ip.split('.')[0]);
    let rows;
    if (c.mode === 'shard' || c.mode === 'shard6' || c.mode === 'shard8') {
      try { rows = await shardRows(env, firstOctet, n, c); }
      catch (e) { return null; }
    } else {
      rows = c.rows;
    }
    if (!rows || !rows.length) return null;
    return binaryLookup(rows, n);
  }
  if (kind === 6) {
    const v = parseIpv6(ip);
    if (v === null) return null;
    const hex = toHex32(v);
    const firstByte = hex.slice(0, 2);
    let rows;
    if (c.mode === 'shard6' || c.mode === 'shard8') {
      try { rows = await shardRows6(env, firstByte, hex, c); }
      catch (e) { return null; }
    } else {
      rows = c.rows6 || [];
    }
    if (!rows || !rows.length) return null;
    return binaryLookupHex(rows, hex);
  }
  return null;
}

function norm(v) { return v == null ? null : String(v).trim().toUpperCase(); }

// 只比对国家 / 地区 / ASN 三个可核验字段；城市是库估计，不参与一致性判定。
export function crossCheck(cfFields, libFields) {
  if (!libFields) return { state: 'no-secondary', diffs: [] };
  const keys = ['country', 'region', 'asn'];
  const diffs = [];
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const a = norm(cfFields ? cfFields[k] : null);
    const b = norm(libFields[k]);
    if (a && b && a !== b) diffs.push({ field: k, edge: a, library: b });
  }
  return { state: diffs.length ? 'mismatch' : 'match', diffs: diffs };
}
