/**
 * Sistema de logs para debugging.
 *
 * Existe porque o console do webview do Tauri é difícil de alcançar em máquina de
 * competição: o painel embutido (Ctrl+Shift+L) mostra o histórico dentro do próprio
 * app e exporta um arquivo que pode ser anexado num relato de bug.
 *
 * Captura o console.* nativo, então os `console.log('[DVR] ...')` que já existem no
 * código entram aqui sem precisar reescrever nada — o `[TAG]` do início vira o escopo.
 */
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const MAX_ENTRIES = 3000; // buffer circular: limita a memória numa sessão longa
const MAX_RENDERED = 600; // só as últimas N linhas vão ao DOM, pra não travar a UI
const entries = [];
const scopes = new Set();
let seqCounter = 0;
let capturing = false; // guarda contra recursão: o painel escreve pelo console original
/* ── Buffer ── */
function push(level, scope, msg) {
    const entry = { seq: ++seqCounter, t: Date.now(), level, scope, msg };
    entries.push(entry);
    if (entries.length > MAX_ENTRIES)
        entries.splice(0, entries.length - MAX_ENTRIES);
    if (!scopes.has(scope)) {
        scopes.add(scope);
        scheduleScopeRefresh();
    }
    scheduleRender();
}
/** Serializa qualquer valor sem estourar em referência circular, Error ou nó do DOM. */
function stringify(v) {
    if (typeof v === 'string')
        return v;
    if (v === null)
        return 'null';
    if (v === undefined)
        return 'undefined';
    if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint')
        return String(v);
    if (v instanceof Error)
        return `${v.name}: ${v.message}${v.stack ? '\n' + v.stack : ''}`;
    if (typeof Element !== 'undefined' && v instanceof Element) {
        return `<${v.tagName.toLowerCase()}${v.id ? '#' + v.id : ''}>`;
    }
    if (v instanceof Event)
        return `${v.type} event`;
    try {
        const seen = new WeakSet();
        const out = JSON.stringify(v, (_k, val) => {
            if (typeof val === 'object' && val !== null) {
                if (seen.has(val))
                    return '[circular]';
                seen.add(val);
            }
            if (typeof val === 'bigint')
                return String(val);
            return val;
        });
        return out ?? String(v);
    }
    catch {
        return String(v);
    }
}
/** Extrai o escopo de mensagens no formato "[DVR] ..." já usado pelo código. */
function splitScope(parts) {
    const first = parts.length ? stringify(parts[0]) : '';
    const m = /^\s*\[([^\]]{1,24})\]\s*/.exec(first);
    const rest = parts.slice(1).map(stringify);
    if (m) {
        const head = first.slice(m[0].length);
        return { scope: m[1].toUpperCase(), msg: [head, ...rest].filter(Boolean).join(' ') };
    }
    return { scope: 'APP', msg: [first, ...rest].filter(Boolean).join(' ') };
}
/* ── API pública ── */
function emit(level, scope, ...data) {
    push(level, scope.toUpperCase(), data.map(stringify).join(' '));
}
export const log = {
    debug: (scope, ...d) => emit('debug', scope, ...d),
    info: (scope, ...d) => emit('info', scope, ...d),
    warn: (scope, ...d) => emit('warn', scope, ...d),
    error: (scope, ...d) => emit('error', scope, ...d),
    entries: () => entries,
    clear: () => { entries.length = 0; scheduleRender(); },
    text: () => exportText(),
    open: () => setPanelOpen(true),
    close: () => setPanelOpen(false),
};
function exportText() {
    const head = [
        `TatamiCam — log de debug`,
        `Gerado em: ${new Date().toISOString()}`,
        `userAgent: ${navigator.userAgent}`,
        `Entradas: ${entries.length}${entries.length >= MAX_ENTRIES ? ` (truncado nas últimas ${MAX_ENTRIES})` : ''}`,
        '─'.repeat(72),
    ].join('\n');
    const body = entries.map(e => `${new Date(e.t).toISOString()} ${e.level.toUpperCase().padEnd(5)} [${e.scope}] ${e.msg}`).join('\n');
    return `${head}\n${body}\n`;
}
/* ── Captura do console e de erros globais ── */
let installed = false;
export function installLogCapture() {
    if (installed)
        return;
    installed = true;
    const native = {
        log: console.log.bind(console),
        info: console.info.bind(console),
        warn: console.warn.bind(console),
        error: console.error.bind(console),
        debug: console.debug.bind(console),
    };
    nativeConsole = native;
    const wrap = (level, fn) => (...args) => {
        fn(...args);
        if (capturing)
            return; // não re-captura o que o próprio painel imprime
        capturing = true;
        try {
            const { scope, msg } = splitScope(args);
            push(level, scope, msg);
        }
        catch { /* logar nunca pode derrubar a aplicação */ }
        finally {
            capturing = false;
        }
    };
    console.log = wrap('info', native.log);
    console.info = wrap('info', native.info);
    console.warn = wrap('warn', native.warn);
    console.error = wrap('error', native.error);
    console.debug = wrap('debug', native.debug);
    window.addEventListener('error', (ev) => {
        const e = ev;
        push('error', 'ERRO-GLOBAL', `${e.message} @ ${e.filename}:${e.lineno}:${e.colno}\n${e.error?.stack ?? ''}`.trim());
    });
    window.addEventListener('unhandledrejection', (ev) => {
        push('error', 'PROMISE', stringify(ev.reason));
    });
    push('info', 'LOG', 'Captura de logs iniciada. Ctrl+Shift+L abre o painel.');
}
let nativeConsole = null;
/* ── Persistência em disco ── */
/*
 * Grava num arquivo dentro do appLocalDataDir para o log sobreviver a reinício.
 *
 * Usa só mkdir/exists/readFile/writeFile/remove — as permissões que o
 * capabilities/default.json concede. readDir e stat NÃO estão liberados, então a
 * rotação é por tamanho (contado aqui) em vez de varrer a pasta.
 *
 * A escrita é agrupada a cada FLUSH_MS: durante a gravação de vídeo o disco já está
 * ocupado, e um write por linha de log competiria com o buffer de disco do DVR.
 */
