// 8号 h8 · L2 接入壳：母版 HTML + canonical/hreflang + 法务页渲染。
// L1 模块以 toString() 原样注入浏览器；页面自身零第三方请求、零硬编码主机名。
import { LANGS, XDEFAULT, STRUCTURES, LEGAL_KEYS, GEO_ZH, pathFor, dictFor, t } from './i18n.js';
import { CSS } from './styles.js';
import { renderResultBlocks } from './core/render.js';
import { buildSourceBar, renderSourceBarHtml } from './core/sourcebar.js';
import { DNS_BROWSER_SRC } from './core/dns.js';
import { RTC_BROWSER_SRC } from './core/rtc.js';
import { RENDER_BROWSER_SRC } from './core/render.js';
import { SOURCE_BROWSER_SRC } from './core/sourcebar.js';
import { CLIENT_JS } from './client.js';


// ---------------------------------------------------------------------------
// h8 · 浏览器 helper shim（修 iOS Safari 真机 "Can't find variable: __name"）
// 成因：wrangler / esbuild 的 keepNames 会把函数体内的匿名函数表达式包装成
// __name(function(){...}, "L")；本模板用 Function.toString() 把模块注入浏览器，
// helper 定义留在 Worker bundle 顶层，浏览器端没有 → Safari 严格抛 ReferenceError，
// Chromium 直跑源码时不复现。每段内联脚本自带一份幂等兜底，从此不依赖外层作用域。
// 用 var 声明（可重复），覆盖 esbuild 常用 helper，全部为无副作用的安全版本。
// ---------------------------------------------------------------------------
const BROWSER_SHIM = [
  "var __name = function (f, n) { try { Object.defineProperty(f, 'name', { value: n, configurable: true }); } catch (e) {} return f; };",
  "var __defProp = function (o, k, d) { try { return Object.defineProperty(o, k, d); } catch (e) { return o; } };",
  "var __defNormalProp = function (o, k, v) { try { o[k] = v; } catch (e) {} return o; };",
  "var __publicField = function (o, k, v) { try { o[k] = v; } catch (e) {} return o; };",
  "var __accessCheck = function () {};",
  "var __copyProps = function (a, b) { try { return Object.assign(a, b); } catch (e) { return a; } };",
  "var __getOwnPropDesc = Object.getOwnPropertyDescriptor;",
  "var __getOwnPropNames = Object.getOwnPropertyNames;",
  "var __hasOwnProp = Object.prototype.hasOwnProperty;",
  "var __spreadValues = function (a, b) { try { return Object.assign({}, a, b); } catch (e) { return a; } };",
  "var __spreadArray = function (a, b) { try { return a.concat(b); } catch (e) { return a; } };",
].join('\n');

const LEGAL_SLUGS = {
  about: 'about', privacy: 'privacy', terms: 'terms', rights: 'data-rights',
};

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function navHtml(lang, structure) {
  const items = [
    ['shell.nav.dashboard', STRUCTURES[0].slug, true],
    ['shell.nav.network', STRUCTURES[1].slug, true],
    ['shell.nav.dns', STRUCTURES[2].slug, true],
    ['shell.nav.rtc', STRUCTURES[3].slug, true],
    ['shell.nav.about', STRUCTURES[4].slug, true],
    ['shell.nav.privacy', STRUCTURES[5].slug, true],
    ['shell.nav.terms', STRUCTURES[6].slug, true],
    ['shell.nav.rights', STRUCTURES[7].slug, true],
  ];
  let out = '';
  for (const [key, slug, link] of items) {
    const active = structure.slug === slug ? ' is-active' : '';
    out += link
      ? '<a class="' + active.trim() + '" href="' + esc(pathFor(lang.slug, slug)) + '">' + esc(t(lang.code, key)) + '</a>'
      : '<span>' + esc(t(lang.code, key)) + '</span>';
  }
  out += '<span>' + esc(t(lang.code, 'shell.nav.history')) + '</span>';
  out += '<span>' + esc(t(lang.code, 'shell.nav.settings')) + '</span>';
  return out;
}

