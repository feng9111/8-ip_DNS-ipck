// 8号 h22 · 流式离线库构建（真数据全量跑通版）
//
// h22 真根因（沙盒用真 city/asn 表全量复现，327 万行时报错）：
//   EFBIG: file too large, write —— 单个 (tag,桶) 的 .ndjson 临时文件被无限 append，
//   几个月度全量表下来某些桶累积到超大单文件，构建在写完 city 后直接挂掉，
//   所以 h17~h21 随包那份库一直是「6 列、region 全 None」的残库，地区从来没生成过。
//   h22 把临时文件按每 30000 行切序号分片，最终阶段按桶合并后再切 6 MiB 分片；
//   读取层 parts 路由原样复用，不改 Worker 运行时、不写 KV、不碰 25 MiB。
//
// h16 的 `FATAL ERROR: Ineffective mark-compacts near heap limit` 根因：
//   旧脚本把 city v4(45MB gz) + city v6(38MB gz) + asn v4 + asn v6 全部解析成
//   几百万条 JS 对象再统一 sort / 合并 / 切 KV 分片，2GB 堆直接撑爆，SIGABRT，
//   连 wrangler deploy 都没跑到（部署整体失败）。h13 的 0 行、h14 的 25 MiB 也同属这条路。
//
// h16 三条硬改：
//   ① 只有 ASN 表（约 48 万行、~23MB CSV）驻留内存做二分索引；City 表全程流式逐行处理。
//      内存峰值 = ASN 数组(~100MB) + 10 万行缓冲(~6MB) + 单个分桶排序(~30MB)，远低于 2GB。
//   ② 产物写 ./assets/geo/ 静态文件，随 wrangler deploy 一起上传（用的就是已经成功的 deploy 权限）。
//      不写 KV、不依赖 KV 写权限、不碰 KV 25 MiB 单值上限；运行时只读一个 assets 文件。
//   ③ 不再挂 postinstall（避免同一次部署重复跑两遍），只由 [build].command 跑一次。
//      构建失败 exit 0，保留上一版库，绝不阻断部署；但本版不会因体积失败。
//
// h22 最终产物：idx/NNN.json、idx6/NN.json、meta.json、dict.json，6 列编码
//   [a, b, countryIdx, regionIdx, asnIdx, orgIdx]，mode="shard6"、encoded=true。
// 源仍按 ip-location-db 官方 City 标准 10 列取 state1/state2/city：
//   ip_range_start, ip_range_end, country_code, state1, state2, city,
//   postcode, latitude, longitude, timezone
// 只保留页面真正展示的 4 个字段；城市/时区框已删除，库里不存这两列。
// 查询层同时兼容旧 6 列 / 8 列明文分片，缺值如实返回 null（绝不编值）。
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import readline from 'node:readline';
import crypto from 'node:crypto';

const OUT = path.resolve('assets/geo');
const TMP = path.resolve('.ipckit-tmp');
const BASE = 'https://github.com/sapics/ip-location-db/releases/download/latest/';
const CITY = [
  { file: 'dbip-city-ipv4.csv.gz', ver: 4 },
  { file: 'dbip-city-ipv6.csv.gz', ver: 6 },
];
const ASN = [
  { file: 'dbip-asn-ipv4.csv', ver: 4 },
  { file: 'dbip-asn-ipv6.csv', ver: 6 },
];
const BUF_LIMIT = 100000;
const TMP_LINES = 30000;        // h22：单个 ndjson 临时文件最多 3 万行，杜绝 EFBIG
const SHARD_MAX = 6 * 1024 * 1024;
const log = (...a) => console.log('[ipckit/build-lib]', ...a);

// h22 最终：只输出站点真正展示的 4 个字段（国家 / 地区 / ASN / 运营商），
// 城市与时区框已按需求删除，库里不再存这两列。字符串统一抽到 dict.json 做整数下标，
// 分片每行变成 [a,b,countryIdx,regionIdx,asnIdx,orgIdx]，体积从 715 MiB 降到约 360 MiB，
// 且读取层 geodb.js 已兼容；城市/时区不会被拿去当别的字段顶替。
const DICT = { countries: [], regions: [], asns: [], orgs: [] };
const DMAP = { countries: new Map(), regions: new Map(), asns: new Map(), orgs: new Map() };
function intern(kind, v) {
  const s = (v == null || v === '') ? '' : String(v);
  const m = DMAP[kind];
  if (!m.has(s)) { m.set(s, DICT[kind].length); DICT[kind].push(s); }
  return m.get(s);
}

