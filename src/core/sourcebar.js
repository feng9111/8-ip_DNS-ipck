// 8号 h8 · 数据源条 + 常驻许可署名（译名标注由字典 attr.modified 提供）。
// DB-IP 官方原文（download.db-ip.com/free）："In the case of a web application, you must include
// a link back to DB-IP.com on pages that display or use results from the database." + 官方片段
// "IP Geolocation by DB-IP"。其 TOS 另注明部分地名源自 GeoNames（同为 CC BY）。
// 因此署名不依赖「库是否加载 / 是否点过检测」，所有结果页与法务页一律常驻，撤回同意重绘后仍在。
// 本模块以 toString() 注入浏览器，故不得出现 import，也不得引用未随注入带上的外部变量。
const SB_DBIP_URL = 'https://db-ip.com/';
const SB_LICENSE_URL = 'https://creativecommons.org/licenses/by/4.0/';
const SB_GEONAMES_URL = 'https://www.geonames.org/';
const SB_DBIP_LABEL = 'IP Geolocation by DB-IP';

export function sbEsc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function renderAttributionHtml(labels, ctx) {
  var L = function (k, d) { return labels && Object.prototype.hasOwnProperty.call(labels, k) ? labels[k] : (d || k); };
  var lib = ctx && ctx.lib;
  var ready = !!(lib && lib.status === 'ready');
  var ver = ready ? (lib.version || lib.buildMonth || '') : '';
  var verLine = ready
    ? '<span class="ipck-attr-version">' + sbEsc(L('attr.libReady', 'DB-IP Lite version')) + ' ' + sbEsc(ver) + '</span>'
    : '<span class="ipck-attr-version off">' + sbEsc(L('attr.libMissing', 'Offline library not loaded')) + '</span>';
  var out = '<div class="ipck-attr-block">' +
    '<b>' + sbEsc(L('attr.title', 'Data & licence credits')) + '</b> · ' +
    '<a href="' + SB_DBIP_URL + '" rel="noopener noreferrer" target="_blank">' + sbEsc(SB_DBIP_LABEL) + '</a> · ' +
    '<a href="' + SB_LICENSE_URL + '" rel="noopener noreferrer" target="_blank">' + sbEsc(L('attr.license', 'CC BY 4.0')) + '</a> · ' +
    sbEsc(L('attr.geonames', 'Some place names (c) GeoNames contributors (CC BY 4.0)')).replace('GeoNames contributors', '<a href="' + SB_GEONAMES_URL + '" rel="noopener noreferrer" target="_blank">GeoNames contributors</a>') +
    '<span class="ipck-attr-note">' + sbEsc(L('attr.modified', 'Offline index reformatted only; original values unchanged.')) + ' ' + sbEsc(L('attr.licenseNote', 'This link is permanent on every page that uses DB-IP data.')) + '</span>' +
    verLine +
  '</div>';
  return out;
}

export function buildSourceBar(data, ctx) {
  var items = [];
  var d = data || {};
  if (d.ip) items.push({ label: 'IP', source: d.ip.source, lib: d.ip.libVersion, at: d.ip.observedAt });
  if (d.dns) items.push({ label: 'DNS', source: d.dns.configured ? 'authoritative NS query log' : d.dns.protocol, lib: 'n/a', at: d.dns.observedAt });
  if (d.rtc) items.push({ label: 'WebRTC', source: d.rtc.source, lib: 'browser ICE', at: d.rtc.observedAt });
  return { items: items, generatedAt: new Date().toISOString(), ctx: ctx || null };
}

export function renderSourceBarHtml(bar, labels, ctx) {
  var L = function (k) { return labels && Object.prototype.hasOwnProperty.call(labels, k) ? labels[k] : k; };
  var items = (bar && bar.items) || [];
  var out = '<div class="ipck-sb">';
  if (!items.length) {
    out += '<span>' + sbEsc(L('shell.waiting')) + '</span>';
  } else {
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      out += '<div class="ipck-sb-row"><b>' + sbEsc(it.label) + '</b><span>' + sbEsc(it.source) + '</span><span>' + sbEsc(it.lib) + '</span><span>' + sbEsc(it.at) + '</span></div>';
    }
    out += '<div class="ipck-sb-meta">' + sbEsc(L('shell.source')) + ' / ' + sbEsc(L('shell.lib')) + ' / ' + sbEsc(L('shell.observed')) + '</div>';
  }
  // 常驻：不因 items 为空、库未加载、撤回同意或重绘而消失。
  out += renderAttributionHtml(labels, ctx || (bar && bar.ctx) || null);
  out += '</div>';
  return out;
}

export const SOURCE_BROWSER_SRC = [
  "const SB_DBIP_URL = 'https://db-ip.com/';",
  "const SB_LICENSE_URL = 'https://creativecommons.org/licenses/by/4.0/';",
  "const SB_GEONAMES_URL = 'https://www.geonames.org/';",
  "const SB_DBIP_LABEL = 'IP Geolocation by DB-IP';",
  sbEsc.toString(),
  renderAttributionHtml.toString(),
  buildSourceBar.toString(),
  renderSourceBarHtml.toString(),
  'window.IPCK_SOURCE = { buildSourceBar, renderSourceBarHtml, renderAttributionHtml };',
].join('\n');
