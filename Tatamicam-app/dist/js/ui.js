import { formatTime, showToast } from './utils.js';
import * as cam from './camera.js';
import { showConfirm } from './dialog.js';
import { saveFileNative, writeFileNative, isTauri } from './tauri.js';
import { getDefaultSaveFolder } from './storage.js';
import { FrameDelayer } from './delay.js';
import { initSettings } from './settings.js';
import { verifyLicense, heartbeatLicense } from './license.js';
import { initActivateModal, openActivateModal } from './activateModal.js';
import { setActiveSlot } from './slots-ui.js';
const state = cam.getState();
window.__tatamiState = state;
let dom = {};
let isDrag = false;
let statsInterval = null;
const frameDelayers = [null, null, null, null];
const slotAbortControllers = [null, null, null, null];
let desligarEmAndamento = false;
let clickTimer = null;
let zoomActive = false;
let zoomLevel = 1;
let zoomPanX = 0; // -0.5 a 0.5
let zoomPanY = 0;
export function initUI(elements) {
    dom = elements;
    bindEvents();
    requestAnimationFrame(tlLoop);
    initSettings();
    initActivateModal();
    window.__updateUIElements = (newElements) => { for (const key in newElements) {
        if (dom[key] !== undefined)
            dom[key] = newElements[key];
    } };
    verifyLicense().then(result => { if (!result.valid)
        showLicenseBlock(result.reason || 'Licença inválida');
    else
        hideLicenseBlock(); });
    if (dom.drawer)
        dom.drawer.classList.remove('open');
    if (dom.drawerOverlay)
        dom.drawerOverlay.classList.remove('open');
    if (dom.fullscreenControls)
        dom.fullscreenControls.classList.remove('show');
    const savedFolder = getDefaultSaveFolder();
    if (savedFolder && dom.folderPathModal)
        dom.folderPathModal.textContent = savedFolder;
    const globalDelay = document.getElementById('delaySlider');
    if (globalDelay) {
        const slot = cam.getActiveSlot();
        globalDelay.value = String(slot.delaySeconds);
        if (dom.delayLbl)
            dom.delayLbl.textContent = `${slot.delaySeconds}s`;
    }
    setInterval(async () => { await heartbeatLicense(); const result = await verifyLicense(); if (!result.valid)
        showLicenseBlock(result.reason || 'Licença inválida.');
    else
        hideLicenseBlock(); }, 4 * 60 * 60 * 1000);
    // Delay ajustado nas Configurações: aplica na hora se a câmera já estiver rodando.
    window.addEventListener('delay-changed', ((e) => {
        const secs = e.detail?.seconds ?? 0;
        const slot = cam.getActiveSlot();
        if (frameDelayers[slot.id])
            frameDelayers[slot.id].setDelay(secs);
    }));
    document.addEventListener('mousemove', () => {
        if (fsAtivo())
            resetAutoHide();
    });
    document.addEventListener('keydown', (e) => {
        if (fsAtivo()) {
            resetAutoHide();
            // Atalhos de teclado (espaço, setas, etc.)
            handleFullscreenShortcuts(e);
        }
    });
}
function bindEvents() {
    dom.btnStart?.addEventListener('click', onStart);
    dom.btnStop?.addEventListener('click', onStop);
    dom.btnDesligar?.addEventListener('click', onDesligar);
    dom.btnPP?.addEventListener('click', togglePP);
    dom.btnB5?.addEventListener('click', () => handleSeek(-5));
    dom.btnF5?.addEventListener('click', () => handleSeek(5));
    dom.btnSave?.addEventListener('click', () => { if (cam.getActiveSlot().bufSec === 0) {
        showToast('Nenhum vídeo gravado ainda.');
        return;
    } onSave(); });
    dom.s025?.addEventListener('click', () => setSpeed(0.25));
    dom.s05?.addEventListener('click', () => setSpeed(0.5));
    dom.s1?.addEventListener('click', () => setSpeed(1));
    dom.s2?.addEventListener('click', () => setSpeed(2));
    dom.btnPP2?.addEventListener('click', togglePP);
    dom.btnB5_2?.addEventListener('click', () => handleSeek(-5));
    dom.btnF5_2?.addEventListener('click', () => handleSeek(5));
    dom.btnSave2?.addEventListener('click', () => { if (cam.getActiveSlot().bufSec === 0) {
        showToast('Nenhum vídeo gravado ainda.');
        return;
    } onSave(); });
    dom.s025_2?.addEventListener('click', () => setSpeed(0.25));
    dom.s05_2?.addEventListener('click', () => setSpeed(0.5));
    dom.s1_2?.addEventListener('click', () => setSpeed(1));
    dom.s2_2?.addEventListener('click', () => setSpeed(2));
    dom.btnExitFullscreen?.addEventListener('click', () => { if (fsAtivo())
        void fsExit(); });
    dom.btnPrevSlot?.addEventListener('click', () => changeFullscreenSlot(-1));
    dom.btnNextSlot?.addEventListener('click', () => changeFullscreenSlot(1));
    dom.tlBar?.addEventListener('mousemove', (e) => showPreviewAt(pctFromEvent(e)));
    dom.tlBar?.addEventListener('mouseleave', hidePreview);
    dom.tlBar?.addEventListener('mousedown', startDrag);
    dom.tlBar?.addEventListener('touchstart', startDrag, { passive: true });
    // Sem listener de 'click': o par mousedown/mouseup (startDrag/endDrag) já resolve
    // tanto o arrasto quanto o clique simples. Com os dois, todo clique disparava
    // duas buscas concorrentes no mesmo <video> (o endDrag limpa isDrag antes de o
    // evento 'click' chegar, então a guarda do onTimelineClick nunca pegava).
    dom.tlLive?.addEventListener('click', onLiveJump);
    bindActiveSlotVideoEvents(0);
    dom.bufSlider?.addEventListener('input', e => { const v = parseInt(e.target.value, 10); if (dom.bufLbl)
        dom.bufLbl.textContent = `${v} min`; cam.setMaxBufSec(v * 60); updateEstimate(); });
    dom.delaySlider?.addEventListener('input', e => { const v = parseInt(e.target.value, 10); const active = cam.getActiveSlot(); active.delaySeconds = v; if (dom.delayLbl)
        dom.delayLbl.textContent = `${v}s`; if (frameDelayers[active.id] && active.cameraOn)
        frameDelayers[active.id].setDelay(v); });
    dom.resSel?.addEventListener('change', () => restartCapture());
    dom.fpsSel?.addEventListener('change', () => restartCapture());
    dom.camSel?.addEventListener('change', () => { if (cam.getActiveSlot().stream)
        restartCapture(); });
    dom.btnRefresh?.addEventListener('click', () => cam.populateCameraList(dom.camSel));
    dom.btnHamburger?.addEventListener('click', toggleDrawer);
    dom.drawerClose?.addEventListener('click', closeDrawer);
    dom.drawerOverlay?.addEventListener('click', closeDrawer);
    dom.menuFullscreen?.addEventListener('click', () => { toggleFullscreen(); closeDrawer(); });
    dom.menuHelp?.addEventListener('click', () => { closeDrawer(); const ob = document.getElementById('onboarding'); if (ob) {
        ob.style.display = 'flex';
        ob.style.opacity = '1';
    } });
    dom.menuActivateToken?.addEventListener('click', () => { closeDrawer(); openActivateModal(); });
    dom.btnFullscreen?.addEventListener('click', toggleFullscreen);
    dom.btnZoom?.addEventListener('click', toggleZoom);
    // Zoom com roda do mouse
    document.addEventListener('wheel', (e) => {
        if (!zoomActive)
            return;
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.2 : 0.2;
        setZoomLevel(zoomLevel + delta);
    }, { passive: false });
    // Zoom com teclado
    document.addEventListener('keydown', (e) => {
        if (e.key === 'z' || e.key === 'Z') {
            e.preventDefault();
            toggleZoom();
        }
        else if (zoomActive) {
            if (e.key === '+' || e.key === '=') {
                e.preventDefault();
                setZoomLevel(zoomLevel + 0.2);
            }
            else if (e.key === '-') {
                e.preventDefault();
                setZoomLevel(zoomLevel - 0.2);
            }
            else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                zoomPanX = Math.max(-0.5, zoomPanX - 0.1);
                applyZoom();
            }
            else if (e.key === 'ArrowRight') {
                e.preventDefault();
                zoomPanX = Math.min(0.5, zoomPanX + 0.1);
                applyZoom();
            }
            else if (e.key === 'ArrowUp') {
                e.preventDefault();
                zoomPanY = Math.max(-0.5, zoomPanY - 0.1);
                applyZoom();
            }
            else if (e.key === 'ArrowDown') {
                e.preventDefault();
                zoomPanY = Math.min(0.5, zoomPanY + 0.1);
                applyZoom();
            }
        }
    });
    document.addEventListener('fullscreenchange', updateFullscreenUI);
    document.addEventListener('webkitfullscreenchange', updateFullscreenUI);
    const btnBlockActivate = document.getElementById('btnBlockActivate');
    if (btnBlockActivate)
        btnBlockActivate.addEventListener('click', () => { hideLicenseBlock(); openActivateModal(); });
    const btnBlockBuy = document.getElementById('btnBlockBuy');
    if (btnBlockBuy)
        btnBlockBuy.addEventListener('click', () => window.open('https://tatamicam.com/comprar', '_blank'));
    const btnBlockExit = document.getElementById('btnBlockExit');
    if (btnBlockExit)
        btnBlockExit.addEventListener('click', () => { if (isTauri())
            window.__TAURI__.process.exit(0);
        else
            window.close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && dom.drawer?.classList.contains('open'))
        closeDrawer(); });
    if (navigator.mediaDevices && typeof navigator.mediaDevices.addEventListener === 'function') {
        navigator.mediaDevices.addEventListener('devicechange', () => { cam.populateCameraList(dom.camSel); showToast('Dispositivos alterados.'); });
    }
    window.addEventListener('beforeunload', e => { const hasUnsaved = cam.getState().slots.some(slot => slot.bufSec > 0); if (hasUnsaved) {
        e.preventDefault();
        e.returnValue = 'Há vídeo não salvo em pelo menos uma câmera.';
    } });
    window.addEventListener('slot-changed', ((e) => {
        const newSlotId = e.detail.slotId;
        const newSlot = state.slots[newSlotId];
        const newElements = { liveVid: newSlot.videoElement, replayVid: document.getElementById(`replayVid${newSlotId}`), liveWrap: document.getElementById(`liveWrap${newSlotId}`), replayWrap: document.getElementById(`replayWrap${newSlotId}`), bLive: document.getElementById(`bLive${newSlotId}`), bDvr: document.getElementById(`bDvr${newSlotId}`), idleOv: document.getElementById(`idleOv${newSlotId}`), flashIco: document.getElementById(`flashIco${newSlotId}`), delayCanvas: document.getElementById(`delayCanvas${newSlotId}`) };
        window.__updateUIElements(newElements);
        bindActiveSlotVideoEvents(newSlotId);
        refreshTL();
        updatePP();
    }));
}
function bindActiveSlotVideoEvents(slotId) {
    const slot = state.slots[slotId];
    if (!slot || !slot.videoElement)
        return;
    slotAbortControllers[slotId]?.abort();
    const controller = new AbortController();
    slotAbortControllers[slotId] = controller;
    const { signal } = controller;
    const vid = slot.videoElement;
    const replayVid = document.getElementById(`replayVid${slotId}`);
    vid.addEventListener('click', togglePP, { signal });
    vid.addEventListener('play', updatePP, { signal });
    vid.addEventListener('pause', updatePP, { signal });
    replayVid?.addEventListener('click', togglePP, { signal });
    replayVid?.addEventListener('play', updatePP, { signal });
    replayVid?.addEventListener('pause', updatePP, { signal });
    replayVid?.addEventListener('timeupdate', () => { if (!isDrag)
        refreshTL(); }, { signal });
    vid.addEventListener('mousedown', startPan);
    replayVid?.addEventListener('mousedown', startPan);
    // Ao chegar no fim, NÃO volta pro ao vivo sozinho: segura no último frame (fica no
    // modo replay pro árbitro rever/scrubar). O nudge para trás tira do estado "ended"
    // (que fazia o play reiniciar do zero).
    replayVid?.addEventListener('ended', () => {
        replayVid.pause();
        if (isFinite(replayVid.duration) && replayVid.duration > 0.15)
            replayVid.currentTime = replayVid.duration - 0.1;
        updatePP();
    }, { signal });
    replayVid?.addEventListener('ratechange', refreshSpeedButtons, { signal });
    replayVid?.addEventListener('waiting', () => console.log(`[VIDEO] Slot ${slotId}: waiting`), { signal });
    replayVid?.addEventListener('stalled', () => console.log(`[VIDEO] Slot ${slotId}: stalled`), { signal });
}
/* ── Bloqueio de licença ── */
function showLicenseBlock(reason) { const overlay = document.getElementById('licenseBlockOverlay'); const msg = document.getElementById('licenseBlockMsg'); if (overlay) {
    overlay.style.display = 'flex';
    if (msg)
        msg.textContent = reason;
} }
function hideLicenseBlock() { const overlay = document.getElementById('licenseBlockOverlay'); if (overlay)
    overlay.style.display = 'none'; }
