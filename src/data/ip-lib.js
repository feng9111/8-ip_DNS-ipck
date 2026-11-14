// 8号 h6 · DB-IP Lite 离线索引（兜底空壳，请勿手工编辑数值）
// 生成方式（h16）：tools/build-lib.mjs 在部署构建阶段（海外 CI）拉库并写入随站点部署的静态库文件；
//          Worker 运行时只读分片，不再下载 / 解压 / 解析，避免 Error 1102。
// 更新节奏：DB-IP Lite 每月 1 号发版；dbip-monthly.yml 每月 1 号 06:07 UTC 空 commit 触发重建。
// 许可：CC BY 4.0。DB-IP 官方要求「显示或使用结果的页面必须有回链」，
//       h6 已由 sourcebar.js 在所有结果页与法务页常驻回链，与本文件是否加载无关。
//       部分地名数据 © GeoNames contributors（CC BY 4.0），一并署名。
// ⚠ 库未装好时 rows 为空、status 为 not-loaded：页面如实写「离线库未加载，版本未知」，
//   绝不因为「三件套要齐」就编造版本号或近似地理值。这是准确性红线，不是待修缺陷。
export const IP_LIB = {
  provider: 'DB-IP Lite (City-Lite + ASN-Lite)',
  license: 'CC BY 4.0',
  attribution: 'IP Geolocation by DB-IP',
  attributionUrl: 'https://db-ip.com/',
  version: null,
  buildMonth: null,
  fetchedAt: null,
  sourceUrl: null,
  checksum: null,
  status: 'not-loaded',
  // rows (IPv4): [startInt, endInt, countryCode, region, asnNumber, org]，按 startInt 升序
  // rows6 (IPv6): [startHex32, endHex32, countryCode, region, asnNumber, org]，定长 hex 字典序
  rows: [],
  rows6: [],
  note: 'Empty until the deploy-time build writes shards into ./assets/geo/. Never fabricate values.',
};