function methodHtml(lang, structure, labels) {
  const prefix = structure.key + '.method';
  const keys = [prefix + '1', prefix + '2', prefix + '3', prefix + '4'];
  let li = '';
  for (const k of keys) {
    if (labels[k]) li += '<li>' + esc(labels[k]) + '</li>';
  }
  if (!li) return '';
  return '<section class="ipck-method"><h2>' + esc(t(lang.code, 'method.title')) + '</h2><ol>' + li + '</ol></section>';
}

// 法务页：把纯文本文案里的邮箱与内部页占位符转成真实链接（esc 之后替换，杜绝注入）。
function richText(lang, text, contact) {
  let out = esc(text);
  const mail = '<a href="mailto:' + esc(contact) + '" rel="noopener noreferrer">' + esc(contact) + '</a>';
  out = out.replace(/yokok8@outlook\.com/g, mail);
  const labels = {
    '{{about}}': t(lang.code, 'shell.nav.about'),
    '{{privacy}}': t(lang.code, 'shell.nav.privacy'),
    '{{terms}}': t(lang.code, 'shell.nav.terms'),
    '{{rights}}': t(lang.code, 'shell.nav.rights'),
  };
  for (const k of Object.keys(labels)) {
    const href = pathFor(lang.slug, LEGAL_SLUGS[{ '{{about}}': 'about', '{{privacy}}': 'privacy', '{{terms}}': 'terms', '{{rights}}': 'rights' }[k]]);
    out = out.split(k).join('<a href="' + esc(href) + '">' + esc(labels[k]) + '</a>');
  }
  return out;
}

function legalHtml(lang, structure, opts) {
  const L = dictFor(lang.code);
  let out = '<section class="ipck-legal">';
  out += '<h2>' + esc(t(lang.code, structure.key + '.sectionTitle')) + '</h2>';
  for (let i = 1; i <= 14; i++) {
    const k = structure.key + '.p' + i;
    if (L[k]) out += '<p>' + richText(lang, L[k], opts.contact) + '</p>';
  }
  out += '<p class="ipck-legal-meta">' + esc(t(lang.code, 'legal.effective')) + '</p>';
  out += '<p class="ipck-legal-links">' + richText(lang, t(lang.code, 'legal.links'), opts.contact) + '</p>';
  out += '<a class="ipck-lang" href="' + esc(pathFor(lang.slug, '')) + '">' + esc(t(lang.code, 'legal.back')) + '</a>';
  out += '</section>';
  return out;
}

function consentHtml(lang, opts) {
  return '<div class="ipck-consent" id="ipck-consent">' +
    '<label><input type="checkbox" id="ipck-consent-box"><span>' + richText(lang, t(lang.code, 'consent.label'), opts.contact) + '</span></label>' +
    '<div class="ipck-consent-actions">' +
      '<a class="ipck-lang" href="' + esc(pathFor(lang.slug, 'privacy')) + '">' + esc(t(lang.code, 'consent.link')) + '</a>' +
      '<button class="ipck-btn" id="ipck-consent-receipt" type="button" disabled>' + esc(t(lang.code, 'consent.receipt')) + '</button>' +
      '<button class="ipck-btn" id="ipck-consent-revoke" type="button" disabled>' + esc(t(lang.code, 'consent.revoke')) + '</button>' +
    '</div>' +
    '<div class="ipck-consent-state" id="ipck-consent-state"></div>' +
  '</div>';
}

// h9 · 任意 IP 输入区：只在含 IP 结果面板的页面出现；法务页不出现。
// 纯 input + button，不是 form（CSP form-action 'none' 不需放宽）。
function lookupHtml(lang, opts) {
  const L = dictFor(lang.code);
  return '<section class="ipck-lookup" id="ipck-lookup">' +
    '<div class="ipck-lookup-head">' +
      '<h2>' + esc(L['lookup.title']) + '</h2>' +
      '<p>' + esc(L['lookup.hint']) + '</p>' +
    '</div>' +
    '<div class="ipck-lookup-row">' +
      '<input id="ipck-ip-input" type="text" inputmode="url" autocomplete="off" autocapitalize="off" ' +
        'spellcheck="false" maxlength="64" aria-label="' + esc(L['lookup.title']) + '" ' +
        'placeholder="' + esc(L['lookup.placeholder']) + '">' +
      '<button class="ipck-btn" id="ipck-lookup-run" type="button" disabled>' + esc(L['lookup.run']) + '</button>' +
      '<button class="ipck-btn ghost" id="ipck-lookup-clear" type="button">' + esc(L['lookup.clear']) + '</button>' +
    '</div>' +
  '</section>';
}