const FLUSH_MS = 2000;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
let logDir = null;
let logPath = null;
let prevPath = null;
let persistOn = false;
let persistFails = 0;
let persistedSeq = 0;
let fileBytes = 0;
let flushing = false;
let flushTimer = null;
function tauriApi() {
    const t = window.__TAURI__;
    return t?.fs && t?.path && t?.core ? t : null;
}
function fmtLine(e) {
    return `${new Date(e.t).toISOString()} ${e.level.toUpperCase().padEnd(5)} [${e.scope}] ${e.msg}`;
}
function sessionHeader(note) {
    return `\n===== sessão ${new Date().toISOString()} (${note}) — ${navigator.userAgent} =====\n`;
}
/** Nunca usa console.* embrulhado: geraria entradas novas a cada falha de escrita. */
function persistError(msg, e) {
    persistFails++;
    nativeConsole?.error(`[LOG] ${msg}`, e);
    if (persistFails >= 3) {
        persistOn = false;
        nativeConsole?.error('[LOG] persistência em disco desativada após 3 falhas; memória segue funcionando');
    }
}
async function rotate() {
    const t = tauriApi();
    if (!t || !logPath || !prevPath)
        return;
    try {
        const data = await t.fs.readFile(logPath);
        await t.fs.writeFile(prevPath, data); // sobrescreve: guardamos só 1 geração
    }
    catch (e) {
        nativeConsole?.warn('[LOG] rotação: não deu para preservar o arquivo anterior', e);
    }
    const head = new TextEncoder().encode(sessionHeader('rotacionado'));
    await t.fs.writeFile(logPath, head);
    fileBytes = head.byteLength;
}
async function flush() {
    if (!persistOn || flushing || !logPath)
        return;
    const pending = entries.filter(e => e.seq > persistedSeq);
    if (!pending.length)
        return;
    flushing = true;
    try {
        const bytes = new TextEncoder().encode(pending.map(fmtLine).join('\n') + '\n');
        if (fileBytes + bytes.byteLength > MAX_FILE_BYTES)
            await rotate();
        await tauriApi().fs.writeFile(logPath, bytes, { append: true });
        fileBytes += bytes.byteLength;
        persistedSeq = pending[pending.length - 1].seq;
        persistFails = 0;
    }
    catch (e) {
        persistError('falha ao gravar log em disco', e);
    }
    finally {
        flushing = false;
    }
}
/** Caminho do arquivo de log, ou null se estiver só em memória. */
export function logFilePath() {
    return persistOn ? logPath : null;
}
export async function initLogPersistence() {
    const t = tauriApi();
    if (!t) {
        push('info', 'LOG', 'Fora do Tauri: logs apenas em memória.');
        return;
    }
    try {
        // O comando Rust decide a pasta: em dev é <Tatamicam-app>/logs, em release é o
        // diretório de dados do app. O fallback cobre um binário antigo, sem o comando.
        try {
            logDir = await t.core.invoke('log_dir');
        }
        catch (e) {
            nativeConsole?.warn('[LOG] comando log_dir indisponível; usando appLocalDataDir', e);
            logDir = await t.path.join(await t.path.appLocalDataDir(), 'logs');
        }
        logPath = await t.path.join(logDir, 'tatamicam.log');
        prevPath = await t.path.join(logDir, 'tatamicam.prev.log');
        await t.fs.mkdir(logDir, { recursive: true });
        // readDir/stat não estão liberados: o tamanho inicial sai de um readFile único,
        // que é barato porque o próprio cap mantém o arquivo em ~2 MiB.
        fileBytes = 0;
        try {
            if (await t.fs.exists(logPath)) {
                fileBytes = (await t.fs.readFile(logPath)).byteLength;
            }
        }
        catch (e) {
            nativeConsole?.warn('[LOG] não deu para medir o log atual; começando do zero', e);
        }
        persistOn = true;
        persistedSeq = 0;
        const head = new TextEncoder().encode(sessionHeader('início'));
        if (fileBytes + head.byteLength > MAX_FILE_BYTES)
            await rotate();
        else {
            await t.fs.writeFile(logPath, head, { append: true });
            fileBytes += head.byteLength;
        }
        flushTimer = setInterval(() => { void flush(); }, FLUSH_MS);
        window.addEventListener('beforeunload', () => { void flush(); });
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden')
                void flush();
        });
        push('info', 'LOG', `Gravando log em ${logPath}`);
        updatePathLabel();
    }
    catch (e) {
        persistOn = false;
        persistError('não foi possível iniciar a persistência', e);
    }
}
/** Descarta o log em disco (as duas gerações) e recomeça. */
export async function clearLogFiles() {
    const t = tauriApi();
    if (!t || !logPath)
        return;
    for (const f of [logPath, prevPath]) {
        if (!f)
            continue;
        try {
            if (await t.fs.exists(f))
                await t.fs.remove(f);
        }
        catch (e) {
            nativeConsole?.warn('[LOG] falha ao remover', f, e);
        }
    }
    fileBytes = 0;
    persistedSeq = seqCounter;
}
/* ── Painel ── */
let panel = null;
let listEl = null;
let scopeSel = null;
let levelSel = null;
let searchEl = null;
let followEl = null;
let countEl = null;
let pathEl = null;
let renderQueued = false;
let scopeQueued = false;
function scheduleRender() {
    if (renderQueued || !panel || panel.hidden)
        return;
    renderQueued = true;
    requestAnimationFrame(() => { renderQueued = false; render(); });
}
function scheduleScopeRefresh() {
    if (scopeQueued || !scopeSel)
        return;
    scopeQueued = true;
    requestAnimationFrame(() => { scopeQueued = false; refreshScopes(); });
}
function visible() {
    const minLevel = LEVELS[levelSel?.value || 'debug'];
    const scope = scopeSel?.value || '';
    const q = (searchEl?.value || '').toLowerCase();
    return entries.filter(e => LEVELS[e.level] >= minLevel &&
        (!scope || e.scope === scope) &&
        (!q || e.msg.toLowerCase().includes(q) || e.scope.toLowerCase().includes(q)));
}
function hhmmss(t) {
    const d = new Date(t);
    const p = (n, w = 2) => String(n).padStart(w, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}
function render() {
    if (!listEl)
        return;
    const rows = visible();
    const shown = rows.slice(-MAX_RENDERED);
    const atBottom = followEl?.checked ?? true;
    listEl.textContent = '';
    const frag = document.createDocumentFragment();
    if (rows.length > shown.length) {
        const note = document.createElement('div');
        note.className = 'tclog-row tclog-note';
        note.textContent = `… ${rows.length - shown.length} linhas anteriores ocultas (use os filtros ou exporte o arquivo)`;
        frag.appendChild(note);
    }
    for (const e of shown) {
        const row = document.createElement('div');
        row.className = `tclog-row tclog-${e.level}`;
        const time = document.createElement('span');
        time.className = 'tclog-t';
        time.textContent = hhmmss(e.t);
        const sc = document.createElement('span');
        sc.className = 'tclog-sc';
        sc.textContent = e.scope;
        const msg = document.createElement('span');
        msg.className = 'tclog-msg';
        msg.textContent = e.msg;
        row.append(time, sc, msg);
        frag.appendChild(row);
    }
    listEl.appendChild(frag);
    if (countEl)
        countEl.textContent = `${rows.length}/${entries.length}`;
    if (atBottom)
        listEl.scrollTop = listEl.scrollHeight;
}
function refreshScopes() {
    if (!scopeSel)
        return;
    const cur = scopeSel.value;
    scopeSel.textContent = '';
    const all = document.createElement('option');
    all.value = '';
    all.textContent = 'todos os escopos';
    scopeSel.appendChild(all);
    for (const s of [...scopes].sort()) {
        const o = document.createElement('option');
        o.value = s;
        o.textContent = s;
        scopeSel.appendChild(o);
    }
    scopeSel.value = cur;
}
async function saveToFile() {
    const text = exportText();
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    const name = `tatamicam-log-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.log`;
    const tauri = window.__TAURI__;
    // writeFile (bytes) em vez de writeTextFile: é a permissão que o
    // capabilities/default.json já concede e que o resto do app usa.
    if (tauri?.dialog?.save && tauri?.fs?.writeFile) {
        try {
            const filePath = await tauri.dialog.save({
                defaultPath: name,
                filters: [{ name: 'Log', extensions: ['log', 'txt'] }],
            });
            if (!filePath)
                return;
            await tauri.fs.writeFile(filePath, new TextEncoder().encode(text));
            flash(`Log salvo em ${filePath}`);
            return;
        }
        catch (e) {
            nativeConsole?.error('[LOG] falha ao salvar via Tauri', e);
        }
    }
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    flash('Log exportado.');
}
async function copyToClipboard() {
    try {
        await navigator.clipboard.writeText(exportText());
        flash('Log copiado.');
    }
    catch {
        flash('Não foi possível copiar — use Salvar.');
    }
}
function flash(text) {
    const el = panel?.querySelector('.tclog-flash');
    if (!el)
        return;
    el.textContent = text;
    el.classList.add('on');
    setTimeout(() => el.classList.remove('on'), 2600);
}
function buildPanel() {
    if (panel)
        return;
    const style = document.createElement('style');
    style.textContent = `
.tclog { position: fixed; inset: auto 0 0 0; height: 42vh; min-height: 220px; z-index: 99999;
  background: #0d1117; color: #d7dde5; border-top: 2px solid #e8b640;
  font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  display: flex; flex-direction: column; box-shadow: 0 -8px 24px rgba(0,0,0,.5); }
.tclog[hidden] { display: none; }
.tclog-bar { display: flex; align-items: center; gap: 8px; padding: 6px 10px;
  background: #161b22; border-bottom: 1px solid #262d36; flex-wrap: wrap; }
.tclog-bar strong { color: #e8b640; letter-spacing: .04em; }
.tclog-bar select, .tclog-bar input[type=search] { background: #0d1117; color: #d7dde5;
  border: 1px solid #30363d; border-radius: 4px; padding: 3px 6px; font: inherit; }
.tclog-bar input[type=search] { min-width: 160px; }
.tclog-bar button { background: #21262d; color: #d7dde5; border: 1px solid #30363d;
  border-radius: 4px; padding: 3px 9px; font: inherit; cursor: pointer; }
.tclog-bar button:hover { background: #30363d; }
.tclog-bar label { display: flex; align-items: center; gap: 4px; cursor: pointer; }
.tclog-count { margin-left: auto; opacity: .65; }
.tclog-path { padding: 3px 10px; color: #6e7681; border-bottom: 1px solid #262d36;
  font-size: 11px; word-break: break-all; }
.tclog-path:empty { display: none; }
.tclog-list { flex: 1; overflow: auto; padding: 4px 0; }
.tclog-row { display: flex; gap: 8px; padding: 1px 10px; white-space: pre-wrap; word-break: break-word; }
.tclog-row:hover { background: #161b22; }
.tclog-t { color: #6e7681; flex: none; }
.tclog-sc { color: #79c0ff; flex: none; min-width: 76px; }
.tclog-msg { flex: 1; }
.tclog-warn .tclog-msg { color: #e3b341; }
.tclog-error .tclog-msg { color: #ff7b72; }
.tclog-debug { opacity: .72; }
.tclog-note { color: #6e7681; font-style: italic; }
.tclog-flash { opacity: 0; transition: opacity .2s; color: #7ee787; }
.tclog-flash.on { opacity: 1; }
`;
    document.head.appendChild(style);
    panel = document.createElement('div');
    panel.className = 'tclog';
    panel.hidden = true;
    panel.innerHTML = `
<div class="tclog-bar">
  <strong>LOGS</strong>
  <select class="tclog-level" title="Nível mínimo">
    <option value="debug">debug+</option>
    <option value="info" selected>info+</option>
    <option value="warn">warn+</option>
    <option value="error">só erros</option>
  </select>
  <select class="tclog-scope" title="Escopo"></select>
  <input type="search" class="tclog-search" placeholder="filtrar texto…">
  <label><input type="checkbox" class="tclog-follow" checked> seguir</label>
  <button class="tclog-copy">Copiar</button>
  <button class="tclog-save">Salvar</button>
  <button class="tclog-clear">Limpar</button>
  <button class="tclog-close">Fechar</button>
  <span class="tclog-flash"></span>
  <span class="tclog-count"></span>
</div>
<div class="tclog-path" title="Arquivo de log em disco"></div>
<div class="tclog-list"></div>`;
    document.body.appendChild(panel);
    listEl = panel.querySelector('.tclog-list');
    levelSel = panel.querySelector('.tclog-level');
    scopeSel = panel.querySelector('.tclog-scope');
    searchEl = panel.querySelector('.tclog-search');
    followEl = panel.querySelector('.tclog-follow');
    countEl = panel.querySelector('.tclog-count');
    pathEl = panel.querySelector('.tclog-path');
    levelSel?.addEventListener('change', render);
    scopeSel?.addEventListener('change', render);
    searchEl?.addEventListener('input', render);
    panel.querySelector('.tclog-copy')?.addEventListener('click', copyToClipboard);
    panel.querySelector('.tclog-save')?.addEventListener('click', saveToFile);
    panel.querySelector('.tclog-clear')?.addEventListener('click', () => { log.clear(); void clearLogFiles(); });
    panel.querySelector('.tclog-close')?.addEventListener('click', () => setPanelOpen(false));
    // O painel tem <input>: as teclas dele não podem vazar para os atalhos do app
    // (z = zoom, setas = seek). O atalho de abrir/fechar é a exceção — senão o painel
    // não fecha pelo teclado enquanto o foco estiver na caixa de busca.
    panel.addEventListener('keydown', (e) => {
        if (!isToggleShortcut(e))
            e.stopPropagation();
    });
    refreshScopes();
}
function updatePathLabel() {
    if (!pathEl)
        return;
    const f = logFilePath();
    pathEl.textContent = f ? `arquivo: ${f}` : 'somente em memória (sem gravação em disco)';
}
function isPanelOpen() {
    return !!panel && panel.hidden === false;
}
function setPanelOpen(open) {
    buildPanel();
    if (!panel)
        return;
    panel.hidden = !open;
    if (open) {
        refreshScopes();
        updatePathLabel();
        render();
    }
}
function isToggleShortcut(e) {
    const combo = (e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'L' || e.key === 'l');
    return combo || e.key === 'F9';
}
export function initLogPanel() {
    buildPanel();
    document.addEventListener('keydown', (e) => {
        if (!isToggleShortcut(e))
            return;
        e.preventDefault();
        setPanelOpen(!isPanelOpen());
    });
    window.tatamicamLog = log;
}
// Efeito de import proposital: imports ES são içados, então uma chamada solta no
// main.ts rodaria só DEPOIS de todos os módulos serem avaliados. Instalando aqui,
// e sendo logger.js o primeiro import do main.ts, a captura já está de pé quando
// ui.js/camera.js são carregados.
installLogCapture();
//# sourceMappingURL=logger.js.map