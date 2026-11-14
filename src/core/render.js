// L1 · 结果渲染器。h8：中文页在展示层加译名，原始值放括号内，绝不写回数据。
export function escHtml(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function renderResultBlocks(data, labels, mode) {
  var L = function (k) { return labels && Object.prototype.hasOwnProperty.call(labels, k) ? labels[k] : k; };
  var d = data || {};
  var started = !!d.started;
  var m = mode || 'overview';
  // 展示层译名：Worker 端（globalThis.IPCK_PAGE 不存在）自动退化为不翻译。
  var G = (typeof globalThis !== 'undefined' && globalThis.IPCK_PAGE &&
           globalThis.IPCK_PAGE.lang === 'zh-CN' && globalThis.IPCK_GEO_ZH) ? globalThis.IPCK_GEO_ZH : null;
  function loc(kind, v) {
    if (!G || v == null || v === '') return v;
    var raw = String(v);
    var mp = (G.map && G.map[kind]) || {};
    if (mp[raw]) return mp[raw] + ' (' + raw + ')';
    if (kind === 'isp' && G.orgKeys) {
      for (var z = 0; z < G.orgKeys.length; z++) {
        if (raw.toLowerCase().indexOf(String(G.orgKeys[z][0]).toLowerCase()) >= 0)
          return G.orgKeys[z][1] + ' (' + raw + ')';
      }
    }
    return raw;
  }

  // ---- IP ----
  var ipHtml;
  if (!started) {
    ipHtml = '<div class="ipck-empty">' + escHtml(L('ov.empty')) + '</div>';
  } else if (d.ipError) {
    ipHtml = '<div class="ipck-notice"><b>' + escHtml(L('ip.apiUnreachableTitle')) + '</b><p>' + escHtml(L('ip.apiUnreachableBody')) + '</p></div>';
  } else if (!d.ip) {
    ipHtml = '<div class="ipck-empty">' + escHtml(L('state.notExposed')) + '</div>';
  } else if (d.ip.ip == null && d.ip.edgeOk === false) {
    // h3：边缘没注入头 ≠ 浏览器没暴露。明确区分部署层与观测层，不再误导。
    ipHtml = '<div class="ipck-notice"><b>' + escHtml(L('ip.edgeMissingTitle')) + '</b><p>' + escHtml(L('ip.edgeMissingBody')) + '</p></div>';
  } else {
    var f = d.ip.fields || {};
    var rows = [
      ['ov.country', loc('country', f.country)], ['ov.region', loc('region', f.region)], ['ov.asn', f.asn],
      ['ov.isp', loc('isp', f.isp)], ['ov.tz', loc('tz', f.tz)], ['ip.field.city', loc('city', f.city)],
    ];
    var big = m === 'ip'
      ? '<div class="ipck-big">' + escHtml(d.ip.ip || L('state.notExposed')) + '</div>'
      : '<div class="ipck-summary-ip"><span>' + escHtml(L('ov.ip')) + '</span><b>' + escHtml(d.ip.ip || L('state.notExposed')) + '</b></div>';
    var grid = '<div class="ipck-grid-fields">';
    for (var i = 0; i < rows.length; i++) {
      var val = (rows[i][1] == null || rows[i][1] === '') ? L('state.notExposed') : rows[i][1];
      grid += '<div class="ipck-field"><span>' + escHtml(L(rows[i][0])) + '</span><b>' + escHtml(val) + '</b></div>';
    }
    grid += '</div>';
    // h5 · 双源交叉校验：不替用户在两个真实观测里选一个，冲突就逐项列出。
    var x = d.ip.crossCheck || { state: 'no-secondary', diffs: [] };
    var crossHtml = '<div class="ipck-cross ' + (x.state === 'mismatch' ? 'warn' : (x.state === 'match' ? 'ok' : 'idle')) + '">';
    if (x.state === 'no-secondary') {
      crossHtml += '<b>' + escHtml(L('ip.crossNone')) + '</b><p>' + escHtml(L('ip.crossNoneBody')) + '</p>';
    } else if (x.state === 'mismatch') {
      crossHtml += '<b>' + escHtml(L('ip.crossMismatch')) + '</b><table class="ipck-table"><thead><tr><th>' + escHtml(L('ip.crossField')) + '</th><th>' + escHtml(L('ip.crossEdge')) + '</th><th>' + escHtml(L('ip.crossLibrary')) + '</th></tr></thead><tbody>';
      for (var q = 0; q < x.diffs.length; q++) {
        var df = x.diffs[q];
        crossHtml += '<tr><td>' + escHtml(df.field) + '</td><td>' + escHtml(df.edge) + '</td><td>' + escHtml(df.library) + '</td></tr>';
      }
      crossHtml += '</tbody></table>';
    } else {
      crossHtml += '<b>' + escHtml(L('ip.crossMatch')) + '</b>';
    }
    crossHtml += '</div>';
    var libState = (d.ip.lib && d.ip.lib.status === 'ready')
      ? escHtml(L('ip.libReady')) + ' · ' + escHtml(d.ip.libVersion)
      : escHtml(L('ip.libMissing'));
    var attrHtml = '';
    if (d.ip.attribution && d.ip.attribution.url) {
      attrHtml = '<div class="ipck-attr"><a href="' + escHtml(d.ip.attribution.url) + '" rel="noopener noreferrer nofollow" target="_blank">' + escHtml(d.ip.attribution.label) + '</a> · ' + escHtml(d.ip.attribution.license) + '</div>';
    }
    var zhNote = G ? '<p class="ipck-zh-note">' + escHtml(G.note) + '</p>' : '';
    ipHtml = big + grid + crossHtml + '<p class="ipck-precision">' + libState + ' · ' + escHtml(L('ip.precisionBody')) + '</p>' + attrHtml + zhNote;
  }

  // ---- DNS ----
  var dnsHtml;
  if (!started) {
    dnsHtml = '<div class="ipck-empty">' + escHtml(L('ov.empty')) + '</div>';
  } else if (!d.dns || !d.dns.configured) {
    dnsHtml = '<div class="ipck-notice"><b>' + escHtml(L('dns.notConfiguredTitle')) + '</b><p>' + escHtml(L('dns.notConfiguredBody')) + '</p></div>';
  } else if (!d.dns.resolvers || d.dns.resolvers.length === 0) {
    dnsHtml = '<div class="ipck-empty">' + escHtml(L('state.notExposed')) + '</div>';
  } else {
    dnsHtml = '<table class="ipck-table"><thead><tr><th>' + escHtml(L('dns.col.resolver')) + '</th><th>' + escHtml(L('dns.col.org')) + '</th><th>' + escHtml(L('dns.col.status')) + '</th></tr></thead><tbody>';
    for (var j = 0; j < d.dns.resolvers.length; j++) {
      var r = d.dns.resolvers[j];
      dnsHtml += '<tr><td>' + escHtml(r.ip) + '</td><td>' + escHtml(r.org || L('state.notExposed')) + '</td><td><span class="ipck-dot g"></span>' + escHtml(L('state.observed')) + '</td></tr>';
    }
    dnsHtml += '</tbody></table><p class="ipck-precision">' + escHtml(L('dns.precisionBody')) + '</p>';
  }

  // ---- WebRTC ----
  var rtcHtml;
  if (!started) {
    rtcHtml = '<div class="ipck-empty">' + escHtml(L('ov.empty')) + '</div>';
  } else if (!d.rtc || !d.rtc.supported) {
    rtcHtml = '<div class="ipck-notice"><p>' + escHtml(L('rtc.unsupported')) + '</p></div>';
  } else if (!d.rtc.candidates || d.rtc.candidates.length === 0) {
    rtcHtml = '<div class="ipck-empty">' + escHtml(L('rtc.notExposed')) + '</div>';
  } else {
    rtcHtml = '<table class="ipck-table"><thead><tr><th>' + escHtml(L('rtc.col.type')) + '</th><th>' + escHtml(L('rtc.col.address')) + '</th><th>' + escHtml(L('rtc.col.network')) + '</th><th>' + escHtml(L('rtc.col.status')) + '</th></tr></thead><tbody>';
    for (var k = 0; k < d.rtc.candidates.length; k++) {
      var c = d.rtc.candidates[k];
      var addr = c.exposed ? escHtml(c.address) : escHtml(L('rtc.notExposed'));
      var net = c.network === 'public' ? L('rtc.public') : (c.network === 'private' ? L('rtc.private') : L('rtc.notExposed'));
      var dot = c.exposed ? 'g' : 'n';
      var st = c.exposed ? L('state.observed') : L('rtc.notExposed');
      rtcHtml += '<tr><td>' + escHtml(c.type) + '</td><td>' + addr + '</td><td>' + escHtml(net) + '</td><td><span class="ipck-dot ' + dot + '"></span>' + escHtml(st) + '</td></tr>';
    }
    rtcHtml += '</tbody></table><p class="ipck-precision">' + escHtml(L('rtc.precisionBody')) + '</p>';
  }

  return { ipHtml: ipHtml, dnsHtml: dnsHtml, rtcHtml: rtcHtml };
}

// h3 · 诊断条：页面自己说清哪一层断了，用户不必去「证明版本」。
export function renderDiagHtml(data, labels) {
  var L = function (k) { return labels && Object.prototype.hasOwnProperty.call(labels, k) ? labels[k] : k; };
  var d = data || {};
  if (d.jsBroken) return '<span class="ipck-diag-bad">' + escHtml(L('diag.jsBroken')) + '</span>';
  if (!d.started) return '<span>' + escHtml(L('diag.idle')) + '</span>';
  var out = '';
  if (d.diag && d.diag.apiTimeout) out += '<span class="ipck-diag-bad">' + escHtml(L('diag.apiTimeout')) + '</span> ';
  else if (d.diag && d.diag.apiDown) out += '<span class="ipck-diag-bad">' + escHtml(L('diag.apiDown')) + '</span> ';
  else if (d.diag && d.diag.edgeMissing) out += '<span class="ipck-diag-bad">' + escHtml(L('diag.edgeMissing')) + '</span> ';
  else if (d.diag && d.diag.edgeOk) out += '<span class="ipck-diag-ok">' + escHtml(L('diag.edgeOk')) + '</span> ';
  if (d.dns && !d.dns.configured) out += '<span class="ipck-diag-warn">' + escHtml(L('diag.dnsNeedSetup')) + '</span>';
  return out || '<span>' + escHtml(L('common.error')) + '</span>';
}

export const RENDER_BROWSER_SRC = [
  escHtml.toString(),
  renderResultBlocks.toString(),
  renderDiagHtml.toString(),
  'window.IPCK_RENDER = { escHtml, renderResultBlocks, renderDiagHtml };',
].join('\n');
