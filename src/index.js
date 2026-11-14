// 8号 ip_DNS综合查询测试站 h18 · CF Worker 入口
// h18：IP 归属统一只读离线库；CF 边缘仅提供 cf-connecting-ip。
// h17：离线库已随包自带，部署路径零脚本；运行时只读一个静态分片。
// h16：装库搬到部署构建阶段（tools/build-lib.mjs），运行时零下载/零解压/零解析，修掉 Error 1102。
//      库改为随部署上传的静态 assets；KV 仅作兼容回退；月度更新由 CI 空 commit 触发重建。
// 默认仍是隔离测试态（noindex / robots 全禁）；对外开时把 [vars] PUBLIC_MODE 改 "true" 再 deploy。
import { LANGS, XDEFAULT, SITE, matchPath, pathFor, t } from './i18n.js';
import { renderPage } from './ui.js';
import { readIpInfo, readArbitraryIp } from './core/ip.js';
import { DNS_CONFIG, emptyResult } from './core/dns.js';
import { libMeta, ATTRIBUTION } from './core/geodb.js';
import { autoInstall, lastError, installedMonth, RUNTIME_NOTE } from './core/autolib.js';

const NOINDEX = 'noindex, nofollow, noarchive';

function isPublic(env) {
  return !!(env && String(env.PUBLIC_MODE || '').toLowerCase() === 'true');
}

function secHeaders(extra, nonce, publicMode) {
  // h6：webrtc 未启用，connect-src 不再放行 stun:，出站面收得更紧。
  // 页面用 per-response nonce（无 unsafe-inline）；非 HTML 响应直接禁脚本与样式。
  const csp = nonce
    ? "default-src 'self'; script-src 'nonce-" + nonce + "'; style-src 'nonce-" + nonce + "'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"
    : "default-src 'self'; script-src 'none'; style-src 'none'; connect-src 'none'; img-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";
  const h = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'X-IPCK-Version': SITE.version,
    'Content-Security-Policy': csp,
  };
  if (!publicMode) h['X-Robots-Tag'] = NOINDEX;
  if (extra) for (const k of Object.keys(extra)) h[k] = extra[k];
  return h;
}

