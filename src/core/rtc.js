// L1 · WebRTC ICE 采集。h2 改动：多路 STUN 并发；拿到公网反射 / 收集完成即返回，不再死等固定 4.5 秒。
// 只返回真实观测到的 candidate；.local 一律判「未暴露」。
export const STUN_URLS = [
  'stun:stun.l.google.com:19302',
  'stun:stun1.l.google.com:19302',
  'stun:stun.cloudflare.com:3478',
];
export const STUN_SOURCE = 'multi-STUN ICE (Google / Cloudflare public STUN; reported from observed candidates)';
export const COLLECT_TIMEOUT_MS = 3000;

export function parseCandidate(line) {
  if (!line || typeof line !== 'string') return null;
  const parts = line.trim().split(/\s+/);
  if (parts.length < 8) return null;
  const address = parts[4];
  const typIdx = parts.indexOf('typ');
  const type = typIdx >= 0 ? parts[typIdx + 1] : null;
  if (!address || !type) return null;
  const isLocal = address.endsWith('.local');
  return {
    type: type,
    address: address,
    exposed: !isLocal,
    network: type === 'srflx' ? 'public' : (type === 'host' ? (isLocal ? 'hidden' : 'private') : 'other'),
    raw: line,
  };
}

export async function collectCandidates(options) {
  const opts = options || {};
  const stunUrls = opts.stunUrls || STUN_URLS;
  const timeoutMs = opts.timeoutMs || COLLECT_TIMEOUT_MS;
  const startedAt = Date.now();
  if (typeof RTCPeerConnection === 'undefined') {
    return { supported: false, candidates: [], reason: 'RTCPeerConnection unavailable', source: STUN_SOURCE, waitedMs: 0, observedAt: new Date().toISOString() };
  }
  let pc;
  try {
    pc = new RTCPeerConnection({ iceServers: [{ urls: stunUrls }] });
  } catch (e) {
    return { supported: false, candidates: [], reason: 'RTCPeerConnection init failed', source: STUN_SOURCE, waitedMs: 0, observedAt: new Date().toISOString() };
  }
  const found = [];
  let settle;
  const done = new Promise(function (resolve) { settle = resolve; });
  let finished = false;
  function finish() { if (finished) return; finished = true; settle(); }
  function push(line) {
    if (!line) return;
    const p = parseCandidate(line);
    if (!p) return;
    found.push(p);
    // 拿到公网反射地址后再给 200ms 收尾，兼顾速度与候选完整性。
    if (p.network === 'public') setTimeout(finish, 200);
  }
  pc.onicecandidate = function (ev) {
    if (ev.candidate && ev.candidate.candidate) push(ev.candidate.candidate);
    else if (ev.candidate === null) finish();
  };
  try {
    pc.onicegatheringstatechange = function () {
      if (pc.iceGatheringState === 'complete') finish();
    };
  } catch (e) {}
  try { pc.createDataChannel('ipckit'); } catch (e) {}
  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
  } catch (e) { finish(); }
  const hardTimer = setTimeout(finish, timeoutMs);
  await done;
  clearTimeout(hardTimer);
  try { pc.close(); } catch (e) {}
  return {
    supported: true,
    candidates: found,
    source: STUN_SOURCE,
    stunUrls: stunUrls,
    waitedMs: Date.now() - startedAt,
    observedAt: new Date().toISOString(),
  };
}

export const RTC_BROWSER_SRC = [
  'const STUN_URLS = ' + JSON.stringify(STUN_URLS) + ';',
  'const STUN_SOURCE = ' + JSON.stringify(STUN_SOURCE) + ';',
  'const COLLECT_TIMEOUT_MS = ' + JSON.stringify(COLLECT_TIMEOUT_MS) + ';',
  parseCandidate.toString(),
  collectCandidates.toString(),
  'window.IPCK_RTC = { parseCandidate, collectCandidates, STUN_URLS, STUN_SOURCE, COLLECT_TIMEOUT_MS };',
].join('\n');