/* ── LOOP PRINCIPAL ── */
function tlLoop() { const slot = cam.getActiveSlot(); if (slot.mode === 'live' && !isDrag)
    refreshTL(); requestAnimationFrame(tlLoop); }
/* ── SEEK ── */
function handleSeek(delta) {
    console.log(`[SEEK] delta=${delta}`);
    const slot = cam.getActiveSlot();
    if (slot.mode === 'idle') {
        showToast('Câmera não iniciada.');
        return;
    }
    const { bufStart, bufWindow } = timelineWindow(slot);
    if (slot.mode === 'live') {
        slot.wasPlaying = true;
        const newPos = Math.min(Math.max(bufStart + bufWindow + delta, bufStart), bufStart + bufWindow);
        goDVR(slot, newPos - bufStart);
        return;
    }
    // Modo DVR
    const replayVid = document.getElementById(`replayVid${slot.id}`);
    if (!replayVid || !isFinite(replayVid.duration) || replayVid.duration === 0) {
        showToast('Vídeo de replay indisponível.', true);
        return;
    }
    const current = replayVid.currentTime;
    const newTime = Math.min(Math.max(current + delta, 0), replayVid.duration);
    const absolute = bufStart + newTime; // tempo relativo ao início do buffer
    if (!isTimeInWindow(slot, absolute)) {
        // Fora da janela: reconstruir
        slot.wasPlaying = !replayVid.paused;
        goDVR(slot, absolute - bufStart);
        return;
    }
    replayVid.currentTime = newTime;
    refreshTL();
}
function seekOffset(delta) { const slot = cam.getActiveSlot(); if (slot.mode !== 'dvr')
    return; const replayVid = document.getElementById(`replayVid${slot.id}`); if (!replayVid || !isFinite(replayVid.duration) || replayVid.duration === 0) {
    showToast('Vídeo de replay indisponível.', true);
    return;
} replayVid.currentTime = Math.min(Math.max(replayVid.currentTime + delta, 0), replayVid.duration); refreshTL(); }
/* ── DRAWER / FULLSCREEN (mantidos) ── */
function toggleDrawer() { dom.drawer?.classList.toggle('open'); dom.drawerOverlay?.classList.toggle('open'); }
function closeDrawer() { dom.drawer?.classList.remove('open'); dom.drawerOverlay?.classList.remove('open'); }
function toggleFullscreen() {
    const stage = document.querySelector('.stage');
    if (!stage) {
        showToast('Elemento não encontrado.', true);
        return;
    }
    if (!fsAtivo()) {
        fsRequest(stage).catch((e) => {
            console.warn('[FS] requestFullscreen falhou', e);
            showToast('Tela cheia indisponível', true);
        });
    }
    else {
        void fsExit();
    }
}
let fsNativoAtivo = false;
function fsElement() {
    const d = document;
    return document.fullscreenElement ?? d.webkitFullscreenElement ?? null;
}
/** Tela cheia ativa, por qualquer um dos dois caminhos. */
function fsAtivo() {
    return !!fsElement() || fsNativoAtivo;
}
/** Tela cheia da JANELA, via Tauri. Independe do suporte do webview. */
async function fsJanelaNativa(on) {
    const w = window.__TAURI__?.window;
    if (!w?.getCurrentWindow)
        return false;
    try {
        await w.getCurrentWindow().setFullscreen(on);
        fsNativoAtivo = on;
        return true;
    }
    catch (e) {
        console.warn('[FS] setFullscreen nativo falhou', e);
        return false;
    }
}
async function fsRequest(el) {
    const e = el;
    const fn = el.requestFullscreen ?? e.webkitRequestFullscreen ?? e.webkitRequestFullScreen;
    if (fn) {
        try {
            await fn.call(el);
            return;
        }
        catch (err) {
            console.warn('[FS] fullscreen de elemento falhou; tentando janela nativa', err);
        }
    }
    // O WKWebView do macOS só habilita fullscreen de elemento com uma preferência que
    // o Tauri não liga por padrão. Numa app desktop, deixar a JANELA em tela cheia
    // entrega o mesmo resultado ao árbitro — e funciona em qualquer webview.
    if (await fsJanelaNativa(true)) {
        updateFullscreenUI();
        return;
    }
    throw new Error('API de tela cheia indisponível neste webview');
}
async function fsExit() {
    if (fsElement()) {
        const d = document;
        const fn = document.exitFullscreen ?? d.webkitExitFullscreen;
        if (fn) {
            try {
                await fn.call(document);
            }
            catch (e) {
                console.warn('[FS] falha ao sair', e);
            }
        }
        return;
    }
    if (fsNativoAtivo && await fsJanelaNativa(false))
        updateFullscreenUI();
}
function isTimeInWindow(slot, time) {
    if (!slot.dvrFeed)
        return false;
    return time >= slot.dvrFeed.windowStart && time <= slot.dvrFeed.windowEnd;
}
function applyZoom() {
    const slot = cam.getActiveSlot();
    const video = slot.mode === 'dvr'
        ? document.getElementById(`replayVid${slot.id}`)
        : slot.videoElement;
    if (!video)
        return;
    if (zoomActive && zoomLevel > 1) {
        video.style.transformOrigin = `${50 + zoomPanX * 100}% ${50 + zoomPanY * 100}%`;
        video.style.transform = `scale(${zoomLevel})`;
        video.style.cursor = 'grab';
    }
    else {
        video.style.transform = '';
        video.style.transformOrigin = '';
        video.style.cursor = 'pointer';
    }
}
function setZoomLevel(level) {
    zoomLevel = Math.min(Math.max(level, 1), 5); // entre 1x e 5x
    applyZoom();
    showToast(`Zoom: ${zoomLevel.toFixed(1)}x`);
}
function toggleZoom() {
    zoomActive = !zoomActive;
    if (!zoomActive) {
        zoomLevel = 1;
        zoomPanX = 0;
        zoomPanY = 0;
    }
    applyZoom();
    showToast(zoomActive ? 'Zoom ativado' : 'Zoom desativado');
}
function updateFullscreenUI() {
    const stage = document.querySelector('.stage');
    const fs = document.getElementById('fullscreenControls');
    const ctrl = document.getElementById('ctrlBar');
    const btn = document.getElementById('btnFullscreen');
    // A classe vai no body porque o fallback de janela nativa (webviews sem
    // fullscreen de elemento) mantém a página inteira renderizada: header e faixas
    // de status/dica continuariam visíveis sem isto.
    document.body.classList.toggle('app-fullscreen', fsAtivo());
    if (fsAtivo()) {
        stage?.classList.add('fullscreen-active');
        if (fs) {
            fs.classList.add('show');
        }
        if (ctrl)
            ctrl.style.display = 'none';
        if (btn)
            btn.querySelector('i').className = 'fas fa-compress';
        // Auto-hide desativado por enquanto
        // startAutoHide();
    }
    else {
        stage?.classList.remove('fullscreen-active');
        if (fs)
            fs.classList.remove('show');
        if (ctrl)
            ctrl.style.display = '';
        if (btn)
            btn.querySelector('i').className = 'fas fa-expand';
        // stopAutoHide();
    }
}
let isPanning = false;
let panStartX = 0;
let panStartY = 0;
function startPan(e) {
    if (!zoomActive)
        return;
    isPanning = true;
    panStartX = e.clientX;
    panStartY = e.clientY;
    document.addEventListener('mousemove', onPan);
    document.addEventListener('mouseup', endPan);
}
function onPan(e) {
    if (!isPanning)
        return;
    const dx = (e.clientX - panStartX) / window.innerWidth;
    const dy = (e.clientY - panStartY) / window.innerHeight;
    zoomPanX = Math.min(0.5, Math.max(-0.5, zoomPanX + dx));
    zoomPanY = Math.min(0.5, Math.max(-0.5, zoomPanY + dy));
    panStartX = e.clientX;
    panStartY = e.clientY;
    applyZoom();
}
function endPan() {
    isPanning = false;
    document.removeEventListener('mousemove', onPan);
    document.removeEventListener('mouseup', endPan);
}
function moveTimelineToFullscreenControls() {
    const tlWrap = document.getElementById('tlWrap');
    const fsControls = document.getElementById('fullscreenControls');
    if (tlWrap && fsControls && tlWrap.parentElement !== fsControls) {
        fsControls.insertBefore(tlWrap, fsControls.firstChild);
        // Ajusta posição para ficar acima dos botões
        tlWrap.style.position = 'relative';
        tlWrap.style.bottom = 'auto';
        tlWrap.style.left = 'auto';
        tlWrap.style.right = 'auto';
        tlWrap.style.marginBottom = '10px';
        tlWrap.style.zIndex = '1';
    }
}
function restoreTimelineFromFullscreenControls() {
    const tlWrap = document.getElementById('tlWrap');
    const stage = document.querySelector('.stage');
    if (tlWrap && stage && tlWrap.parentElement !== stage) {
        stage.appendChild(tlWrap);
        // Remove estilos inline adicionados
        tlWrap.style.position = '';
        tlWrap.style.bottom = '';
        tlWrap.style.left = '';
        tlWrap.style.right = '';
        tlWrap.style.marginBottom = '';
        tlWrap.style.zIndex = '';
    }
}
function handleFullscreenShortcuts(e) {
    const slot = cam.getActiveSlot();
    switch (e.key) {
        case ' ':
            e.preventDefault();
            togglePP();
            break;
        case 'ArrowLeft':
            e.preventDefault();
            handleSeek(-5);
            break;
        case 'ArrowRight':
            e.preventDefault();
            handleSeek(5);
            break;
        case 'ArrowUp':
            e.preventDefault();
            changeFullscreenSlot(-1);
            break;
        case 'ArrowDown':
            e.preventDefault();
            changeFullscreenSlot(1);
            break;
        case 'f':
        case 'F':
            e.preventDefault();
            toggleFullscreen();
            break;
        case 'Escape':
            // O navegador já sai da tela cheia, mas garantimos a UI
            if (fsAtivo())
                void fsExit();
            break;
    }
}
function changeFullscreenSlot(direction) { const totalSlots = document.querySelectorAll('.camera-slot').length; if (totalSlots <= 1)
    return; let next = state.activeSlot + direction; if (next < 0)
    next = totalSlots - 1; if (next >= totalSlots)
    next = 0; setActiveSlot(next); updateUIForActiveSlot(next); }