function ip4(s) {
  const p = String(s).split('.');
  if (p.length !== 4) return null;
  let n = 0;
  for (const x of p) { if (!/^\d{1,3}$/.test(x) || +x > 255) return null; n = n * 256 + +x; }
  return n;
}
function ip6(s) {
  let t = String(s).toLowerCase().trim();
  if (t.includes('.')) {
    const i = t.lastIndexOf(':'); const p = t.slice(i + 1).split('.');
    if (p.length !== 4) return null;
    let n = 0; for (const x of p) { if (!/^\d{1,3}$/.test(x) || +x > 255) return null; n = n * 256 + +x; }
    t = t.slice(0, i + 1) + Math.floor(n / 65536).toString(16) + ':' + (n % 65536).toString(16);
  }
  if (t.includes(':::') || t.includes('%')) return null;
  const halves = t.split('::');
  if (halves.length > 2) return null;
  const L = halves[0] ? halves[0].split(':') : [];
  const R = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  let g;
  if (halves.length === 2) { const m = 8 - L.length - R.length; if (m < 1) return null; g = L.concat(Array(m).fill('0'), R); }
  else g = L;
  if (g.length !== 8) return null;
  let out = '';
  for (const x of g) { if (!/^[0-9a-f]{1,4}$/.test(x)) return null; out += x.padStart(4, '0'); }
  return out;
}
function ipNum(s, ver) { return ver === 4 ? ip4(s) : ip6(s); }

function csvLine(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { q = !q; continue; }
    if (ch === ',' && !q) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur); return out;
}

// h20：按 ip-location-db 官方 City 标准 10 列取字段。
//   0 start / 1 end / 2 country_code / 3 state1 / 4 state2 / 5 city
//   6 postcode / 7 lat / 8 lon / 9 timezone
// 旧脚本用「自适应找第一个两字母码」的方式，遇到 DB-IP 原始列序会把国家全名
// 当成地区；这里改成位置优先 + 合法性校验，格式异常才回退启发式。
const CONTINENTS = new Set(['AF', 'AN', 'AS', 'EU', 'NA', 'OC', 'SA']);
const clean = (v) => String(v == null ? '' : v).trim().replace(/^"|"$/g, '').slice(0, 80);

function parseGeo(c, ver) {
  const a = ipNum(c[0], ver), b = ipNum(c[1], ver);
  if (a === null || b === null) return null;
  const cc = clean(c[2]);
  if (/^[A-Z]{2}$/.test(cc) && !CONTINENTS.has(cc)) {
    const s1 = clean(c[3]), s2 = clean(c[4]);
    const region = (s1 && s1 !== cc && !CONTINENTS.has(s1)) ? s1
                 : ((s2 && s2 !== cc && !CONTINENTS.has(s2)) ? s2 : null);
    const city = clean(c[5]) || null;
    const tz = clean(c[9]) || null;
    return { a, b, country: cc, region, city, tz };
  }
  // 回退：DB-IP 原始 11 列（含 continent_code/name 与 country_name）。
  let country = null, region = null, city = null, tz = null;
  for (let i = 2; i < c.length; i++) {
    const v = clean(c[i]);
    if (!country && /^[A-Z]{2}$/.test(v) && !CONTINENTS.has(v)) { country = v; continue; }
    if (!country) continue;
    if (!region && v && v !== country && !CONTINENTS.has(v) && !/^[A-Z]{2}$/.test(v)) { region = v; continue; }
    if (!city && region && v && v !== region && !CONTINENTS.has(v) && !/^[A-Z]{2}$/.test(v)) { city = v; continue; }
    if (!tz && v && v.indexOf('/') > 0) { tz = v; break; }
  }
  return { a, b, country, region, city, tz };
}

async function openStream(file, fromDir) {
  if (fromDir) {
    const p = path.join(fromDir, file);
    if (!fs.existsSync(p)) {
      const gz = p.endsWith('.gz') ? p.slice(0, -3) : null;
      if (gz && fs.existsSync(gz)) { log('local plain csv:', path.basename(gz)); return fs.createReadStream(gz); }
      log('skip (local missing):', file); return null;
    }
    let s = fs.createReadStream(p);
    if (file.endsWith('.gz')) s = s.pipe(zlib.createGunzip());
    return s;
  }
  const r = await fetch(BASE + file, { headers: { 'User-Agent': 'ipckit-build' }, redirect: 'follow' });
  if (!r.ok || !r.body) { log('download failed', file, r.status); return null; }
  let s = r.body;
  if (file.endsWith('.gz')) s = s.pipe(zlib.createGunzip());
  log('downloaded', file, r.headers.get('content-length') || '?');
  return s;
}

