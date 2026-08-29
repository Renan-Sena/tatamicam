import { showToast } from './utils.js';
import { DiskBuffer } from './disk-buffer.js';
const state = {
    slots: [],
    activeSlot: 0,
    permGranted: false,
    fpsCount: 0,
    restarting: false,
    perSlotDelay: false,
};
let _permPromise = null;
for (let i = 0; i < 4; i++) {
    state.slots.push({
        id: i, stream: null, recorder: null, chunks: [], bufSec: 0, bufBytes: 0, maxBufSec: 5 * 60,
        camCfg: { w: 1280, h: 720, fps: 30 }, replayUrl: null, cameraOn: false, bufferMode: 'ram',
        diskBuffer: null, deviceId: '', videoElement: null, delaySeconds: 0, mode: 'idle',
        wasPlaying: true, dvrFeed: null, recordMime: '',
        lastChunkAt: 0, bufSecGrowing: false, thumbs: [], thumbTick: 0,
    });
}
/* ─── Buffer RAM + alimentação do DVR ─── */
function pushChunk(slot, blob) {
    // bufSec/bufBytes já foram incrementados e o DVR já foi alimentado em
    // ondataavailable; aqui só guardamos o chunk e aparamos o buffer.
    // (Antes isso era feito em dobro, duplicando cada segundo no DVR RAM.)
    slot.chunks.push(blob);
    trimBuffer(slot);
}
/** Alimenta o DVR feed para RAM e modos disco */
async function feedDvrIfActive(slot, blob) {
    if (slot.bufferMode !== 'ram' && slot.bufferMode !== 'disk' && slot.bufferMode !== 'disk-full')
        return;
    if (!slot.dvrFeed || slot.dvrFeed.stopped)
        return;
    try {
        const data = new Uint8Array(await blob.arrayBuffer());
        const sb = slot.dvrFeed.sourceBuffer;
        const ms = slot.dvrFeed.mediaSource;
        const replayVid = document.getElementById(`replayVid${slot.id}`);
        if (replayVid && replayVid.error) {
            console.error(`[DVR-FEED] Slot ${slot.id}: vídeo com erro. Parando feed.`, replayVid.error);
            stopDvrFeed(slot);
            return;
        }
        if (!sb.updating && ms.readyState === 'open') {
            sb.appendBuffer(data.buffer);
        }
        else {
            const enqueue = () => {
                sb.removeEventListener('updateend', enqueue);
                if (slot.dvrFeed && !slot.dvrFeed.stopped && slot.dvrFeed.mediaSource.readyState === 'open') {
                    try {
                        sb.appendBuffer(data.buffer);
                    }
                    catch (e) {
                        console.error(`[DVR-FEED] Slot ${slot.id}: erro no append enfileirado`, e);
                        stopDvrFeed(slot);
                    }
                }
            };
            sb.addEventListener('updateend', enqueue, { once: true });
        }
    }
    catch (e) {
        console.error(`[DVR-FEED] Slot ${slot.id}: exceção`, e);
        if (e instanceof DOMException && e.name === 'InvalidStateError') {
            stopDvrFeed(slot);
        }
    }
}
/**
 * bufSec com o degrau interpolado.
 *
 * bufSec sobe 1 a cada chunk (1s), enquanto o currentTime do replay avança de forma
 * contínua. Como a timeline divide um pelo outro, o cursor avançava durante o segundo
 * e recuava no instante do chunk — o vaivém. Interpolar a fração do segundo corrente
 * deixa o denominador contínuo e o cursor estável.
 *
 * Quando o buffer satura (RAM no teto), bufSec passa a ser constante e não há degrau
 * para interpolar: somar a fração aí é que criaria o serrilhado.
 */