function updateUIForActiveSlot(slotId) { const newElements = { liveVid: document.getElementById(`liveVid${slotId}`), replayVid: document.getElementById(`replayVid${slotId}`), liveWrap: document.getElementById(`liveWrap${slotId}`), replayWrap: document.getElementById(`replayWrap${slotId}`), bLive: document.getElementById(`bLive${slotId}`), bDvr: document.getElementById(`bDvr${slotId}`), idleOv: document.getElementById(`idleOv${slotId}`), flashIco: document.getElementById(`flashIco${slotId}`), delayCanvas: document.getElementById(`delayCanvas${slotId}`) }; window.__updateUIElements(newElements); refreshTL(); }
let autoHideTimer = null;
function startAutoHide() {
    const fs = document.getElementById('fullscreenControls');
    if (!fs)
        return;
    // Remove qualquer timer existente
    if (autoHideTimer)
        clearTimeout(autoHideTimer);
    // Esconde após 3s
    autoHideTimer = setTimeout(() => {
        fs.classList.add('hide');
    }, 3000);
}
function stopAutoHide() {
    if (autoHideTimer) {
        clearTimeout(autoHideTimer);
        autoHideTimer = null;
    }
    const fs = document.getElementById('fullscreenControls');
    if (fs)
        fs.classList.remove('hide');
}
function resetAutoHide() {
    stopAutoHide();
    startAutoHide();
}
/* ── ONSTART ── */
async function onStart() {
    console.log('[START] onStart chamado');
    dom.btnStart.disabled = true;
    const slot = cam.getActiveSlot();
    if (!slot.videoElement) {
        showToast('Elemento de vídeo não encontrado para este slot.', true);
        dom.btnStart.disabled = false;
        return;
    }
    try {
        if (slot.cameraOn && slot.stream) {
            slot.mode = 'live';
            // Recria o FrameDelayer se o Parar o zerou, senão o delay some ao reiniciar.
            if (!frameDelayers[slot.id])
                frameDelayers[slot.id] = new FrameDelayer(slot.videoElement, document.getElementById(`delayCanvas${slot.id}`), slot.delaySeconds);
            else
                frameDelayers[slot.id].setDelay(slot.delaySeconds);
            frameDelayers[slot.id].start();
            await cam.startRecorder(slot.id);
            goLiveSlot(slot.id);
            return;
        }
        const devId = slot.deviceId || dom.camSel?.value || undefined;
        await cam.startCamera(devId, dom.resSel?.value, dom.fpsSel?.value, slot.videoElement, slot.id);
        slot.mode = 'live';
        await cam.startRecorder(slot.id);
        await cam.populateCameraList(dom.camSel);
        startStats();
        if (!frameDelayers[slot.id])
            frameDelayers[slot.id] = new FrameDelayer(slot.videoElement, document.getElementById(`delayCanvas${slot.id}`), slot.delaySeconds);
        else
            frameDelayers[slot.id].setDelay(slot.delaySeconds);
        frameDelayers[slot.id].start();
        goLiveSlot(slot.id);
    }
    catch (err) {
        showToast(err instanceof Error ? err.message : 'Erro desconhecido', true);
    }
    dom.btnStart.disabled = false;
}
function goLiveSlot(slotId) {
    console.log(`[LIVE] Slot ${slotId}: voltando ao vivo. mode anterior=${state.slots[slotId].mode}`);
    const slot = state.slots[slotId];
    cam.stopDvrFeed(slot);
    slot.mode = 'live';
    const liveWrap = document.getElementById(`liveWrap${slotId}`);
    const replayWrap = document.getElementById(`replayWrap${slotId}`);
    const liveVid = document.getElementById(`liveVid${slotId}`);
    const stageBox = document.getElementById(`slot${slotId}`) || document.querySelector('.stage-box'); // fallback
    // Força o vídeo a ter tamanho (remove qualquer display:none e define estilo inline)
    if (liveVid) {
        liveVid.style.display = 'block';
        liveVid.style.width = '100%';
        liveVid.style.height = '100%';
        liveVid.style.objectFit = 'contain';
    }
    // Garante que o liveWrap e seus ancestrais estejam visíveis e com tamanho
    if (liveWrap) {
        liveWrap.classList.remove('hidden');
        liveWrap.style.display = '';
    }
    if (replayWrap)
        replayWrap.classList.add('hidden');
    document.getElementById(`idleOv${slotId}`)?.classList.add('gone');
    document.getElementById(`bLive${slotId}`)?.classList.remove('dim');
    document.getElementById(`bDvr${slotId}`)?.classList.remove('show');
    // Diagnóstico: dimensões dos elementos
    if (stageBox) {
        const sr = stageBox.getBoundingClientRect();
        console.log(`[LIVE] stageBox rect: ${sr.width} x ${sr.height}`);
    }
    if (liveWrap) {
        const lr = liveWrap.getBoundingClientRect();
        console.log(`[LIVE] liveWrap rect: ${lr.width} x ${lr.height}`);
    }
    if (liveVid) {
        const vr = liveVid.getBoundingClientRect();
        console.log(`[LIVE] liveVid rect: ${vr.width} x ${vr.height}`);
    }
    // Reassocia o stream e força play
    if (slot.stream && liveVid) {
        if (liveVid.srcObject !== slot.stream) {
            liveVid.srcObject = slot.stream;
        }
        setTimeout(() => {
            liveVid.play().catch(e => console.warn('play() rejeitado:', e));
            // Log após play
            const vr = liveVid.getBoundingClientRect();
            console.log(`[LIVE] Após play, liveVid rect: ${vr.width} x ${vr.height}`);
        }, 150);
    }
    dom.btnStop.disabled = false;
    dom.btnPP.disabled = false;
    if (dom.btnDesligar)
        dom.btnDesligar.style.display = 'inline-flex';
    const canvas = document.getElementById(`delayCanvas${slotId}`);
    if (canvas) {
        // Se houver delay configurado, o FrameDelayer já controla a visibilidade; não interfira.
        if (slot.delaySeconds <= 0) {
            canvas.style.display = 'none';
        }
    }
    updatePP();
    refreshTL();
}
/** Força o navegador a calcular a duração real de um WebM sem cues (MediaRecorder). */
function forceDuration(video) {
    return new Promise((resolve) => {
        if (isFinite(video.duration) && video.duration > 0) {
            resolve();
            return;
        }
        let done = false;
        const finish = () => { if (done)
            return; done = true; video.removeEventListener('durationchange', onDur); video.removeEventListener('timeupdate', onDur); resolve(); };
        const onDur = () => { if (isFinite(video.duration) && video.duration > 0)
            finish(); };
        video.addEventListener('durationchange', onDur);
        video.addEventListener('timeupdate', onDur);
        try {
            video.currentTime = 1e7;
        }
        catch {
            finish();
        }
        setTimeout(finish, 2000); // segurança: não trava se o evento não vier
    });
}
/** Posiciona o vídeo e espera o seek concluir (senão o play() volta pro início). */
function seekTo(video, time) {
    return new Promise((resolve) => {
        let done = false;
        const finish = () => { if (done)
            return; done = true; video.removeEventListener('seeked', finish); resolve(); };
        video.addEventListener('seeked', finish);
        try {
            video.currentTime = time;
        }
        catch {
            finish();
        }
        setTimeout(finish, 1000);
    });
}
async function goDVR(slot, seekSec) {
    console.log(`[DVR] Slot ${slot.id}: goDVR(bufSec=${slot.bufSec}, mode=${slot.mode}, seekSec=${seekSec})`);
    if (slot.bufSec === 0) {
        showToast('Nenhum vídeo gravado ainda.');
        return;
    }
    const replayVid = document.getElementById(`replayVid${slot.id}`);
    try {
        const useMse = (slot.recordMime || '').includes('mp4');
        console.log(`[DVR] Slot ${slot.id}: montando replay (${useMse ? 'MSE para MP4' : 'blob direto'})`);
        slot.mode = 'dvr';
        document.getElementById(`liveWrap${slot.id}`)?.classList.add('hidden');
        document.getElementById(`replayWrap${slot.id}`)?.classList.remove('hidden');
        document.getElementById(`bLive${slot.id}`)?.classList.add('dim');
        document.getElementById(`bDvr${slot.id}`)?.classList.add('show');
        let url;
        let sourceReady = Promise.resolve();
        if (slot.bufferMode === 'disk' || slot.bufferMode === 'disk-full') {
            // Modo disco: prefere MSE se possível, mas cai para Blob URL em caso de erro
            try {
                const source = await cam.prepareReplaySource(slot, seekSec);
                url = source.url;
                sourceReady = source.ready;
            }
            catch (e) {
                console.warn('[DVR] MSE falhou, usando Blob URL', e);
                url = await cam.prepareReplayBlobUrl(slot);
            }
        }
        else {
            // RAM: tenta MSE, senão Blob
            if (useMse) {
                try {
                    const source = await cam.prepareReplaySource(slot, seekSec);
                    url = source.url;
                    sourceReady = source.ready;
                }
                catch (e) {
                    console.warn('[DVR] MSE falhou, usando Blob URL', e);
                    url = await cam.prepareReplayBlobUrl(slot);
                }
            }
            else {
                url = await cam.prepareReplayBlobUrl(slot);
            }
        }
        if (replayVid) {
            // Sem áudio na gravação (audio:false). Mudo = a política de autoplay não
            // bloqueia o play() chamado após await (fora do gesto de clique), que era o
            // motivo de ficar pausado no ponto buscado.
            replayVid.muted = true;
            // Descarta a mídia da sessão de replay anterior ANTES de trocar o src. O
            // goLiveSlot() não mexe no replayVid, então readyState/duration/currentTime
            // sobrevivem ao retorno para o ao vivo; na segunda entrada em DVR o seek
            // acontecia contra os metadados velhos e a timeline deixava de corresponder
            // ao vídeo exibido.
            replayVid.pause();
            replayVid.removeAttribute('src');
            replayVid.load();
            // Registrado antes do src: com MSE o loadedmetadata pode disparar assim que
            // os segmentos são anexados, e o listener não pode perder o evento.
            const metadataReady = new Promise((resolve) => {
                const done = () => resolve();
                replayVid.addEventListener('loadedmetadata', done, { once: true });
                replayVid.addEventListener('error', done, { once: true });
                setTimeout(done, 5000); // segurança: não trava a UI se o evento não vier
            });
            replayVid.src = url;
            await sourceReady;
            await metadataReady;
            // WebM do MediaRecorder não tem duração/cues → duration=Infinity e o seek pausa
            // sozinho no ponto buscado. Força a varredura até o fim para o navegador calcular
            // a duração real e tornar o vídeo seekável.
            if (!isFinite(replayVid.duration) || replayVid.duration === 0)
                await forceDuration(replayVid);
            const dur = isFinite(replayVid.duration) && replayVid.duration > 0 ? replayVid.duration : slot.bufSec;
            const target = Math.min(Math.max(seekSec, 0), dur);
            await seekTo(replayVid, target);
            const seekEnd = replayVid.seekable.length ? replayVid.seekable.end(replayVid.seekable.length - 1) : -1;
            console.log(`[DVR-DIAG] pós-seek: alvo=${target.toFixed(2)} currentTime=${replayVid.currentTime.toFixed(2)} duration=${replayVid.duration} seekableEnd=${seekEnd} readyState=${replayVid.readyState} paused=${replayVid.paused}`);
            if (slot.wasPlaying) {
                try {
                    await replayVid.play();
                    console.log(`[DVR-DIAG] play OK: currentTime=${replayVid.currentTime.toFixed(2)} paused=${replayVid.paused}`);
                }
                catch (e) {
                    console.warn('[DVR-DIAG] play REJEITADO:', e?.name, e?.message);
                }
            }
            updatePP();
            refreshTL();
        }
    }
    catch (e) {
        console.error('[DVR] erro ao preparar replay:', e);
        showToast('Erro ao preparar replay.', true);
        goLiveSlot(slot.id);
    }
}
/* ── STOP / DESLIGAR / PLAY / PAUSE / TIMELINE / STATS / SALVAR (mantidos) ── */
function onStop() { const slot = cam.getActiveSlot(); if (slot.bufSec > 0) {
    showConfirm({ title: 'Salvar gravação?', message: 'Há vídeo no buffer. Deseja salvar antes de parar?', buttons: [{ label: '<i class="fas fa-floppy-disk"></i> Salvar', class: 'gold', callback: async () => { try {
                    await onSave();
                }
                catch (e) { } executeStop(); } }, { label: '<i class="fas fa-trash"></i> Descartar', callback: () => executeStop() }, { label: 'Cancelar', callback: () => { } }] });
    return;
} executeStop(); }
function onDesligar() { if (desligarEmAndamento)
    return; const slot = cam.getActiveSlot(); if (!slot.cameraOn)
    return; if (slot.bufSec > 0) {
    desligarEmAndamento = true;
    showConfirm({ title: 'Salvar gravação?', message: 'Há vídeo no buffer. Deseja salvar antes de desligar a câmera?', buttons: [{ label: '<i class="fas fa-floppy-disk"></i> Salvar', class: 'gold', callback: async () => { try {
                    await onSave();
                }
                catch (e) { } executeDesligar(); desligarEmAndamento = false; } }, { label: '<i class="fas fa-trash"></i> Descartar', callback: () => { executeDesligar(); desligarEmAndamento = false; } }, { label: 'Cancelar', callback: () => { desligarEmAndamento = false; } }] });
    return;
} executeDesligar(); }
function executeStop() { const slot = cam.getActiveSlot(); cam.stopRecorder(slot.id); if (slot.mode === 'dvr') {
    slot.wasPlaying = true;
    goLiveSlot(slot.id);
} cam.clearBuffer(slot); resetTimeline(); slot.mode = 'live'; dom.btnStop.disabled = true; dom.btnStart.disabled = false; updatePP(); if (dom.btnDesligar)
    dom.btnDesligar.style.display = 'inline-flex'; if (frameDelayers[slot.id]) {
    frameDelayers[slot.id].stop();
    frameDelayers[slot.id] = null;
} }
function executeDesligar() { const slot = cam.getActiveSlot(); cam.stopRecorder(slot.id); cam.stopCamera(slot.id); if (slot.videoElement)
    slot.videoElement.srcObject = null; const replayVid = document.getElementById(`replayVid${slot.id}`); if (replayVid) {
    replayVid.pause();
    replayVid.src = '';
} cam.clearBuffer(slot); slot.mode = 'idle'; if (dom.statusPill)
    dom.statusPill.innerHTML = '<i class="fas fa-circle-dot"></i> INATIVO'; dom.statusPill?.classList.remove('live'); document.getElementById(`bLive${slot.id}`)?.classList.remove('dim'); document.getElementById(`bDvr${slot.id}`)?.classList.remove('show'); document.getElementById(`liveWrap${slot.id}`)?.classList.remove('hidden'); document.getElementById(`replayWrap${slot.id}`)?.classList.add('hidden'); document.getElementById(`idleOv${slot.id}`)?.classList.remove('gone'); dom.btnStop.disabled = true; dom.btnStart.disabled = false; if (dom.btnDesligar)
    dom.btnDesligar.style.display = 'none'; updatePP(); stopStats(); resetTimeline(); if (frameDelayers[slot.id]) {
    frameDelayers[slot.id].stop();
    frameDelayers[slot.id] = null;
} }
function togglePP() {
    // Remove o delay de 200ms para resposta imediata
    const slot = cam.getActiveSlot();
    if (slot.mode === 'live') {
        const vid = slot.videoElement;
        if (!vid)
            return;
        if (vid.paused) {
            vid.play().catch(() => { });
            showFlash(true);
        }
        else {
            vid.pause();
            showFlash(false);
        }
    }
    else if (slot.mode === 'dvr') {
        const replayVid = document.getElementById(`replayVid${slot.id}`);
        if (!replayVid)
            return;
        if (replayVid.paused) {
            replayVid.play().catch(() => { });
            showFlash(true);
        }
        else {
            replayVid.pause();
            showFlash(false);
        }
    }
    updatePP();
}
function updatePP() { const slot = cam.getActiveSlot(); const paused = slot.mode === 'dvr' ? document.getElementById(`replayVid${slot.id}`)?.paused ?? true : (slot.videoElement?.paused ?? true); const icon = paused ? 'fa-play' : 'fa-pause'; const text = paused ? 'PLAY' : 'PAUSE'; if (dom.btnPP) {
    dom.btnPP.innerHTML = `<i class="fas ${icon}"></i> ${text}`;
    dom.btnPP.disabled = slot.mode === 'idle';
} if (dom.btnPP2) {
    dom.btnPP2.innerHTML = `<i class="fas ${icon}"></i>`;
    dom.btnPP2.disabled = slot.mode === 'idle';
} }
function setSpeed(rate) { const slot = cam.getActiveSlot(); if (slot.mode !== 'dvr') {
    showToast('Disponível apenas no modo DVR');
    return;
} const replayVid = document.getElementById(`replayVid${slot.id}`); if (replayVid)
    replayVid.playbackRate = rate; refreshSpeedButtons(); }
