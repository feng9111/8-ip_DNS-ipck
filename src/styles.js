/* 8号 h6 · 母版样式（继承 h5，逐字节保留原规则，仅追加法务页/署名块） */
export const CSS = `
:root{--bg:#0b1020;--panel:#121a2e;--panel2:#0f1730;--line:#233150;--text:#e8edf7;--muted:#8b9ab8;--green:#3ddc97;--gray:#6b7a99;--red:#ff6b6b;--accent:#7aa2ff;--mono:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;--sans:system-ui,-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
*{box-sizing:border-box}
html,body{margin:0;min-height:100%}
body{background:var(--bg);color:var(--text);font-family:var(--sans);font-size:14px;line-height:1.6;-webkit-font-smoothing:antialiased}
.ipck-shell{display:grid;grid-template-columns:220px minmax(0,1fr);min-height:100vh}
.ipck-side{border-right:1px solid var(--line);padding:22px 16px;display:flex;flex-direction:column;gap:6px;background:#0a0f1e}
.ipck-brand{display:flex;align-items:center;gap:10px;font-weight:700;font-size:16px;letter-spacing:.02em}
.ipck-logo{width:26px;height:26px;border:1px solid var(--accent);border-radius:7px;display:grid;place-items:center;color:var(--accent);font-family:var(--mono);font-size:12px}
.ipck-tag{color:var(--muted);font-size:11px;margin:0 0 18px 36px}
.ipck-nav{display:flex;flex-direction:column;gap:2px}
.ipck-nav a,.ipck-nav span{display:block;padding:9px 12px;border-radius:8px;color:var(--muted);text-decoration:none;font-size:13px;border:1px solid transparent}
.ipck-nav a:hover{color:var(--text);background:var(--panel)}
.ipck-nav a.is-active{color:var(--text);background:var(--panel);border-color:var(--line)}
.ipck-nav span{opacity:.45;cursor:default}
.ipck-side-foot{margin-top:auto;color:var(--muted);font-size:11px;font-family:var(--mono);padding-top:18px}
.ipck-main{display:flex;flex-direction:column;min-width:0}
.ipck-top{border-bottom:1px solid var(--line);padding:20px 28px 16px}
.ipck-top-row{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}
.ipck-top h1{margin:0;font-size:20px;font-weight:650;letter-spacing:.01em}
.ipck-top p{margin:4px 0 0;color:var(--muted);font-size:12px}
.ipck-actions{display:flex;gap:10px;align-items:center;flex-shrink:0}
.ipck-btn{background:#1b2a4a;color:var(--text);border:1px solid #31456e;border-radius:8px;padding:9px 16px;font:inherit;font-size:13px;cursor:pointer;white-space:nowrap}
.ipck-btn:hover{background:#23375f}
.ipck-btn:disabled{opacity:.6;cursor:default}
.ipck-lang{color:var(--muted);text-decoration:none;font-size:12px;border:1px solid var(--line);padding:8px 12px;border-radius:8px;white-space:nowrap}
.ipck-lang:hover{color:var(--text)}
.ipck-diag{padding:10px 28px;border-bottom:1px solid var(--line);font-size:12px;font-family:var(--mono);color:var(--muted);background:#0d1426;min-height:38px;line-height:1.5}
.ipck-diag-ok{color:var(--green)}.ipck-diag-bad{color:var(--red)}.ipck-diag-warn{color:#e8c66a}
.ipck-progress{margin-top:14px;height:4px;background:#18233d;border-radius:999px;overflow:hidden}
.ipck-progress-fill{height:100%;width:35%;background:var(--accent);border-radius:999px;animation:ipck-slide 1.2s ease-in-out infinite}
@keyframes ipck-slide{0%{margin-left:-35%}100%{margin-left:100%}}
.ipck-content{padding:24px 28px;display:flex;flex-direction:column;gap:18px;flex:1}
.ipck-panel{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:18px;min-width:0}
.ipck-panel h2{margin:0 0 14px;font-size:12px;font-weight:600;color:var(--muted);letter-spacing:.08em;text-transform:uppercase}
.ipck-cols{display:grid;grid-template-columns:1fr 1fr;gap:18px}
.ipck-big{font-family:var(--mono);font-size:30px;letter-spacing:.02em;margin-bottom:16px;word-break:break-all}
.ipck-summary-ip{display:flex;align-items:baseline;gap:12px;margin-bottom:14px}
.ipck-summary-ip span{color:var(--muted);font-size:12px}
.ipck-summary-ip b{font-family:var(--mono);font-size:22px;font-weight:600;word-break:break-all}
.ipck-grid-fields{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.ipck-field{border:1px solid var(--line);border-radius:9px;padding:10px 12px;background:var(--panel2);min-width:0}
.ipck-field span{display:block;color:var(--muted);font-size:11px;margin-bottom:4px}
.ipck-field b{font-family:var(--mono);font-size:13px;font-weight:600;word-break:break-all}
.ipck-precision{color:var(--muted);font-size:11px;margin:14px 0 0}
.ipck-table{width:100%;border-collapse:collapse;font-size:12px}
.ipck-table th{text-align:left;color:var(--muted);font-weight:500;padding:9px 10px;border-bottom:1px solid var(--line)}
.ipck-table td{padding:10px;border-bottom:1px solid #1b2742;font-family:var(--mono);word-break:break-all}
.ipck-dot{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:7px;vertical-align:middle}
.ipck-dot.g{background:var(--green)}.ipck-dot.n{background:var(--gray)}.ipck-dot.r{background:var(--red)}
.ipck-empty{color:var(--muted);font-size:12px;padding:14px 0}
.ipck-notice{border-left:2px solid var(--accent);padding:6px 0 6px 14px}
.ipck-notice b{font-size:13px}.ipck-notice p{color:var(--muted);font-size:12px;margin:6px 0 0}
.ipck-method{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:20px}
.ipck-method h2{margin:0 0 12px;font-size:15px}
.ipck-method ol{margin:0;padding-left:20px;color:var(--muted);font-size:12px}
.ipck-method li{margin-bottom:8px}
.ipck-sourcebar{border-top:1px solid var(--line);padding:14px 28px;color:var(--muted);font-size:11px;font-family:var(--mono);background:#0a0f1e}
.ipck-sb-row{display:grid;grid-template-columns:70px 1fr 1fr 1fr;gap:10px;padding:3px 0}
.ipck-sb-meta{margin-top:8px;opacity:.7}

.ipck-consent{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;padding:12px 28px;border-bottom:1px solid var(--line);background:#0d1830;font-size:12px}
.ipck-consent label{display:flex;gap:9px;align-items:flex-start;color:var(--text);cursor:pointer;max-width:640px}
.ipck-consent input{margin-top:3px;accent-color:var(--accent)}
.ipck-consent-actions{display:flex;gap:10px;align-items:center}
.ipck-consent-actions .ipck-btn{padding:6px 12px;font-size:12px}
.ipck-consent-state{flex-basis:100%;color:var(--muted);font-family:var(--mono);font-size:11px}
.ipck-consent-state.on{color:var(--green)}
.ipck-cross{margin-top:14px;border:1px solid var(--line);border-radius:9px;padding:11px 13px;background:var(--panel2);font-size:12px}
.ipck-cross.ok{border-color:#1f6b4d}.ipck-cross.warn{border-color:#8a6a22}
.ipck-cross b{font-weight:600}.ipck-cross p{color:var(--muted);font-size:11px;margin:6px 0 0}
.ipck-cross table{margin-top:10px}
.ipck-attr{margin-top:12px;font-size:11px;color:var(--muted)}
.ipck-attr a,.ipck-sb-attr a{color:var(--accent);text-decoration:none}
.ipck-sb-attr{margin-top:6px}
.ipck-privacy{max-width:860px}
.ipck-privacy h2{margin:0 0 16px;font-size:15px}
.ipck-privacy p{color:var(--muted);font-size:13px;line-height:1.85;margin:0 0 12px}
.ipck-privacy .ipck-lang{display:inline-block;margin-top:8px}
@media (max-width:860px){

  .ipck-shell{grid-template-columns:1fr}
  .ipck-side{border-right:0;border-bottom:1px solid var(--line);padding:12px 16px;flex-direction:row;align-items:center;gap:10px;overflow-x:auto}
  .ipck-tag,.ipck-side-foot{display:none}
  .ipck-nav{flex-direction:row;gap:4px}
  .ipck-nav a,.ipck-nav span{padding:7px 10px;white-space:nowrap}
  .ipck-brand{margin:0}
  .ipck-top{padding:16px}
  .ipck-diag{padding:10px 16px}
  .ipck-top-row{flex-direction:column;align-items:stretch}
  .ipck-actions{justify-content:space-between}
  .ipck-content{padding:16px;gap:14px}
  .ipck-cols{grid-template-columns:1fr}
  .ipck-grid-fields{grid-template-columns:repeat(2,1fr)}
  .ipck-sourcebar{padding:12px 16px}
  .ipck-sb-row{display:block;padding:6px 0}
}

/* h6 · 法务页、常驻署名块、同意回执 */
.ipck-legal{max-width:880px;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:24px 26px}
.ipck-legal h2{margin:0 0 18px;font-size:16px;font-weight:650}
.ipck-legal p{color:var(--muted);font-size:13px;line-height:1.9;margin:0 0 14px}
.ipck-legal a{color:var(--accent);text-decoration:none}
.ipck-legal a:hover{text-decoration:underline}
.ipck-legal-meta{font-size:11px!important;font-family:var(--mono);opacity:.75;border-top:1px solid var(--line);padding-top:12px}
.ipck-legal-links{font-size:12px!important}
.ipck-legal .ipck-lang{display:inline-block;margin-top:6px}
.ipck-attr-block{border-top:1px dashed var(--line);margin-top:10px;padding-top:10px;line-height:1.8}
.ipck-attr-block b{color:var(--text);font-weight:600;font-family:var(--sans)}
.ipck-attr-block a{color:var(--accent);text-decoration:none}
.ipck-attr-block a:hover{text-decoration:underline}
.ipck-attr-block .ipck-attr-note{display:block;opacity:.72;margin-top:4px}
.ipck-attr-version{color:var(--green)}
.ipck-attr-version.off{color:#e8c66a}
@media (max-width:860px){
  .ipck-legal{padding:18px 16px}
  .ipck-nav a,.ipck-nav span{padding:6px 9px}
}
/* h8 · 长 IPv6 / 中文译名的窄屏排版：标签不竖断、数值整行可读 */
.ipck-summary-ip{flex-wrap:wrap}
.ipck-summary-ip span{white-space:nowrap;flex:0 0 auto}
.ipck-summary-ip b{min-width:0;overflow-wrap:anywhere;line-height:1.35}
.ipck-field b{overflow-wrap:anywhere;line-height:1.45}
.ipck-zh-note{color:var(--muted);font-size:11px;line-height:1.55;margin:8px 0 0}
@media(max-width:860px){.ipck-summary-ip b{font-size:18px}.ipck-grid-fields{gap:8px}}
/* h9 · 任意 IP 输入区：与母版同色系，桌面一行、窄屏纵向堆叠 */
.ipck-lookup{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin:16px 28px 0}
.ipck-lookup-head h2{margin:0 0 6px;font-size:12px;font-weight:600;color:var(--muted);letter-spacing:.08em;text-transform:uppercase}
.ipck-lookup-head p{margin:0 0 12px;color:var(--muted);font-size:12px;line-height:1.6}
.ipck-lookup-row{display:flex;gap:10px;align-items:stretch}
.ipck-lookup-row input{flex:1 1 auto;min-width:0;background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:10px 13px;font-family:var(--mono);font-size:13px;outline:none}
.ipck-lookup-row input:focus{border-color:var(--accent)}
.ipck-lookup-row input::placeholder{color:var(--gray);font-family:var(--sans);font-size:12px}
.ipck-lookup-row .ipck-btn{flex:0 0 auto}
.ipck-btn.ghost{background:transparent;border-color:var(--line);color:var(--muted)}
.ipck-btn.ghost:hover{color:var(--text);background:var(--panel2)}
.ipck-subject{margin:0 0 12px;padding:7px 11px;border-radius:7px;border:1px solid var(--line);background:var(--panel2);color:var(--muted);font-family:var(--mono);font-size:11px;line-height:1.5}
.ipck-subject.manual{border-color:#31456e;color:var(--text)}
.ipck-scope{color:var(--muted);font-size:11px;line-height:1.55;margin:8px 0 0}
@media(max-width:860px){.ipck-lookup{margin:14px 16px 0;padding:14px}.ipck-lookup-row{flex-wrap:wrap}.ipck-lookup-row input{flex:1 1 100%}.ipck-lookup-row .ipck-btn{flex:1 1 calc(50% - 5px)}}
`;