function makeNonce() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  let raw = '';
  for (let i = 0; i < a.length; i++) raw += String.fromCharCode(a[i]);
  return btoa(raw).replace(/=/g, '');
}

export function renderPage(opts) {
  const lang = opts.lang;
  const structure = opts.structure;
  const origin = opts.origin;
  const labels = dictFor(lang.code);
  const other = Object.values(LANGS).find(function (l) { return l.slug !== lang.slug; });
  const keyPrefix = structure.key === 'overview' ? 'ov' : structure.key;
  const title = t(lang.code, keyPrefix + '.title');
  const subtitle = t(lang.code, keyPrefix + '.subtitle');
  const canonical = origin + pathFor(lang.slug, structure.slug);
  const xdefault = origin + pathFor(LANGS[XDEFAULT].slug, structure.slug);
  const isLegal = LEGAL_KEYS.indexOf(structure.key) >= 0;
  const nonce = makeNonce();

  const emptyData = { ip: null, dns: null, rtc: null, started: false };
  const mode = structure.key === 'overview' ? 'overview' : structure.key;
  const blocks = renderResultBlocks(emptyData, labels, mode);
  const sbCtx = { lib: opts.lib || null, contact: opts.contact, labels: labels };
  const sourcebar = renderSourceBarHtml(buildSourceBar({}, sbCtx), labels, sbCtx);

  const showIp = structure.key === 'overview' || structure.key === 'ip';
  let panels = '';
  if (isLegal) {
    panels = legalHtml(lang, structure, opts);
  } else {
    const showDns = structure.key === 'overview' || structure.key === 'dns';
    const showRtc = structure.key === 'overview' || structure.key === 'rtc';
    if (showIp) panels += '<section class="ipck-panel"><h2>' + esc(t(lang.code, 'ov.sectionIp')) + '</h2><div id="ipck-ip">' + blocks.ipHtml + '</div></section>';
    if (showDns && showRtc) {
      panels += '<div class="ipck-cols">';
      panels += '<section class="ipck-panel"><h2>' + esc(t(lang.code, 'ov.sectionDns')) + '</h2><div id="ipck-dns">' + blocks.dnsHtml + '</div></section>';
      panels += '<section class="ipck-panel"><h2>' + esc(t(lang.code, 'ov.sectionRtc')) + '</h2><div id="ipck-rtc">' + blocks.rtcHtml + '</div></section>';
      panels += '</div>';
    } else {
      if (showDns) panels += '<section class="ipck-panel"><h2>' + esc(t(lang.code, 'ov.sectionDns')) + '</h2><div id="ipck-dns">' + blocks.dnsHtml + '</div></section>';
      if (showRtc) panels += '<section class="ipck-panel"><h2>' + esc(t(lang.code, 'ov.sectionRtc')) + '</h2><div id="ipck-rtc">' + blocks.rtcHtml + '</div></section>';
    }
    if (structure.key !== 'overview') panels += methodHtml(lang, structure, labels);
  }

  const pageJson = JSON.stringify({
    lang: lang.code,
    structure: structure.key,
    mode: mode,
    version: opts.version,
    policyVersion: opts.policyVersion,
    contact: opts.contact,
    publicMode: !!opts.publicMode,
    features: { ip: true, arbitraryIp: true, dns: false, webrtc: false },
    lib: opts.lib || null,
  });
  const dictJson = JSON.stringify(labels);
  const N = ' nonce="' + nonce + '"';
  const robotsMeta = opts.publicMode ? '' : '<meta name="robots" content="noindex, nofollow, noarchive">';

  const html = [
    '<!doctype html>',
    '<html lang="' + esc(lang.htmlLang) + '">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
    '<title>' + esc(title) + ' · ipckit</title>',
    robotsMeta,
    '<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 32 32\'%3E%3Crect width=\'32\' height=\'32\' rx=\'8\' fill=\'%230b1020\'/%3E%3Crect x=\'5.5\' y=\'5.5\' width=\'21\' height=\'21\' rx=\'6\' fill=\'none\' stroke=\'%237aa2ff\'/%3E%3Ctext x=\'16\' y=\'20\' text-anchor=\'middle\' font-family=\'monospace\' font-size=\'11\' fill=\'%237aa2ff\'%3Eip%3C/text%3E%3C/svg%3E">',
    '<link rel="canonical" href="' + esc(canonical) + '">',
    '<link rel="alternate" hreflang="zh-CN" href="' + esc(origin + pathFor('zh', structure.slug)) + '">',
    '<link rel="alternate" hreflang="en" href="' + esc(origin + pathFor('en', structure.slug)) + '">',
    '<link rel="alternate" hreflang="x-default" href="' + esc(xdefault) + '">',
    '<style' + N + '>' + CSS + '</style>',
    '</head>',
    '<body>',
    '<div class="ipck-shell">',
    '  <aside class="ipck-side">',
    '    <div class="ipck-brand"><span class="ipck-logo">ip</span><span>' + esc(t(lang.code, 'shell.brand')) + '</span></div>',
    '    <div class="ipck-tag">' + esc(t(lang.code, 'shell.tagline')) + '</div>',
    '    <nav class="ipck-nav">' + navHtml(lang, structure) + '</nav>',
    '    <div class="ipck-side-foot"><a href="mailto:' + esc(opts.contact) + '">' + esc(opts.contact) + '</a> · ' + esc(t(lang.code, 'shell.foot')) + '</div>',
    '  </aside>',
    '  <div class="ipck-main">',
    '    <header class="ipck-top">',
    '      <div class="ipck-top-row">',
    '        <div><h1>' + esc(title) + '</h1><p>' + esc(subtitle) + '</p></div>',
    '        <div class="ipck-actions">',
    '          <a class="ipck-lang" href="' + esc(pathFor(other.slug, structure.slug)) + '">' + esc(t(lang.code, 'shell.langSwitch')) + '</a>',
    isLegal ? '' : ('          <button class="ipck-btn" id="ipck-run" type="button" disabled>' + esc(t(lang.code, 'shell.run')) + '</button>'),
    '        </div>',
    '      </div>',
    '      <div class="ipck-progress" id="ipck-progress" hidden><div class="ipck-progress-fill"></div></div>',
    '    </header>',
    isLegal ? '' : consentHtml(lang, opts),
    (isLegal || !(showIp)) ? '' : lookupHtml(lang, opts),
    isLegal ? '' : ('    <div class="ipck-diag" id="ipck-diag">' + esc(t(lang.code, 'diag.idle')) + '</div>'),
    '    <main class="ipck-content">' + panels + '</main>',
    '    <footer class="ipck-sourcebar" id="ipck-sourcebar">' + sourcebar + '</footer>',
    '  </div>',
    '</div>',
    '<script' + N + '>' + BROWSER_SHIM + '\n' + 'window.IPCK_I18N = ' + dictJson + ';</script>',
    '<script' + N + '>' + BROWSER_SHIM + '\n' + 'window.IPCK_PAGE = ' + pageJson + ';</script>',
    '<script' + N + '>' + BROWSER_SHIM + '\n' + 'window.IPCK_GEO_ZH = ' + JSON.stringify(GEO_ZH) + ';</script>',
    '<script' + N + '>' + BROWSER_SHIM + '\n' + DNS_BROWSER_SRC + '</script>',
    '<script' + N + '>' + BROWSER_SHIM + '\n' + RTC_BROWSER_SRC + '</script>',
    '<script' + N + '>' + BROWSER_SHIM + '\n' + RENDER_BROWSER_SRC + '</script>',
    '<script' + N + '>' + BROWSER_SHIM + '\n' + SOURCE_BROWSER_SRC + '</script>',
    '<script' + N + '>' + BROWSER_SHIM + '\n' + CLIENT_JS + '</script>',
    '</body>',
    '</html>',
  ].join('\n');

  return { html: html, nonce: nonce };
}