function refreshSpeedButtons() { const slot = cam.getActiveSlot(); const replayVid = document.getElementById(`replayVid${slot.id}`); const r = replayVid?.playbackRate ?? 1; const pairs = [[dom.s025, 0.25], [dom.s05, 0.5], [dom.s1, 1], [dom.s2, 2], [dom.s025_2, 0.25], [dom.s05_2, 0.5], [dom.s1_2, 1], [dom.s2_2, 2]]; pairs.forEach(([b, v]) => { if (b)
    b.classList.toggle('spd-on', r === v); }); }
/* ── TIMELINE ── */
/**
 * Faixa que a timeline representa. Único ponto de cálculo: refreshTL, endDrag e
 * applyDragVisual precisam concordar, senão o ponto clicado não corresponde ao
 * desenhado. Usa bufSecSmooth para o cursor não recuar a cada chunk.
 */
function timelineWindow(slot) {
    const total = cam.bufSecSmooth(slot);
    const isFull = slot.bufferMode === 'disk-full';
    return {
        bufStart: isFull ? 0 : Math.max(0, total - slot.maxBufSec),
        bufWindow: isFull ? total : Math.min(total, slot.maxBufSec),
    };
}
/* ── Preview da timeline (hover estilo YouTube) ── */
let previewEl = null;
let previewImg = null;
let previewTime = null;
/*
 * Montado em JS, e não no index.html, porque existem dois index.html divergentes
 * (raiz e dist/); criar aqui garante o mesmo comportamento seja qual for o servido.
 */