export function bufSecSmooth(slot) {
    if (!slot.bufSecGrowing || !slot.lastChunkAt)
        return slot.bufSec;
    const frac = Math.min(Math.max((performance.now() - slot.lastChunkAt) / 1000, 0), 1);
    return slot.bufSec + frac;
}
/* ─── Miniaturas da timeline ─── */
const THUMB_EVERY_CHUNKS = 2; // 1 chunk = 1s
const THUMB_W = 160;
const THUMB_MAX = 240; // ~8 min amostrando a cada 2s
// Canvas único reaproveitado: alvo é i3 de 7ª geração com 4 GB, onde alocar um canvas
// por captura pressiona o GC sem necessidade.
let thumbCanvas = null;
let thumbEncoding = false;
function releaseThumb(t) {
    URL.revokeObjectURL(t.url);
}
/**
 * Captura um quadro do vídeo ao vivo durante a gravação.
 *
 * É o mesmo princípio do storyboard do YouTube: buscar no vídeo a cada hover seria
 * caro (no modo disco exigiria remontar a janela MSE) e travaria o mouse. Capturar
 * enquanto grava custa um drawImage de 160px a cada 2s.
 *
 * Usa toBlob + object URL em vez de toDataURL: o toDataURL codifica de forma síncrona
 * e devolve base64, que vira string UTF-16 no heap do JS (~12 KB por miniatura, ~3 MB
 * no total). O blob fica fora do heap e a codificação não bloqueia a thread principal
 * durante a gravação.
 */
function captureThumb(slot) {
    const vid = slot.videoElement;
    if (!vid || !vid.videoWidth || !vid.videoHeight)
        return;
    if (thumbEncoding)
        return; // máquina lenta: não enfileira codificações
    try {
        const h = Math.max(1, Math.round(THUMB_W * (vid.videoHeight / vid.videoWidth)));
        if (!thumbCanvas)
            thumbCanvas = document.createElement('canvas');
        if (thumbCanvas.width !== THUMB_W || thumbCanvas.height !== h) {
            thumbCanvas.width = THUMB_W;
            thumbCanvas.height = h;
        }
        const ctx = thumbCanvas.getContext('2d');
        if (!ctx)
            return;
        ctx.drawImage(vid, 0, 0, THUMB_W, h);
        const sec = slot.bufSec;
        thumbEncoding = true;
        thumbCanvas.toBlob((blob) => {
            thumbEncoding = false;
            if (!blob)
                return;
            slot.thumbs.push({ sec, url: URL.createObjectURL(blob) });
            if (slot.thumbs.length > THUMB_MAX) {
                for (const t of slot.thumbs.splice(0, slot.thumbs.length - THUMB_MAX))
                    releaseThumb(t);
            }
        }, 'image/jpeg', 0.5);
    }
    catch (e) {
        thumbEncoding = false;
        // Câmera sem frame pronto ou canvas "tainted": preview é acessório, não pode
        // derrubar a gravação.
        console.warn('[THUMB] falha ao capturar quadro', e);
    }
}
/** Miniatura mais próxima de `sec`, ou null se ainda não há nenhuma. */
export function nearestThumb(slot, sec) {
    let melhor = null;
    let dist = Infinity;
    for (const t of slot.thumbs) {
        const d = Math.abs(t.sec - sec);
        if (d < dist) {
            dist = d;
            melhor = t;
        }
    }
    return melhor;
}
export function clearThumbs(slot) {
    for (const t of slot.thumbs)
        releaseThumb(t);
    slot.thumbs = [];
    slot.thumbTick = 0;
}
function trimBuffer(slot) {
    while (slot.bufSec > slot.maxBufSec && slot.chunks.length > 2) {
        const removed = slot.chunks.splice(1, 1)[0];
        if (removed) {
            slot.bufSec -= 1;
            slot.bufBytes -= removed.size;
            // O conteúdo inteiro deslizou 1s para trás; as miniaturas precisam
            // acompanhar, senão o preview passa a mostrar o quadro errado.
            for (const t of slot.thumbs)
                t.sec -= 1;
            while (slot.thumbs.length && slot.thumbs[0].sec < 0)
                releaseThumb(slot.thumbs.shift());
        }
    }
    if (slot.replayUrl && !slot.dvrFeed) {
        URL.revokeObjectURL(slot.replayUrl);
        slot.replayUrl = null;
    }
}
/* ─── Câmera ─── */
async function openCamera(slot, res, fps) {
    if (!state.permGranted) {
        const ok = await requestPermission();
        if (!ok)
            throw new Error('Permissão de câmera negada.');
    }
    let wC, hC;
    if (!res || res === 'original') {
        wC = { ideal: 1920 };
        hC = { ideal: 1080 };
    }
    else {
        const [w, h] = res.split('x').map(Number);
        wC = { ideal: w };
        hC = { ideal: h };
    }
    const fpsC = !fps || fps === 'auto' ? { ideal: 30 } : { ideal: parseInt(fps, 10) };
    const vidCon = { width: wC, height: hC, frameRate: fpsC };
    if (slot.deviceId)
        vidCon.deviceId = { exact: slot.deviceId };
    try {
        const s = await navigator.mediaDevices.getUserMedia({ video: vidCon, audio: false });
        applySettings(slot, s, res, fps);
        return s;
    }
    catch (_) { }
    try {
        const s = await navigator.mediaDevices.getUserMedia({ video: slot.deviceId ? { deviceId: { exact: slot.deviceId } } : true, audio: false });
        applySettings(slot, s, res, fps);
        return s;
    }
    catch (_) { }
    try {
        const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        applySettings(slot, s, res, fps);
        return s;
    }
    catch (e3) {
        throw new Error('Câmera inacessível: ' + (e3 instanceof Error ? e3.message : String(e3)));
    }
}
function applySettings(slot, s, res, fps) {
    const t = s.getVideoTracks()[0];
    const cfg = t.getSettings();
    slot.camCfg = {
        w: cfg.width || (res === 'original' ? 1280 : parseInt((res || '1280x720').split('x')[0], 10)),
        h: cfg.height || (res === 'original' ? 720 : parseInt((res || '1280x720').split('x')[1], 10)),
        fps: cfg.frameRate || (fps === 'auto' ? 30 : parseInt(fps || '30', 10)),
    };
}
/* ─── API pública ─── */
export function getState() { return state; }
export function getActiveSlot() { return state.slots[state.activeSlot]; }
export function setActiveSlot(index) { if (index >= 0 && index < 4)
    state.activeSlot = index; }
