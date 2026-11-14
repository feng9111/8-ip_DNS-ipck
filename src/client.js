// 8号 h8 · 浏览器编排。唯一触发点是按钮 click；页面加载不自动跑、不预取、不提前连 STUN。
// h7 修复（针对线上「结果渲染异常，连 IP 都出不来」）+ h8（__name 兜底 / 中文译名 / 红字降级）：
//   1) IP 块改为原生兜底渲染，不依赖 IPCK_RENDER / IPCK_SOURCE 任一模块或函数；
//   2) paint() 拆成 4 段独立 try/catch，一个模块坏了不拖垮其余三块；
//   3) catch 把真实异常 name + message 显示在诊断条，不再用一句笼统文案吞掉；
//   4) 能力自检从「模块对象存在」细化到「必需函数存在」，缺哪个直接点名；
//   5) 富渲染只作为增强覆盖，失败时保留兜底 IP，绝不把三个框一起清空。
// 合规门控不变：features.webrtc=false → 不创建 RTCPeerConnection、不连任何 STUN；
// 同意 + 可导出回执留在本机 localStorage，服务端零留存；撤回即清除、署名常驻。
export const CLIENT_JS = `
(function () {
  var L = window.IPCK_I18N || {};
  var page = window.IPCK_PAGE || {};
  var LEGAL = ['about', 'privacy', 'terms', 'rights'];
  if (page && LEGAL.indexOf(page.structure) >= 0) return;
  var features = page.features || { ip: true, dns: false, webrtc: false };
  var running = false;
  var btn = document.getElementById('ipck-run');
  var bar = document.getElementById('ipck-progress');
  var diag = document.getElementById('ipck-diag');
  var API_TIMEOUT_MS = 4000;
  // h9 · 任意 IP 输入区
  var input = document.getElementById('ipck-ip-input');
  var lookupBtn = document.getElementById('ipck-lookup-run');
  var lookupClear = document.getElementById('ipck-lookup-clear');

  var consentBox = document.getElementById('ipck-consent-box');
  var revokeBtn = document.getElementById('ipck-consent-revoke');
  var receiptBtn = document.getElementById('ipck-consent-receipt');
  var consentState = document.getElementById('ipck-consent-state');
  var CONSENT_KEY = 'ipck.consent.ip.v2';
  var RECEIPT_KEY = 'ipck.consent.receipt.v2';

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function T(k, d) { return Object.prototype.hasOwnProperty.call(L, k) ? L[k] : (d || k); }
  // h8 · 展示层中文译名：只在 zh-CN 生效，原始值放括号内，绝不改动数据。
  function geoCtx() {
    try { return (page.lang === 'zh-CN' && window.IPCK_GEO_ZH) ? window.IPCK_GEO_ZH : null; }
    catch (e) { return null; }
  }
  function loc(G, kind, v) {
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
  function safeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function safeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function safeDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function consentGranted() { return safeGet(CONSENT_KEY) === 'granted'; }
  function sbCtx() { return { lib: page.lib || null, contact: page.contact || '' }; }

  // h7：不依赖任何注入模块的 IP 兜底渲染。只要 /api/ip 回了 JSON，IP 就一定看得见。
  function fallbackIpHtml(data) {
    var d = data || {};
    if (!d.started) return '<div class="ipck-empty">' + esc(T('ov.empty', '尚未检测')) + '</div>';
    if (d.ipError || !d.ip) {
      return '<div class="ipck-notice"><b>' + esc(T('ip.apiUnreachableTitle', '接口未连通')) + '</b><p>' +
        esc(T('ip.apiUnreachableBody', '/api/ip 未返回数据；这不是浏览器未暴露。')) + '</p></div>';
    }
    var ip = d.ip;
    if (ip.queryMode === 'manual') return manualIpHtml(ip);
    if (ip.ip == null && ip.edgeOk === false) {
      return '<div class="ipck-notice"><b>' + esc(T('ip.edgeMissingTitle', '未取得本次连接 IP')) + '</b><p>' +
        esc(T('ip.edgeMissingBody', '请把域名设为橙云代理并把 route 绑定到本 Worker。')) + '</p></div>';
    }
    var f = ip.fields || {};
    var G = geoCtx();
    // h21 · 库有什么就显示什么：候选四项，值为空整块不渲染，绝不摆空框、绝不写占位。
    var rows = [
      ['ov.country', '国家', loc(G, 'country', f.country)],
      ['ov.region', '地区', loc(G, 'region', f.region)],
      ['ov.asn', 'ASN', f.asn],
      ['ov.isp', '运营商', loc(G, 'isp', f.isp)]
    ];
    var out = subjectLine(ip, false) + '<div class="ipck-summary-ip"><span>' + esc(T('ov.ip', 'IP 地址')) + '</span><b>' +
      esc(ip.ip || T('state.notExposed', '浏览器未暴露')) + '</b></div>';
    out += '<div class="ipck-grid-fields">';
    for (var i = 0; i < rows.length; i++) {
      var v = rows[i][2];
      if (v == null || v === '') continue;
      out += '<div class="ipck-field"><span>' + esc(T(rows[i][0], rows[i][1])) + '</span><b>' + esc(v) + '</b></div>';
    }
    out += '</div>';
    out += '<p class="ipck-precision">' + esc(ip.libVersion || T('ip.libMissing', '离线库未加载 · 版本未知')) +
      ' · ' + esc(ip.source || '') + '</p>';
    if (G) out += '<p class="ipck-zh-note">' + esc(G.note) + '</p>';
    if (ip.attribution && ip.attribution.url) {
      out += '<div class="ipck-attr"><a href="' + esc(ip.attribution.url) +
        '" rel="noopener noreferrer nofollow" target="_blank">' + esc(ip.attribution.label) + '</a> · ' +
        esc(ip.attribution.license) + '</div>';
    }
    return out;
  }

  // h9 · 查询对象标签：本机观测 / 用户输入的 IP，绝不混为一谈。
  function subjectLine(ip, manual) {
    var key = manual ? 'lookup.subjectManual' : 'lookup.subjectSelf';
    var fallback = manual ? 'Subject: the IP you entered' : 'Subject: this connection';
    return '<div class="ipck-subject' + (manual ? ' manual' : '') + '">' + esc(T(key, fallback)) + '</div>';
  }
  function attrHtml(ip) {
    if (!ip || !ip.attribution || !ip.attribution.url) return '';
    return '<div class="ipck-attr"><a href="' + esc(ip.attribution.url) +
      '" rel="noopener noreferrer nofollow" target="_blank">' + esc(ip.attribution.label) + '</a> · ' +
      esc(ip.attribution.license) + '</div>';
  }
  // h9 · 输入模式专用渲染：库未加载 / 无归属行 / 非法输入都给明确结论，不铺一排「未暴露」。
  function manualIpHtml(ip) {
    var out = subjectLine(ip, true);
    var st = ip.status;
    if (st === 'invalid') {
      return out + '<div class="ipck-notice"><p>' +
        esc(T('lookup.invalid', 'Not a valid IPv4 or IPv6 address. No request was made.')) + '</p></div>' + attrHtml(ip);
    }
    if (st === 'lib-not-loaded') {
      return out + '<div class="ipck-notice"><b>' + esc(T('lookup.libMissingTitle', '离线库未加载')) + '</b><p>' +
        esc(T('lookup.libMissing', 'Offline library not loaded.')) + '</p></div>' +
        '<p class="ipck-scope">' + esc(ip.message || '') + '</p>' + attrHtml(ip);
    }
    if (st === 'no-row') {
      return out + '<div class="ipck-summary-ip"><span>' + esc(T('ov.ip', 'IP 地址')) + '</span><b>' +
        esc(ip.ip || '') + '</b></div>' +
        '<div class="ipck-notice"><b>' + esc(T('lookup.noRowTitle', '该地址无公开归属数据')) + '</b><p>' +
        esc(T('lookup.noRow', 'No public attribution row.')) + '</p></div>' +
        '<p class="ipck-precision">' + esc(ip.libVersion || '') + '</p>' + attrHtml(ip);
    }
    var f = ip.fields || {};
    var G = geoCtx();
    // h21 · 同上：只渲染该次命中里真实有值的字段。
    var rows = [
      ['ov.country', '国家', loc(G, 'country', f.country)],
      ['ov.region', '地区', loc(G, 'region', f.region)],
      ['ov.asn', 'ASN', f.asn],
      ['ov.isp', '运营商', loc(G, 'isp', f.isp)]
    ];
    out += '<div class="ipck-summary-ip"><span>' + esc(T('ov.ip', 'IP 地址')) + '</span><b>' + esc(ip.ip || '') + '</b></div>';
    out += '<div class="ipck-grid-fields">';
    for (var i = 0; i < rows.length; i++) {
      var v = rows[i][2];
      if (v == null || v === '') continue;
      out += '<div class="ipck-field"><span>' + esc(T(rows[i][0], rows[i][1])) + '</span><b>' + esc(v) + '</b></div>';
    }
    out += '</div>';
    out += '<p class="ipck-precision">' + esc(ip.libVersion || '') + ' · ' + esc(ip.source || '') + '</p>';
    out += '<p class="ipck-scope">' + esc(T('lookup.scopeNote', 'Results describe an IP range, not a person.')) + '</p>';
    if (G) out += '<p class="ipck-zh-note">' + esc(G.note) + '</p>';
    return out + attrHtml(ip);
  }

  function clearResults() {
    ['ip', 'dns', 'rtc'].forEach(function (k) {
      var el = document.getElementById('ipck-' + k);
      if (el) el.innerHTML = '<div class="ipck-empty">' + esc(T('ov.empty', '尚未检测')) + '</div>';
    });
    try {
      var sb = document.getElementById('ipck-sourcebar');
      var S = window.IPCK_SOURCE;
      if (sb && S && typeof S.buildSourceBar === 'function' && typeof S.renderSourceBarHtml === 'function') {
        sb.innerHTML = S.renderSourceBarHtml(S.buildSourceBar({}, sbCtx()), L, sbCtx());
      }
    } catch (e) { /* 撤回时源条失败不影响结果清空 */ }
    if (diag) diag.innerHTML = esc(T('diag.idle', '等待检测 · 未发起任何请求'));
    if (input) input.value = '';
  }
  function syncConsent() {
    var granted = consentGranted();
    if (consentBox) consentBox.checked = granted;
    if (btn) btn.disabled = running || !granted;
    if (lookupBtn) lookupBtn.disabled = running || !granted;
    if (input) input.disabled = running;
    if (revokeBtn) revokeBtn.disabled = !granted;
    if (receiptBtn) receiptBtn.disabled = !granted;
    if (consentState) {
      consentState.className = 'ipck-consent-state' + (granted ? ' on' : '');
      consentState.textContent = granted ? (T('consent.granted', '') || '') : '';
    }
  }
  if (consentBox) consentBox.addEventListener('change', function () {
    if (consentBox.checked) {
      safeSet(CONSENT_KEY, 'granted');
      safeSet(RECEIPT_KEY, JSON.stringify({
        site: 'ipckit', build: page.version || 'h19', policyVersion: page.policyVersion || '',
        scope: 'ip-lookup (self connection + user-entered IP, local offline library only)', legalBasis: 'GDPR Art.6(1)(a) consent',
        consentedAt: new Date().toISOString(), lang: page.lang || '',
        note: 'Device-local receipt. No server-side record exists.'
      }));
    } else {
      safeDel(CONSENT_KEY); safeDel(RECEIPT_KEY); clearResults();
    }
    syncConsent();
  });
  if (revokeBtn) revokeBtn.addEventListener('click', function () {
    safeDel(CONSENT_KEY); safeDel(RECEIPT_KEY);
    clearResults(); syncConsent();
  });
  if (receiptBtn) receiptBtn.addEventListener('click', function () {
    var raw = safeGet(RECEIPT_KEY);
    if (!raw) { if (consentState) consentState.textContent = T('consent.receiptNone', ''); return; }
    try {
      var blob = new Blob([raw], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'ipckit-consent-receipt.json';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      if (consentState) consentState.textContent = T('consent.receiptExport', '');
    } catch (e) {}
  });
  syncConsent();

  var MODULES = ['IPCK_RENDER', 'IPCK_DNS', 'IPCK_RTC', 'IPCK_SOURCE'];
  var CAPS = [
    ['IPCK_RENDER', 'renderResultBlocks'], ['IPCK_RENDER', 'renderDiagHtml'],
    ['IPCK_DNS', 'emptyResult'], ['IPCK_RTC', 'collectCandidates'],
    ['IPCK_SOURCE', 'buildSourceBar'], ['IPCK_SOURCE', 'renderSourceBarHtml']
  ];
  var missingMods = MODULES.filter(function (k) { return !window[k]; });
  var missingFns = CAPS.filter(function (c) {
    return !window[c[0]] || typeof window[c[0]][c[1]] !== 'function';
  }).map(function (c) { return c[0] + '.' + c[1]; });

  function setRunning(on) {
    if (bar) bar.hidden = !on;
    if (btn) {
      btn.disabled = on || !consentGranted();
      btn.textContent = on ? (T('shell.running', 'Running') || 'Running') : (T('shell.run', 'Run') || 'Run');
    }
    if (lookupBtn) {
      lookupBtn.disabled = on || !consentGranted();
      lookupBtn.textContent = on ? (T('lookup.running', 'Looking up…') || 'Looking up…') : (T('lookup.run', 'Look up') || 'Look up');
    }
    if (input) input.disabled = on;
  }
  function errText(e) {
    return String((e && e.name) || 'Error') + ': ' + String((e && e.message) || e || 'unknown');
  }
  function setDiag(html) { if (diag) diag.innerHTML = html; }
  function badDiag(msg, detail) {
    setDiag('<span class="ipck-diag-bad">' + esc(msg) +
      (detail ? ' <small>[' + esc(detail) + ']</small>' : '') + '</span>');
  }

  // h7：四段独立。任何一段抛错都只影响自己，IP 永远先落地。
  function paint(data) {
    var errs = [];
    var gaps = [];
    var manual = !!(data.ip && data.ip.queryMode === 'manual');

    // 段 1：IP 原生兜底（零模块依赖）
    try {
      var ipEl = document.getElementById('ipck-ip');
      if (ipEl) ipEl.innerHTML = fallbackIpHtml(data);
    } catch (e) { errs.push('ip-fallback ' + errText(e)); }

    // 段 2：富渲染增强（失败保留段 1 的 IP）。
    // h9：手动查询由段 1 独占，避免富渲染把「库未加载 / 无归属行」盖成一排「未暴露」。
    if (!manual) {
      try {
        var R = window.IPCK_RENDER;
        if (R && typeof R.renderResultBlocks === 'function') {
          var blocks = R.renderResultBlocks(data, L, page.mode || 'overview');
          ['ip', 'dns', 'rtc'].forEach(function (k) {
            var el = document.getElementById('ipck-' + k);
            if (el && blocks && blocks[k + 'Html']) el.innerHTML = blocks[k + 'Html'];
          });
        }
        if (R && typeof R.renderDiagHtml === 'function') {
          setDiag(R.renderDiagHtml(data, L));
        }
      } catch (e) { errs.push('render ' + errText(e)); }
    }

    // 段 3：底部来源条 + 常驻署名
    try {
      var S = window.IPCK_SOURCE;
      var sb = document.getElementById('ipck-sourcebar');
      if (S && sb && typeof S.buildSourceBar === 'function' && typeof S.renderSourceBarHtml === 'function') {
        sb.innerHTML = S.renderSourceBarHtml(S.buildSourceBar(data, sbCtx()), L, sbCtx());
      } else if (S && sb) {
        gaps.push('IPCK_SOURCE.buildSourceBar/renderSourceBarHtml');
      }
    } catch (e) { errs.push('sourcebar ' + errText(e)); }

    // 段 4：诊断条补真实异常（不再吞）；缺函数运行时重算，避免加载后版本错配被漏报
    try {
      CAPS.forEach(function (c) {
        if (!window[c[0]] || typeof window[c[0]][c[1]] !== 'function') {
          if (gaps.indexOf(c[0] + '.' + c[1]) < 0) gaps.push(c[0] + '.' + c[1]);
        }
      });
    } catch (e) { /* 自检本身失败不影响结果 */ }
    var ipOk = !!(data.ip && !data.ipError && data.ip.ip != null && data.ip.ip !== '');
    if (errs.length && !ipOk) {
      badDiag(T('diag.renderFail', '✗ 结果渲染异常，按钮已复位；请刷新后重试。'), errs.join(' | '));
    } else if (errs.length && ipOk) {
      // h8：真实观测值已落地，增强层异常只记进 console，不再弹红条干扰用户。
      try { if (window.console && console.warn) console.warn('[ipckit] enhancement skipped: ' + errs.join(' | ')); } catch (e) {}
      setDiag('<span class="ipck-diag-ok">' + esc(T('diag.enhancedFallback', '真实观测值已用基础渲染显示')) + '</span>');
    } else if (gaps.length) {
      setDiag('<span class="ipck-diag-warn">' +
        esc(T('diag.partial', '部分增强模块未加载，IP 结果已用兜底渲染（数值仍为真实观测）')) +
        ' <small>[' + esc(gaps.join(', ')) + ']</small></span>');
    }
  }

  function fetchJson(path) {
    return new Promise(function (resolve, reject) {
      var ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        if (ctl) { try { ctl.abort(); } catch (e) {} }
        reject(new Error('timeout'));
      }, API_TIMEOUT_MS);
      var opts = { cache: 'no-store' };
      if (ctl) opts.signal = ctl.signal;
      fetch(path, opts).then(function (r) {
        if (!r.ok) throw new Error('status-' + r.status);
        return r.json();
      }).then(function (j) {
        if (settled) return;
        settled = true; clearTimeout(timer); resolve(j);
      }).catch(function (e) {
        if (settled) return;
        settled = true; clearTimeout(timer); reject(e);
      });
    });
  }
  function probe(path, key) {
    return fetchJson(path).then(function (v) { return { key: key, ok: true, v: v }; })
      .catch(function (e) { return { key: key, ok: false, err: String((e && e.message) || e) }; });
  }

  // h7：WebRTC 未启用时不调用采集器，连 RTCPeerConnection 都不创建。
  function rtcDisabled() {
    return Promise.resolve({
      supported: false, candidates: [], reason: 'disabled in h7 (no STUN, no RTCPeerConnection)',
      source: 'none', observedAt: new Date().toISOString(), enabled: false
    });
  }

  async function run() {
    if (running) return;
    if (!consentGranted()) {
      badDiag(T('consent.required', '请先勾选同意'), '');
      return;
    }
    running = true;
    setRunning(true);
    setDiag('<span>' + esc(T('shell.checking', 'Requesting /api/* ...')) + '</span>');
    var data = { ip: null, dns: null, rtc: null, started: true, jsBroken: false, diag: {} };

    try {
      var rtcTask = features.webrtc
        ? (window.IPCK_RTC && typeof window.IPCK_RTC.collectCandidates === 'function'
            ? window.IPCK_RTC.collectCandidates({ timeoutMs: 3000 }).catch(rtcDisabled)
            : rtcDisabled())
        : rtcDisabled();

      var res = await Promise.all([
        probe('/api/health', 'health'),
        probe('/api/ip', 'ip'),
        probe('/api/dns/config', 'dns'),
        rtcTask
      ]);
      var h = res[0], a = res[1], c = res[2];
      data.rtc = res[3];

      var timedOut = [h, a, c].some(function (x) { return x && !x.ok && /timeout/.test(x.err || ''); });
      if (h.ok && h.v && h.v.ok === true) {
        var eo = !!(h.v.edge && h.v.edge.hasCfConnectingIp);
        data.diag = { apiDown: false, apiTimeout: false, edgeOk: eo, edgeMissing: !eo, version: h.v.version };
      } else {
        data.diag = { apiDown: true, apiTimeout: timedOut, edgeOk: false, edgeMissing: false };
      }
      if (a.ok && a.v && typeof a.v === 'object' && ('ip' in a.v)) {
        a.v.edgeOk = !!(data.diag.edgeOk);
        data.ip = a.v;
      } else {
        data.ip = null; data.ipError = true;
      }
      var D = window.IPCK_DNS;
      data.dns = (D && typeof D.emptyResult === 'function') ? D.emptyResult() :
        { configured: false, protocol: 'authoritative NS delegation required', resolvers: [], observedAt: new Date().toISOString() };
      if (!c.ok) data.dnsError = true;
    } catch (e) {
      data.diag = { apiDown: true, apiTimeout: false, edgeOk: false, edgeMissing: false };
    } finally {
      paint(data);
      running = false;
      setRunning(false);
    }
  }

  // h9 · 任意 IP 查询：前端只做粗校验，严格解析由服务端 ipKind 完成；
  // 不合法就不发请求，避免把随手输入当成查询行为记录下来。
  function plausibleIp(s) {
    if (!s || s.length > 64) return false;
    // 注意：本文件是模板字符串，正则里的反斜杠会被外层吞掉，故一律不用带转义的正则。
    for (var i = 0; i < s.length; i++) {
      if (!/[0-9a-fA-F:.]/.test(s.charAt(i))) return false;
    }
    if (s.indexOf(':') >= 0) return true;
    var p = s.split('.');
    if (p.length !== 4) return false;
    for (var j = 0; j < 4; j++) {
      if (!/^[0-9]{1,3}$/.test(p[j]) || Number(p[j]) > 255) return false;
    }
    return true;
  }
  async function runLookup() {
    if (running) return;
    if (!consentGranted()) { badDiag(T('consent.required', '请先勾选同意'), ''); return; }
    if (!input) return;
    var raw = String(input.value || '').trim();
    if (!plausibleIp(raw)) {
      badDiag(T('lookup.invalid', 'Not a valid IPv4 or IPv6 address. No request was made.'), '');
      return;
    }
    running = true;
    setRunning(true);
    setDiag('<span>' + esc(T('lookup.running', 'Looking up…')) + '</span>');
    try {
      var j = await fetchJson('/api/lookup?ip=' + encodeURIComponent(raw));
      var data = {
        ip: j, dns: null, rtc: null, started: true, jsBroken: false,
        diag: { apiDown: false, apiTimeout: false, edgeOk: true, edgeMissing: false, version: page.version }
      };
      paint(data);
      if (j.status === 'ok') {
        setDiag('<span class="ipck-diag-ok">' + esc(T('lookup.diagOk', '✓ 查询完成')) + '</span>');
      } else if (j.status === 'lib-not-loaded') {
        setDiag('<span class="ipck-diag-warn">' + esc(T('lookup.diagLib', '⚠ 离线库未加载，输入查询不可用')) + '</span>');
      } else if (j.status === 'no-row') {
        setDiag('<span>' + esc(T('lookup.noRowTitle', '该地址无公开归属数据')) + '</span>');
      } else {
        badDiag(T('lookup.invalid', 'Not a valid IPv4 or IPv6 address. No request was made.'), '');
      }
    } catch (e) {
      badDiag(T('diag.apiDown', '✗ 接口不通'), errText(e));
    } finally {
      running = false;
      setRunning(false);
    }
  }

  if (btn) btn.addEventListener('click', run);
  if (lookupBtn) lookupBtn.addEventListener('click', runLookup);
  if (input) input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); runLookup(); }
  });
  if (lookupClear) lookupClear.addEventListener('click', function () {
    clearResults();
    syncConsent();
  });
  // 刻意不注册 DOMContentLoaded / load 自动执行：一律等用户点按钮。
})();
`;