function buildPreview() {
    if (previewEl || !dom.tlBar)
        return;
    const style = document.createElement('style');
    style.textContent = `
.tl-preview { position: absolute; bottom: calc(100% + 34px); transform: translateX(-50%);
  background: rgba(0,0,0,.9); border: 1px solid rgba(255,255,255,.18); border-radius: 8px;
  padding: 4px; pointer-events: none; opacity: 0; transition: opacity .1s; z-index: 30;
  box-shadow: 0 6px 18px rgba(0,0,0,.45); }
.tl-preview.on { opacity: 1; }
.tl-preview img { display: block; width: 160px; height: auto; border-radius: 4px; background: #000; }
.tl-preview img[hidden] { display: none; }
.tl-preview .tl-preview-t { display: block; text-align: center; color: #fff;
  font-size: 12px; font-weight: 700; padding-top: 3px; }
`;
    document.head.appendChild(style);
    previewEl = document.createElement('div');
    previewEl.className = 'tl-preview';
    previewEl.innerHTML = '<img alt=""><span class="tl-preview-t"></span>';
    previewImg = previewEl.querySelector('img');
    previewTime = previewEl.querySelector('.tl-preview-t');
    dom.tlBar.appendChild(previewEl);
}
/** Mantém o balão dentro da barra: sem isto ele vaza da janela nas pontas. */
function clampPct(pct) {
    const barW = dom.tlBar?.getBoundingClientRect().width || 0;
    if (!barW)
        return pct * 100;
    const meia = 86; // metade da largura do balão (160px + bordas)
    const min = (meia / barW) * 100;
    return Math.min(Math.max(pct * 100, min), 100 - min);
}
let previewUrlAtual = null;
let previewPctPend = null;
let previewRaf = 0;
/**
 * Agenda o desenho para no máximo uma vez por quadro.
 *
 * mousemove dispara ~60x/s e o alvo é um i3 de 7ª geração: sem isto seriam 60
 * leituras de layout e 60 trocas de src por segundo, competindo com a gravação.
 */