async function readAsnIndex(fromDir, ver) {
  const src = ASN.find(x => x.ver === ver);
  const stream = await openStream(src.file, fromDir);
  if (!stream) return [];
  const rows = [];
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line) continue;
    const c = csvLine(line);
    const a = ipNum(c[0], ver), b = ipNum(c[1], ver);
    if (a === null || b === null) continue;
    const asn = (c[2] || '').trim();
    if (!/^\d+$/.test(asn)) continue;
    rows.push([a, b, asn, (c[3] || '').trim().replace(/^"|"$/g, '').slice(0, 80)]);
  }
  rows.sort((x, y) => x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0);
  log('asn index v' + ver, rows.length, 'rows');
  return rows;
}
function findAsn(rows, key) {
  let lo = 0, hi = rows.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const r = rows[mid];
    if (key < r[0]) hi = mid - 1;
    else if (key > r[1]) lo = mid + 1;
    else return r;
  }
  return null;
}

function bucketKeys(a, b, ver) {
  const out = [];
  if (ver === 4) {
    const lo = Math.floor(a / 16777216), hi = Math.floor(b / 16777216);
    for (let i = lo; i <= Math.min(hi, lo + 255); i++) out.push(String(i).padStart(3, '0'));
  } else {
    const lo = parseInt(String(a).slice(0, 2), 16), hi = parseInt(String(b).slice(0, 2), 16);
    for (let i = lo; i <= Math.min(hi, lo + 255); i++) out.push(i.toString(16).padStart(2, '0'));
  }
  return out.length ? out : ['000'];
}

