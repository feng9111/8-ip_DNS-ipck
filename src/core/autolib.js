// 8号 h16 · 运行时只做「状态说明」，不做任何装库重活。
//
// h12 在这里放整套「下载 DB-IP 全量 CSV.GZ → gunzip → 几十万行排序合并 → 逐片写 KV」，
// 免费档 Worker 单次 CPU / 128MB 内存扛不住，/api/lib/refresh 直接被 CF 掐成 Error 1102，
// 且被硬杀时连 catch 写错误日志都跑不到（/api/lib 里 lastError 永远是 null）。
//
// h16 把这段搬到了部署构建阶段：tools/build-lib.mjs（wrangler 的 [build].command，海外 CI 机器）。
// 本文件运行时只读一个 KV key，响应恒定在毫秒级，绝不会触发 1102。
// 数据仍只写随站点部署的静态库文件（GEO_DB），不写任何访客数据；查不到就如实 not-loaded，绝不编值。

export const RUNTIME_NOTE = {
  mode: 'ci-built',
  builtAt: 'deploy-time (Workers Builds [build].command)',
  script: 'tools/build-lib.mjs',
  monthly: '.github/workflows/dbip-monthly.yml → empty commit → Workers Builds',
  runtimeWork: 'none (reads one KV shard per query; no download, no gunzip, no parse)',
};

// 兼容层：旧版 /api/lib/refresh 会调它。h16 只回状态，不启动任何下载。
export async function autoInstall(env) {
  return {
    ok: true,
    mode: 'ci-built',
    message: 'Library is built at deploy time on the overseas CI runner. Push once (or wait for the monthly rebuild) to refresh.',
    version: await installedMonth(env),
    note: RUNTIME_NOTE,
  };
}

async function readText(v) {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  if (typeof v.text === 'function') return await v.text();
  return null;
}

export async function installedMonth(env) {
  if (!env || !env.GEO_DB) return null;
  try {
    const o = await env.GEO_DB.get('meta.json');
    if (!o) return null;
    const j = JSON.parse(await readText(o));
    return j && j.status === 'ready' ? (j.version || null) : null;
  } catch (_) { return null; }
}

export async function lastError(env) {
  if (!env || !env.GEO_DB) return null;
  try {
    const o = await env.GEO_DB.get('last-error.json');
    if (!o) return null;
    return JSON.parse(await readText(o));
  } catch (_) { return null; }
}