function showPreviewAt(pct) {
    previewPctPend = pct;
    if (previewRaf)
        return;
    previewRaf = requestAnimationFrame(() => {
        previewRaf = 0;
        const p = previewPctPend;
        previewPctPend = null;
        if (p !== null)
            drawPreview(p);
    });
}
function drawPreview(pct) {
    const slot = cam.getActiveSlot();
    if (slot.mode === 'idle') {
        hidePreview();
        return;
    }
    buildPreview();
    if (!previewEl)
        return;
    const { bufStart, bufWindow } = timelineWindow(slot);
    const sec = bufStart + pct * bufWindow;
    const rotulo = formatTime(sec);
    // Tooltip nativo da barra, que antes só era atualizado durante o arrasto.
    if (dom.tlTip) {
        dom.tlTip.style.left = pct * 100 + '%';
        if (dom.tlTip.textContent !== rotulo)
            dom.tlTip.textContent = rotulo;
    }
    previewEl.style.left = clampPct(pct) + '%';
    if (previewTime && previewTime.textContent !== rotulo)
        previewTime.textContent = rotulo;
    // Trocar o src força uma decodificação do JPEG. Como as miniaturas são de 2 em 2
    // segundos, quadros de mouse vizinhos caem na mesma: só troca quando muda mesmo.
    const thumb = cam.nearestThumb(slot, sec);
    const url = thumb?.url ?? null;
    if (url !== previewUrlAtual && previewImg) {
        previewUrlAtual = url;
        if (url) {
            previewImg.src = url;
            previewImg.hidden = false;
        }
        else {
            previewImg.removeAttribute('src');
            previewImg.hidden = true;
        }
    }
    previewEl.classList.add('on');
}
function hidePreview() {
    if (previewRaf) {
        cancelAnimationFrame(previewRaf);
        previewRaf = 0;
    }
    previewPctPend = null;
    previewEl?.classList.remove('on');
}
function refreshTL() { const slot = cam.getActiveSlot(); const { bufStart, bufWindow } = timelineWindow(slot); let cur = 0; if (slot.mode === 'dvr') {
    const r = document.getElementById(`replayVid${slot.id}`);
    if (r && isFinite(r.currentTime)) {
        cur = bufStart + r.currentTime;
    }
}
else {
    cur = bufStart + bufWindow;
} const pct = bufWindow > 0 ? ((cur - bufStart) / bufWindow) * 100 : 0; if (dom.tlProg)
    dom.tlProg.style.width = pct + '%'; if (dom.tlThumb)
    dom.tlThumb.style.left = pct + '%'; if (!isDrag) {
    if (dom.tlCur)
        dom.tlCur.textContent = formatTime(cur);
    if (dom.tlTot)
        dom.tlTot.textContent = formatTime(bufStart + bufWindow);
} dom.tlLive?.classList.toggle('at-live', slot.mode === 'live' || cur >= bufStart + bufWindow - 0.5); }
function resetTimeline() { if (dom.tlProg)
    dom.tlProg.style.width = '0%'; if (dom.tlThumb)
    dom.tlThumb.style.left = '0%'; if (dom.tlCur)
    dom.tlCur.textContent = '0:00'; if (dom.tlTot)
    dom.tlTot.textContent = '0:00'; dom.tlLive?.classList.add('at-live'); }