export function setPerSlotDelay(enabled) { state.perSlotDelay = enabled; }
export function setMaxBufSec(val, slotIndex) {
    const slot = slotIndex !== undefined ? state.slots[slotIndex] : getActiveSlot();
    slot.maxBufSec = val;
    if (slot.bufferMode === 'ram')
        trimBuffer(slot);
    if (slot.diskBuffer && (slot.bufferMode === 'disk' || slot.bufferMode === 'disk-full'))
        slot.diskBuffer.maxSeconds = val;
}
export function setBufferMode(mode, slotIndex) {
    const slot = slotIndex !== undefined ? state.slots[slotIndex] : getActiveSlot();
    if (slot.cameraOn) {
        showToast('Altere o modo de buffer antes de iniciar a câmera.', true);
        return;
    }
    clearBuffer(slot);
    slot.bufferMode = mode;
}
export async function requestPermission() {
    if (state.permGranted)
        return true;
    if (_permPromise)
        return _permPromise;
    _permPromise = (async () => {
        try {
            const tmp = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            tmp.getTracks().forEach(t => t.stop());
            state.permGranted = true;
            return true;
        }
        catch (_) {
            return false;
        }
        finally {
            _permPromise = null;
        }
    })();
    return _permPromise;
}
export async function populateCameraList(selectEl) {
    try {
        const devs = await navigator.mediaDevices.enumerateDevices();
        const vids = devs.filter(d => d.kind === 'videoinput');
        if (!vids.length) {
            selectEl.innerHTML = '<option value="">Nenhuma câmera detectada</option>';
            return;
        }
        const activeSlot = getActiveSlot();
        const curId = activeSlot.stream?.getVideoTracks()[0]?.getSettings().deviceId;
        const prev = selectEl.value;
        selectEl.innerHTML = '';
        vids.forEach((d, i) => {
            const o = document.createElement('option');
            o.value = d.deviceId;
            o.textContent = d.label || `Câmera ${i + 1}`;
            if ((curId && d.deviceId === curId) || (!curId && d.deviceId === prev))
                o.selected = true;
            selectEl.appendChild(o);
        });
    }
    catch (_) { }
}
export async function startCamera(deviceId, res, fps, liveVid, slotIndex) {
    const slot = slotIndex !== undefined ? state.slots[slotIndex] : getActiveSlot();
    if (deviceId)
        slot.deviceId = deviceId;
    slot.videoElement = liveVid;
    const s = await openCamera(slot, res, fps);
    slot.stream = s;
    slot.cameraOn = true;
    liveVid.srcObject = s;
    await liveVid.play();
    return s;
}
export function stopCamera(slotIndex) {
    const slot = slotIndex !== undefined ? state.slots[slotIndex] : getActiveSlot();
    if (slot.stream) {
        slot.stream.getTracks().forEach(t => t.stop());
        slot.stream = null;
    }
    slot.cameraOn = false;
}
function calculateBitrate(w, h, fps) {
    const pixels = w * h;
    const base = 1_200_000; // 1.2 Mbps para 640x480@30
    const factor = (pixels / (640 * 480)) * (fps / 30);
    // Tabela simplificada para HD e Full HD
    if (w >= 1920 && h >= 1080) {
        return fps >= 60 ? 8_000_000 : 5_000_000;
    }
    if (w >= 1280 && h >= 720) {
        return fps >= 60 ? 4_500_000 : 3_000_000;
    }
    // Para resoluções menores, interpola proporcionalmente
    return Math.max(1_200_000, Math.round(base * factor));
}
export async function startRecorder(slotIndex) {
    const slot = slotIndex !== undefined ? state.slots[slotIndex] : getActiveSlot();
    if (!slot.stream)
        return;
    if (slot.recorder && slot.recorder.state !== 'inactive')
        slot.recorder.stop();
    // Atualiza a configuração com os valores reais do stream (evita bitrate errado)
    const track = slot.stream.getVideoTracks()[0];
    const realSettings = track.getSettings();
    slot.camCfg.w = realSettings.width || slot.camCfg.w;
    slot.camCfg.h = realSettings.height || slot.camCfg.h;
    slot.camCfg.fps = realSettings.frameRate || slot.camCfg.fps;
    if (slot.bufferMode === 'disk' || slot.bufferMode === 'disk-full') {
        if (!slot.diskBuffer) {
            const maxSec = slot.bufferMode === 'disk' ? slot.maxBufSec : Infinity;
            slot.diskBuffer = new DiskBuffer(maxSec);
        }
        try {
            await slot.diskBuffer.start();
        }
        catch (e) {
            showToast('Erro ao criar arquivo de buffer no disco. Verifique as permissões da pasta.', true);
            throw e;
        }
    }
    // Handler dos chunks (independe do codec escolhido).
    const onData = async (e) => {
        if (!e.data || e.data.size === 0)
            return;
        const bufSecAntes = slot.bufSec;
        slot.bufSec += 1; // cada chunk = 1s (mantemos timeslice 1000)
        slot.bufBytes += e.data.size;
        feedDvrIfActive(slot, e.data);
        if (slot.bufferMode === 'disk' || slot.bufferMode === 'disk-full') {
            if (slot.diskBuffer)
                await slot.diskBuffer.addChunk(e.data);
        }
        else if (slot.bufferMode === 'ram') {
            pushChunk(slot, e.data); // pode aparar e devolver bufSec ao teto
        }
        // Medido DEPOIS do trim: em RAM saturada o +1 é desfeito e o buffer para de crescer.
        slot.bufSecGrowing = slot.bufSec > bufSecAntes;
        slot.lastChunkAt = performance.now();
        if (slot.thumbTick++ % THUMB_EVERY_CHUNKS === 0)
            captureThumb(slot);
    };
    const preferredMimes = [
        'video/webm;codecs=vp8',
        'video/webm;codecs=vp9',
        'video/webm;codecs=h264',
        'video/webm;codecs=avc1',
        'video/mp4;codecs=h264',
        'video/webm',
        '',
    ];
    let started = false;
    for (const m of preferredMimes) {
        let rec = null;
        try {
            const reportedSupport = m ? MediaRecorder.isTypeSupported(m) : true;
            console.log(`[REC] Slot ${slot.id}: tentando "${m || 'padrão'}" (isTypeSupported=${reportedSupport})`);
            // NOVO: calcula bitrate adaptativo
            const bitrate = calculateBitrate(slot.camCfg.w, slot.camCfg.h, slot.camCfg.fps);
            rec = m
                ? new MediaRecorder(slot.stream, { mimeType: m, videoBitsPerSecond: bitrate })
                : new MediaRecorder(slot.stream, { videoBitsPerSecond: bitrate });
            if (!rec)
                throw new Error('MediaRecorder não foi criado');
            const recorder = rec;
            const firstChunk = new Promise((resolve, reject) => {
                const timeout = window.setTimeout(() => reject(new Error('nenhum chunk recebido após 3 segundos')), 3000);
                recorder.ondataavailable = async (event) => {
                    if (!event.data || event.data.size === 0)
                        return;
                    window.clearTimeout(timeout);
                    await onData(event);
                    resolve();
                };
                recorder.onerror = () => {
                    window.clearTimeout(timeout);
                    reject(new Error('MediaRecorder reportou erro durante a gravação'));
                };
            });
            // Mantemos timeslice de 1s para não quebrar a contagem de bufSec.
            // A segmentação em arquivos maiores é feita no DiskBuffer (agrupando 6 chunks).
            recorder.start(1000);
            await firstChunk;
            slot.recorder = recorder;
            slot.recordMime = recorder.mimeType || m || 'video/webm';
            if (slot.diskBuffer) {
                slot.diskBuffer.mimeType = slot.recordMime;
            }
            console.log(`[REC] Slot ${slot.id}: gravando com "${slot.recordMime}" a ${(bitrate / 1e6).toFixed(1)} Mbps`);
            started = true;
            break;
        }
        catch (e) {
            if (rec && rec.state !== 'inactive') {
                try {
                    rec.stop();
                }
                catch (_) { }
            }
            console.warn(`[REC] Slot ${slot.id}: codec "${m}" falhou (${e instanceof Error ? e.message : e})`);
        }
    }
    if (!started) {
        showToast('Nenhum codec de gravação disponível. No Linux, instale gstreamer1.0-plugins-good/ugly e gstreamer1.0-libav.', true);
        throw new Error('MediaRecorder indisponível nesta plataforma');
    }
}
export async function stopRecorder(slotIndex) {
    const slot = slotIndex !== undefined ? state.slots[slotIndex] : getActiveSlot();
    if (slot.recorder && slot.recorder.state !== 'inactive') {
        const recorder = slot.recorder;
        // Aguarda o evento 'stop' para garantir que ondataavailable finalize
        const stopped = new Promise((resolve) => {
            recorder.addEventListener('stop', () => resolve(), { once: true });
        });
        recorder.ondataavailable = null; // evita chunks finais indesejados
        try {
            recorder.stop();
        }
        catch (_) { }
        await stopped;
    }
    slot.recorder = null;
}
export async function clearBuffer(slot) {
    const s = slot || getActiveSlot();
    stopDvrFeed(s);
    if (s.bufferMode === 'disk' || s.bufferMode === 'disk-full') {
        if (s.diskBuffer) {
            await s.diskBuffer.stop();
            s.diskBuffer = null;
        }
    }
    else if (s.bufferMode === 'ram') {
        s.chunks = [];
        if (s.replayUrl) {
            URL.revokeObjectURL(s.replayUrl);
            s.replayUrl = null;
        }
    }
    s.bufSec = 0;
    s.bufBytes = 0;
    clearThumbs(s);
    s.lastChunkAt = 0;
    s.bufSecGrowing = false;
}
/* ─── DVR contínuo via MSE ─── */
/** Escolhe um codec compatível com MSE, priorizando o mime REAL usado na gravação. */
function resolveReplayCodec(slot) {
    const candidates = [
        slot.recordMime,
        'video/webm; codecs="vp8"',
        'video/webm; codecs="vp9"',
        'video/webm',
    ].filter(Boolean);
    for (const c of candidates) {
        if (MediaSource.isTypeSupported(c))
            return c;
    }
    return slot.recordMime || 'video/webm';
}
export async function prepareReplaySource(slot, seekSec) {
    const mediaSource = new MediaSource();
    const url = URL.createObjectURL(mediaSource);
    const ready = new Promise((resolve, reject) => {
        mediaSource.addEventListener('sourceopen', async () => {
            try {
                const codec = resolveReplayCodec(slot);
                if (!MediaSource.isTypeSupported(codec))
                    throw new Error(`Codec de replay não suportado: ${codec}`);
                const sourceBuffer = mediaSource.addSourceBuffer(codec);
                sourceBuffer.mode = 'sequence';
                // Determina a janela de busca (mesmo para RAM, definimos start/end)
                const target = seekSec ?? slot.bufSec;
                let start = 0;
                let end = slot.bufSec;
                if (slot.bufferMode === 'disk' || slot.bufferMode === 'disk-full') {
                    if (!slot.diskBuffer)
                        throw new Error('Buffer de disco não inicializado');
                    // Só ±30s em volta do ponto buscado entram no SourceBuffer. Estas
                    // atribuições precisam alcançar o start/end externos: são eles que
                    // viram windowStart/windowEnd, de onde o isWithinWindow() da UI
                    // decide se um seek cabe no que já está carregado. Declará-los de
                    // novo aqui fazia a janela ser reportada como 0..bufSec.
                    start = Math.max(0, target - 30);
                    end = Math.min(target + 30, slot.bufSec);
                    let segments = await slot.diskBuffer.getSegmentsBetween(start, end);
                    // Garante que o primeiro segmento (init) esteja incluído
                    if (slot.diskBuffer.segments.length > 0) {
                        const firstSeg = slot.diskBuffer.segments[0];
                        const firstIncluded = firstSeg.startTime >= start && firstSeg.endTime <= end;
                        if (!firstIncluded) {
                            try {
                                const tauri = window.__TAURI__;
                                const firstData = await tauri.fs.readFile(firstSeg.filePath);
                                segments.unshift(firstData);
                            }
                            catch (e) {
                                console.error('Erro ao carregar init segment', e);
                            }
                        }
                    }
                    for (const data of segments) {
                        await appendBufferSafely(sourceBuffer, data);
                    }
                }
                else {
                    // RAM: carrega todos os chunks (limitado pelo maxBufSec)
                    const chunksData = [];
                    for (const blob of slot.chunks) {
                        chunksData.push(new Uint8Array(await blob.arrayBuffer()));
                    }
                    for (const data of chunksData) {
                        await appendBufferSafely(sourceBuffer, data);
                    }
                }
                slot.dvrFeed = {
                    mediaSource,
                    sourceBuffer,
                    url,
                    stopped: false,
                    windowStart: start,
                    windowEnd: end,
                };
                resolve();
            }
            catch (e) {
                console.error('[MSE] erro:', e);
                if (mediaSource.readyState === 'open')
                    mediaSource.endOfStream('decode');
                reject(e);
            }
        });
    });
    return { url, ready };
}
async function appendBufferSafely(sb, data) {
    return new Promise((res, rej) => {
        const onUpdateEnd = () => {
            sb.removeEventListener('updateend', onUpdateEnd);
            sb.removeEventListener('error', onError);
            res();
        };
        const onError = (e) => {
            sb.removeEventListener('updateend', onUpdateEnd);
            sb.removeEventListener('error', onError);
            rej(e);
        };
        sb.addEventListener('updateend', onUpdateEnd);
        sb.addEventListener('error', onError);
        try {
            sb.appendBuffer(data.buffer);
        }
        catch (err) {
            rej(err);
        }
    });
}
/**
 * Replay ROBUSTO sem MSE: monta um WebM completo (cabeçalho + clusters) e devolve
 * um blob URL tocado diretamente pelo <video>. Evita o SourceBuffer, que é instável
 * para WebM no WKWebView (Safari/macOS) e falha ao remontar os chunks.
 * Revoga o URL anterior para não vazar memória.
 */