function json(obj, status, env) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: secHeaders({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, null, isPublic(env)),
  });
}
function html(body, status, nonce, env) {
  return new Response(body, {
    status: status || 200,
    headers: secHeaders({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }, nonce, isPublic(env)),
  });
}
function redirect(location, status, env) {
  return new Response('', {
    status: status || 301,
    headers: secHeaders({ 'Location': location, 'Cache-Control': 'no-store' }, null, isPublic(env)),
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const publicMode = isPublic(env);

    // 1) 历史 .html 地址：永久 301 收敛到无扩展名（对齐 7号 v18 口径，绝不留 307）
    if (pathname.endsWith('.html')) {
      const stripped = pathname.slice(0, -5);
      const m = matchPath(stripped);
      if (m) return redirect(pathFor(m.lang.slug, m.structure.slug), 301, env);
    }

    // 2) 根路径按 Accept-Language 分流到各自独立 URL（不用 ?lang=、不靠 cookie）
    if (pathname === '/') {
      const al = (request.headers.get('accept-language') || '').toLowerCase();
      const slug = al.indexOf('zh') >= 0 ? 'zh' : 'en';
      return redirect(pathFor(slug, ''), 302, env);
    }

    // 3) robots：测试态全禁；对外态放行但依旧不主动提交 sitemap
    if (pathname === '/robots.txt') {
      const body = publicMode
        ? 'User-agent: *\nAllow: /\n'
        : 'User-agent: *\nDisallow: /\n';
      return new Response(body, {
        status: 200,
        headers: secHeaders({ 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }, null, publicMode),
      });
    }

    // 4) favicon 兜底，避免刷 404
    if (pathname === '/favicon.ico') {
      return new Response(null, { status: 204, headers: secHeaders(null, null, publicMode) });
    }

    // 5) API
    if (pathname === '/api/health') {
      const hasCfIp = !!request.headers.get('cf-connecting-ip');
      const cfKeys = Object.keys(request.cf || {}).sort();
      return json({
        ok: true,
        site: SITE.name,
        version: SITE.version,
        noindex: !publicMode,
        publicMode: publicMode,
        contact: SITE.contact,
        policyVersion: SITE.policyVersion,
        edge: {
          hasCfConnectingIp: hasCfIp,
          cfMetaKeys: cfKeys,
          hint: hasCfIp
            ? 'edge OK: IP/GeoIP fields available'
            : 'no cf-connecting-ip: set the hostname to proxied (orange cloud) and bind the route to this Worker',
        },
        lib: await libMeta(env),
        attribution: ATTRIBUTION,
        consentRequired: true,
        features: { ip: true, arbitraryIp: true, dns: false, webrtc: false },
        ipVersions: [4, 6],
        dataSource: 'DB-IP Lite offline library only (unified for self + manual)',
        edgeAttributionUsed: false,
        time: new Date().toISOString(),
      }, 200, env);
    }
    if (pathname === '/api/ip') {
      return json(Object.assign(await readIpInfo(request, env), { edgeOk: !!request.headers.get('cf-connecting-ip') }), 200, env);
    }
    // h9 · 任意 IP 查询：只接受一个 ip 参数，严格校验，本地离线库查表，零外网、零留存。
    if (pathname === '/api/lookup') {
      if ((request.method || 'GET') !== 'GET') return json({ status: 'invalid', error: 'GET only' }, 405, env);
      const raw = url.searchParams.get('ip');
      if (raw == null || raw.length > 128) {
        return json({ status: 'invalid', error: 'ip parameter required (max 128 chars)' }, 400, env);
      }
      // 拒绝控制字符与任何非 IP 字符，先做一层硬过滤，再由 ipKind 严格解析。
      if (/[^\x20-\x7e]/.test(raw) || /[\s,<>"'\\]/.test(raw)) {
        return json({ status: 'invalid', error: 'illegal characters in ip parameter' }, 400, env);
      }
      return json(await readArbitraryIp(raw.trim(), env), 200, env);
    }
    if (pathname === '/api/lib') {
      return json(Object.assign(await libMeta(env), {
        observedAt: new Date().toISOString(),
        attribution: ATTRIBUTION,
        note: 'Offline index is local (bundled inline or in static library files deployed with this site); no third-party lookup is performed.',
        auto: { builtIn: false, mode: 'ci-built', builtAt: 'deploy-time [build].command',
                monthly: 'GitHub Actions empty commit → Workers Builds',
                refresh: '/api/lib/refresh (status only, no runtime install)', runtime: RUNTIME_NOTE },
        lastError: await lastError(env),
      }), 200, env);
    }
    // h16 · 只回状态，不再在 Worker 里装库（h12 在这一步被 CF 掐成 Error 1102）。
    // 真库由部署构建阶段的 tools/build-lib.mjs 写入；push 一次或等每月自动重建即可。
    if (pathname === '/api/lib/refresh') {
      const r = await autoInstall(env);
      return json(r, 200, env);
    }
    if (pathname === '/api/dns/config') {
      return json(Object.assign({}, DNS_CONFIG, { result: emptyResult(), observedAt: new Date().toISOString() }), 200, env);
    }

    // 6) 16 个独立页面
    const m = matchPath(pathname);
    if (!m) {
      return html(
        '<!doctype html><html><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>404</title></head>' +
        '<body style="background:#0b1020;color:#e8edf7;font-family:system-ui;padding:40px"><h1>404</h1><p>Page not found / 页面不存在</p></body></html>',
        404, null, env
      );
    }
    const canonical = pathFor(m.lang.slug, m.structure.slug);
    if (pathname !== canonical) return redirect(canonical, 301, env);

    const rendered = renderPage({
      lang: m.lang,
      structure: m.structure,
      origin: url.origin,
      pathname: canonical,
      publicMode: publicMode,
      contact: SITE.contact,
      version: SITE.version,
      policyVersion: SITE.policyVersion,
      lib: await libMeta(env),
    });
    return html(rendered.html, 200, rendered.nonce, env);
  },

  // h16 · cron 仅作轻量心跳：纯读一个 KV key，0 下载 / 0 解压 / 0 解析 / 0 写入。
  // 真正的月度更新在 CI：dbip-monthly.yml 空 commit → Workers Builds → [build].command → build-lib.mjs。
  async scheduled(event, env, ctx) {
    ctx.waitUntil(installedMonth(env).then(() => null).catch(() => null));
  },
};