function pctFromEvent(e) { const r = dom.tlBar.getBoundingClientRect(); const x = ('touches' in e ? (e.touches[0] ?? e.changedTouches[0])?.clientX : e.clientX) ?? 0; return Math.min(Math.max((x - r.left) / r.width, 0), 1); }
function applyDragVisual(pct) { const slot = cam.getActiveSlot(); const { bufStart, bufWindow } = timelineWindow(slot); const sec = bufStart + pct * bufWindow; showPreviewAt(pct); if (dom.tlProg)
    dom.tlProg.style.width = pct * 100 + '%'; if (dom.tlThumb)
    dom.tlThumb.style.left = pct * 100 + '%'; if (dom.tlTip)
    dom.tlTip.style.left = pct * 100 + '%'; if (dom.tlTip)
    dom.tlTip.textContent = formatTime(sec); if (dom.tlCur)
    dom.tlCur.textContent = formatTime(sec); }
function startDrag(e) { const slot = cam.getActiveSlot(); if (slot.mode === 'idle')
    return; isDrag = true; dom.tlBar?.classList.add('drag'); slot.wasPlaying = slot.mode === 'dvr' ? !document.getElementById(`replayVid${slot.id}`)?.paused : !slot.videoElement?.paused; if (slot.mode === 'dvr') {
    const replayVid = document.getElementById(`replayVid${slot.id}`);
    if (replayVid && !replayVid.paused)
        replayVid.pause();
}
else {
    if (slot.videoElement && !slot.videoElement.paused)
        slot.videoElement.pause();
} applyDragVisual(pctFromEvent(e)); window.addEventListener('mousemove', onDrag); window.addEventListener('touchmove', onDrag, { passive: true }); window.addEventListener('mouseup', endDrag); window.addEventListener('touchend', endDrag); }
function onDrag(e) { if (isDrag)
    applyDragVisual(pctFromEvent(e)); }