export async function prepareReplayBlobUrl(slot) {
    if (slot.replayUrl) {
        URL.revokeObjectURL(slot.replayUrl);
        slot.replayUrl = null;
    }
    let url = null;
    if (slot.bufferMode === 'disk' || slot.bufferMode === 'disk-full') {
        if (!slot.diskBuffer)
            throw new Error('Buffer de disco não inicializado');
        url = await slot.diskBuffer.getUrl();
    }
    else {
        if (!slot.chunks.length)
            throw new Error('Nenhum dado no buffer');
        const blob = new Blob(slot.chunks, { type: slot.recordMime || 'video/webm' });
        url = URL.createObjectURL(blob);
    }
    if (!url)
        throw new Error('Nenhum dado gravado para replay');
    slot.replayUrl = url;
    return url;
}
export function stopDvrFeed(slot) {
    if (slot.dvrFeed) {
        slot.dvrFeed.stopped = true;
        if (slot.dvrFeed.mediaSource.readyState === 'open') {
            try {
                slot.dvrFeed.mediaSource.endOfStream();
            }
            catch (e) { /* já fechado */ }
        }
        // Sem o revoke, o registro de object URLs continua referenciando o MediaSource
        // e o SourceBuffer não é liberado: cada entrada em DVR segurava a janela inteira
        // (até 300s ≈ 180 MB a 1080p60). Em 4 GB, poucas revisões esgotavam a memória.
        URL.revokeObjectURL(slot.dvrFeed.url);
        slot.dvrFeed = null;
    }
}
export async function restartCapture(deviceId, res, fps, liveVid, slotIndex) {
    const slot = slotIndex !== undefined ? state.slots[slotIndex] : getActiveSlot();
    if (!slot.stream || state.restarting)
        return;
    state.restarting = true;
    stopRecorder(slot.id);
    stopDvrFeed(slot);
    slot.stream.getTracks().forEach(t => t.stop());
    try {
        const s = await openCamera(slot, res, fps);
        slot.stream = s;
        liveVid.srcObject = s;
        await liveVid.play();
        await startRecorder(slot.id);
    }
    catch (e) {
        showToast(e instanceof Error ? e.message : 'Erro ao reiniciar captura', true);
    }
    finally {
        state.restarting = false;
    }
}
export async function loadMoreSegments(slot, direction) {
    if (!slot.dvrFeed || slot.dvrFeed.stopped)
        return;
    if (slot.bufferMode !== 'disk' && slot.bufferMode !== 'disk-full')
        return;
    if (!slot.diskBuffer)
        return;
    const feed = slot.dvrFeed;
    const margin = 30; // segundos a carregar além da janela atual
    let newStart = feed.windowStart;
    let newEnd = feed.windowEnd;
    if (direction === 'forward') {
        newEnd = Math.min(feed.windowEnd + margin, slot.bufSec);
    }
    else {
        newStart = Math.max(feed.windowStart - margin, 0);
    }
    // Se não há mudança, não faz nada
    if (newStart === feed.windowStart && newEnd === feed.windowEnd)
        return;
    // Busca segmentos que intersectam a nova faixa
    const segments = await slot.diskBuffer.getSegmentsBetween(newStart, newEnd);
    // Adiciona ao sourceBuffer (apenas os que ainda não estão? Vamos adicionar todos; o MSE descarta duplicatas? 
    // Na verdade, podemos causar erro se adicionar segmentos que já estão presentes. 
    // Para simplificar, vamos recarregar apenas os novos segmentos, mas como getSegmentsBetween retorna a interseção total, 
    // pode incluir segmentos já carregados. Precisamos filtrar: 
    // Uma maneira é carregar todos os segmentos da nova janela e aceitar que possam haver sobreposições. 
    // O MSE pode rejeitar dados duplicados? Para WebM em sequência, pode ser problemático. 
    // Vamos assumir que getSegmentsBetween retorna apenas os segmentos cujos arquivos ainda não foram adicionados, 
    // mas nossa função atual retorna todos. Precisamos manter um controle de quais segmentos já foram carregados. 
    // Para simplificar, vou alterar a abordagem: quando precisamos expandir, recarregamos a janela inteira do zero? 
    // Isso não é eficiente. 
    // Melhor: adicionar um registro de segmentos carregados no DiskBuffer ou no slot. 
    // Para não complicar, nesta primeira versão, vamos apenas adicionar os novos segmentos assumindo que getSegmentsBetween 
    // retorna apenas os segmentos que estão dentro da faixa expandida e que ainda não foram adicionados. 
    // Mas como a função retorna todos os segmentos que intersectam, se a janela expandida inclui segmentos já carregados, 
    // eles serão duplicados. Para evitar, podemos armazenar no feed os índices dos segmentos já carregados. 
    // Vou implementar rapidamente um controle simples: no slot, adicionar um array `loadedSegmentIndices: Set<number>`. 
    // Então, ao carregar segmentos, filtramos os que já estão. 
}
/* ─── FrameDelayer (delay ao vivo) ─── */
export class FrameDelayer {
    video;
    canvas;
    ctx;
    delaySeconds;
    isRunning;
    animationId;
    frameBuffer;
    targetFPS;
    lastCaptureTime;
    jpegQuality;
    offscreen;
    offscreenCtx;
    constructor(videoElement, canvasElement, delaySeconds = 0) {
        this.video = videoElement;
        this.canvas = canvasElement;
        this.canvas.style.display = 'none';
        this.ctx = canvasElement.getContext('2d');
        this.delaySeconds = delaySeconds;
        this.isRunning = false;
        this.animationId = null;
        this.frameBuffer = [];
        this.targetFPS = 15;
        this.lastCaptureTime = 0;
        this.jpegQuality = 0.3;
        this.offscreen = document.createElement('canvas');
        this.offscreenCtx = this.offscreen.getContext('2d');
    }
    start() {
        if (this.isRunning)
            return;
        this.isRunning = true;
        if (this.delaySeconds <= 0) {
            this.video.style.display = 'block';
            this.canvas.style.display = 'none';
            return;
        }
        this.video.style.display = 'none';
        this.canvas.style.display = 'block';
        this.canvas.width = this.video.videoWidth || 1280;
        this.canvas.height = this.video.videoHeight || 720;
        this.frameBuffer = [];
        this.lastCaptureTime = 0;
        this.animationId = requestAnimationFrame(this._loop.bind(this));
    }
    stop() {
        this.isRunning = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        this.frameBuffer.forEach(f => URL.revokeObjectURL(f.url));
        this.frameBuffer = [];
        this.video.style.display = 'block';
        this.canvas.style.display = 'none';
    }
    setDelay(seconds) {
        this.delaySeconds = seconds;
        if (this.isRunning) {
            this.stop();
            this.start();
        }
    }
    _loop(timestamp) {
        if (!this.isRunning)
            return;
        const video = this.video;
        if (video.readyState >= 2 && video.videoWidth > 0) {
            const captureInterval = 1000 / this.targetFPS;
            if (timestamp - this.lastCaptureTime >= captureInterval) {
                this.lastCaptureTime = timestamp;
                this._captureFrame(timestamp);
            }
            const threshold = timestamp - this.delaySeconds * 1000;
            while (this.frameBuffer.length > 1 && this.frameBuffer[0].timestamp < threshold) {
                const old = this.frameBuffer.shift();
                if (old)
                    URL.revokeObjectURL(old.url);
            }
            if (this.frameBuffer.length > 0) {
                const oldest = this.frameBuffer[0];
                const img = new Image();
                img.onload = () => { if (this.canvas.width !== img.width || this.canvas.height !== img.height) {
                    this.canvas.width = img.width;
                    this.canvas.height = img.height;
                } this.ctx.drawImage(img, 0, 0); };
                img.src = oldest.url;
            }
        }
        this.animationId = requestAnimationFrame(this._loop.bind(this));
    }
    _captureFrame(timestamp) { const w = this.video.videoWidth; const h = this.video.videoHeight; if (this.offscreen.width !== w || this.offscreen.height !== h) {
        this.offscreen.width = w;
        this.offscreen.height = h;
        this.offscreenCtx = this.offscreen.getContext('2d');
    } this.offscreenCtx.drawImage(this.video, 0, 0, w, h); this.offscreen.toBlob(blob => { if (blob) {
        const url = URL.createObjectURL(blob);
        this.frameBuffer.push({ url, timestamp });
    } }, 'image/jpeg', this.jpegQuality); }
}
//# sourceMappingURL=camera.js.map