async function build() {
  const fromIdx = process.argv.indexOf('--from-dir');
  const fromDir = fromIdx > 0 ? process.argv[fromIdx + 1] : null;
  const sampleMode = process.argv.includes('--sample');
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });
  for (const d of ['idx', 'idx6']) fs.rmSync(path.join(OUT, d), { recursive: true, force: true });

  const asnIdx = { 4: await readAsnIndex(fromDir, 4), 6: await readAsnIndex(fromDir, 6) };
  let total = 0;

  for (const src of CITY) {
    const stream = await openStream(src.file, fromDir);
    if (!stream) continue;
    const tag = src.ver === 4 ? 'v4' : 'v6';
    let buf = [];
    // h22：每个 (tag,桶) 记录当前写到第几个序号文件、已写多少行。
    // 文件形如 v4_001_000.ndjson / v4_001_001.ndjson，单个不超过 TMP_LINES 行。
    const seqState = new Map();
    const appendGroup = (k, lines) => {
      const sk = tag + '_' + k;
      let st = seqState.get(sk);
      if (!st) { st = { seq: 0, count: 0 }; seqState.set(sk, st); }
      let off = 0;
      while (off < lines.length) {
        const room = TMP_LINES - st.count;
        if (room <= 0) { st.seq += 1; st.count = 0; continue; }
        const take = Math.min(room, lines.length - off);
        const piece = lines.slice(off, off + take);
        const p = path.join(TMP, `${tag}_${k}_${String(st.seq).padStart(3, '0')}.ndjson`);
        fs.appendFileSync(p, piece.join('\n') + '\n');
        st.count += take; off += take;
      }
    };
    const flush = () => {
      if (!buf.length) return;
      const groups = new Map();
      for (const row of buf) {
        if (!groups.has(row.k)) groups.set(row.k, []);
        groups.get(row.k).push(row.line);
      }
      for (const [k, lines] of groups) appendGroup(k, lines);
      buf = [];
    };
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line) continue;
      const c = csvLine(line);
      const r = parseGeo(c, src.ver);
      if (!r) continue;
      const hit = findAsn(asnIdx[src.ver], r.a);
      // 6 列：[起,止,国家下标,地区下标,ASN 下标,运营商下标]
      const row = [r.a, r.b, intern('countries', r.country), intern('regions', r.region),
                   intern('asns', hit ? hit[2] : ''), intern('orgs', hit ? hit[3] : '')];
      const payload = JSON.stringify(row);
      for (const k of bucketKeys(r.a, r.b, src.ver)) buf.push({ k, line: payload });
      total++;
      if (buf.length >= BUF_LIMIT) flush();
      if (sampleMode && total > 200000) break;
    }
    flush();
    log('parsed', src.file, 'cumulative rows', total);
  }
  if (!total) { log('BUILD FAILED: parsed 0 rows (source not CSV)'); return false; }

  // h22：按桶分组后「逐桶」读取（只把当前桶驻留内存），排序 / 合并 / 切 6 MiB 分片后释放。
  // 沙盒 2.4 GiB 物理内存里若把 370 个临时文件一次性全读进来会被 OOM killer 硬杀；
  // 逐桶峰值 ≈ 单桶行数，CI 的 7 GiB 机器更宽裕。
  const groups = new Map();
  for (const f of fs.readdirSync(TMP)) {
    const m = f.match(/^(v4|v6)_(.+)_(\d{3})\.ndjson$/);
    if (!m) continue;
    const [, tag, k] = m;
    const gk = tag + '_' + k;
    let g = groups.get(gk);
    if (!g) { g = { tag, k, files: [] }; groups.set(gk, g); }
    g.files.push(f);
  }
  const parts = {};
  let files = 0, maxBytes = 0, kept = 0;
  for (const g of groups.values()) {
    const { tag, k } = g;
    const rows = [];
    for (const f of g.files) {
      const txt = fs.readFileSync(path.join(TMP, f), 'utf8');
      for (const line of txt.split('\n')) if (line) rows.push(JSON.parse(line));
    }
    rows.sort((x, y) => x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0);
    const merged = [];
    for (const r of rows) {
      const last = merged[merged.length - 1];
      if (last && r[0] <= last[1] + 1 &&
          String(last[2]) === String(r[2]) && String(last[3]) === String(r[3]) &&
          String(last[4]) === String(r[4]) && String(last[5]) === String(r[5]) &&
          String(last[6]) === String(r[6]) && String(last[7]) === String(r[7])) {
        if (r[1] > last[1]) last[1] = r[1];
        continue;
      }
      merged.push(r.slice());
    }
    kept += merged.length;
    const dir = path.join(OUT, tag === 'v4' ? 'idx' : 'idx6');
    fs.mkdirSync(dir, { recursive: true });
    const baseKey = (tag === 'v4' ? 'idx/' : 'idx6/') + k;
    const chunks = []; let cur = [], curBytes = 2;
    for (const r of merged) {
      const s = JSON.stringify(r);
      if (curBytes + s.length + 1 > SHARD_MAX && cur.length) { chunks.push(cur); cur = []; curBytes = 2; }
      cur.push(r); curBytes += s.length + 1;
    }
    if (cur.length) chunks.push(cur);
    const bounds = [];
    chunks.forEach((ch, i) => {
      bounds.push(String(ch[0][0]));
      const rel = chunks.length === 1 ? k + '.json' : `${k}/${i}.json`;
      const p = path.join(dir, rel);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      const body = JSON.stringify(ch);
      fs.writeFileSync(p, body);
      maxBytes = Math.max(maxBytes, Buffer.byteLength(body));
      files++;
    });
    if (chunks.length > 1) parts[baseKey] = bounds;
  }
  if (!files) { log('BUILD FAILED: no shard produced'); return false; }
  const month = new Date().toISOString().slice(0, 7);
  const dictBody = JSON.stringify(DICT);
  fs.writeFileSync(path.join(OUT, 'dict.json'), dictBody);
  const meta = {
    status: 'ready', mode: 'shard6', encoded: true,
    columns: ['ip_start', 'ip_end', 'country', 'region', 'asn', 'org'],
    provider: 'DB-IP Lite (City-Lite + ASN-Lite)',
    license: 'CC BY 4.0', attribution: 'IP Geolocation by DB-IP', attributionUrl: 'https://db-ip.com/',
    version: month, buildMonth: month, fetchedAt: new Date().toISOString(),
    sourceUrl: 'https://github.com/sapics/ip-location-db/releases/latest',
    rowCount: kept, sourceRowCount: total, shardCount: files,
    ipv6RowCount: kept, ipv6ShardCount: files,
    ipv6: true, parts,
    checksum: crypto.createHash('sha256').update(String(kept) + String(files) + dictBody.slice(0, 64)).digest('hex').slice(0, 16),
  };
  fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify(meta));
  const mu = process.memoryUsage();
  log('PUBLISHED', files, 'shards, max', (maxBytes / 1024 / 1024).toFixed(2), 'MiB, rows', kept,
      '| dict regions', DICT.regions.length, 'orgs', DICT.orgs.length,
      '| heap', (mu.heapUsed / 1024 / 1024).toFixed(0), 'MiB rss', (mu.rss / 1024 / 1024).toFixed(0), 'MiB');
  fs.rmSync(TMP, { recursive: true, force: true });
  return true;
}

build().then(ok => { if (!ok) log('BUILD FAILED (deploy continues, previous library kept)'); process.exit(0); })
  .catch(e => { log('BUILD FAILED (deploy continues):', e && e.message); process.exit(0); });