function endDrag(e) {
    if (!isDrag)
        return;
    isDrag = false;
    dom.tlBar?.classList.remove('drag');
    hidePreview();
    window.removeEventListener('mousemove', onDrag);
    window.removeEventListener('touchmove', onDrag);
    window.removeEventListener('mouseup', endDrag);
    window.removeEventListener('touchend', endDrag);
    const slot = cam.getActiveSlot();
    const pct = pctFromEvent(e);
    const { bufStart, bufWindow } = timelineWindow(slot);
    const sec = Math.min(Math.max(bufStart + pct * bufWindow, bufStart), bufStart + bufWindow);
    if (slot.mode === 'live') {
        slot.wasPlaying = true;
        const videoTime = sec - bufStart;
        goDVR(slot, videoTime);
        return;
    }
    // Modo DVR
    const replayVid = document.getElementById(`replayVid${slot.id}`);
    if (replayVid) {
        if (!isTimeInWindow(slot, sec)) {
            // Ponto fora da janela carregada: reconstruir MSE com nova janela
            // slot.wasPlaying já reflete se o vídeo estava tocando antes do arrasto
            goDVR(slot, sec - bufStart);
        }
        else {
            replayVid.currentTime = sec - bufStart;
            if (slot.wasPlaying)
                replayVid.play().catch(() => { });
        }
    }
    refreshTL();
}
function onLiveJump() { const slot = cam.getActiveSlot(); if (slot.mode === 'dvr') {
    slot.wasPlaying = true;
    goLiveSlot(slot.id);
} }
function showFlash(play) { const slot = cam.getActiveSlot(); const flashIco = document.getElementById(`flashIco${slot.id}`); if (flashIco) {
    flashIco.className = play ? 'fas fa-play' : 'fas fa-pause';
    flashIco.classList.remove('pop');
    void flashIco.offsetWidth;
    flashIco.classList.add('pop');
} }
/* ── STATS / SALVAR ── */
function startStats() { if (statsInterval)
    return; let fc = 0, lt = performance.now(); function raf(n) { if (!cam.getActiveSlot().stream)
    return; fc++; if (n - lt >= 1000) {
    state.fpsCount = fc;
    fc = 0;
    lt = n;
} requestAnimationFrame(raf); } requestAnimationFrame(raf); statsInterval = setInterval(() => { const slot = cam.getActiveSlot(); let ram = 'n/d'; if (performance.memory) {
    const u = Math.round(performance.memory.usedJSHeapSize / 1048576);
    const t = Math.round(performance.memory.jsHeapSizeLimit / 1048576);
    ram = `${u}/${t} MB`;
} const mb = (slot.bufBytes / 1048576).toFixed(1); const m = Math.floor(slot.bufSec / 60); const s = slot.bufSec % 60; const res = slot.videoElement ? `${slot.videoElement.videoWidth}×${slot.videoElement.videoHeight}` : '--'; if (dom.statsBar)
    dom.statsBar.innerHTML = `<span><i class="fas fa-chart-line"></i> FPS: ${state.fpsCount}</span><span>|</span><span><i class="fas fa-expand"></i> Res: ${res}</span><span>|</span><span><i class="fas fa-database"></i> Buffer: ${mb} MB</span><span>|</span><span><i class="fas fa-hourglass"></i> Gravado: ${m}:${String(s).padStart(2, '0')}</span><span>|</span><span><i class="fas fa-microchip"></i> RAM: ${ram}</span>`; }, 1000); }
function stopStats() { if (statsInterval)
    clearInterval(statsInterval); statsInterval = null; if (dom.statsBar)
    dom.statsBar.innerHTML = '<span><i class="fas fa-chart-line"></i> FPS: --</span><span>|</span><span><i class="fas fa-expand"></i> Res: --</span><span>|</span><span><i class="fas fa-database"></i> Buffer: 0 MB</span><span>|</span><span><i class="fas fa-hourglass"></i> Gravado: 0s</span><span>|</span><span><i class="fas fa-microchip"></i> RAM: --</span>'; }
function updateEstimate() { const slot = cam.getActiveSlot(); const { w, h, fps } = slot.camCfg; if (!w || !h || !fps || slot.bufSec === 0) {
    if (dom.sizeEst)
        dom.sizeEst.textContent = '-- MB';
    if (dom.ramWarn)
        dom.ramWarn.style.display = 'none';
    return;
} const mb = slot.bufBytes > 0 ? (slot.bufBytes / 1048576).toFixed(1) : (2 * slot.bufSec / 8).toFixed(1); const min = (slot.bufSec / 60).toFixed(1); if (dom.sizeEst)
    dom.sizeEst.textContent = `${mb} MB (${min} min)`; const mbNum = parseFloat(mb); const big = mbNum > 800; const hiRam = performance.memory ? mbNum > (performance.memory.jsHeapSizeLimit / 1048576) * 0.7 : false; if (dom.ramWarn) {
    dom.ramWarn.style.display = (big || hiRam) ? 'inline-flex' : 'none';
    dom.ramWarn.innerHTML = big ? '<i class="fas fa-triangle-exclamation"></i> &gt;800 MB' : '<i class="fas fa-triangle-exclamation"></i> RAM alta';
} }
async function restartCapture() { const slot = cam.getActiveSlot(); await cam.restartCapture(dom.camSel?.value || '', dom.resSel?.value || '', dom.fpsSel?.value || '', slot.videoElement, slot.id); await cam.populateCameraList(dom.camSel); if (slot.mode !== 'idle')
    goLiveSlot(slot.id); }
async function onSave() { const slot = cam.getActiveSlot(); let blob = null; if (slot.bufferMode === 'disk' || slot.bufferMode === 'disk-full') {
    if (slot.diskBuffer) {
        const url = await slot.diskBuffer.getUrl();
        if (url) {
            const response = await fetch(url);
            blob = await response.blob();
        }
    }
    if (!blob) {
        showToast('Nenhum dado no buffer.', true);
        return;
    }
}
else if (slot.bufferMode === 'ram') {
    if (!slot.chunks.length) {
        showToast('Nenhum dado no buffer.', true);
        return;
    }
    blob = new Blob(slot.chunks, { type: slot.recordMime || 'video/webm' });
} if (!blob) {
    showToast('Nenhum dado no buffer.', true);
    return;
} const ext = (slot.recordMime || '').includes('mp4') ? 'mp4' : 'webm'; const now = new Date(); const fn = `replay_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}h${String(now.getMinutes()).padStart(2, '0')}.${ext}`; const defaultFolder = getDefaultSaveFolder(); if (defaultFolder && isTauri()) {
    const fullPath = `${defaultFolder}/${fn}`;
    const success = await writeFileNative(fullPath, blob);
    if (success)
        showToast(`Replay salvo em: ${defaultFolder}`);
    else
        showToast('Erro ao salvar.', true);
}
else {
    const saved = await saveFileNative(blob, fn);
    if (saved)
        showToast('Replay salvo!');
    else
        showToast('Salvamento cancelado.');
} }
//# sourceMappingURL=ui.js.map