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

declare global { interface Performance { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number; }; } }

const state = cam.getState();
(window as any).__tatamiState = state;

let dom: Record<string, HTMLElement | null> = {};
let isDrag = false;
let statsInterval: ReturnType<typeof setInterval> | null = null;
const frameDelayers: (FrameDelayer | null)[] = [null, null, null, null];
const slotAbortControllers: (AbortController | null)[] = [null, null, null, null];
let desligarEmAndamento = false;
let clickTimer: ReturnType<typeof setTimeout> | null = null;
let zoomActive = false;
let zoomLevel = 1;
let zoomPanX = 0; // -0.5 a 0.5
let zoomPanY = 0;

export function initUI(elements: Record<string, HTMLElement | null>): void {
    dom = elements;
    bindEvents();
    requestAnimationFrame(tlLoop);
    initSettings();
    initActivateModal();
    (window as any).__updateUIElements = (newElements: Record<string, HTMLElement | null>) => { for (const key in newElements) { if (dom[key] !== undefined) dom[key] = newElements[key]; } };
    verifyLicense().then(result => { if (!result.valid) showLicenseBlock(result.reason || 'Licença inválida'); else hideLicenseBlock(); });
    if (dom.drawer) dom.drawer.classList.remove('open');
    if (dom.drawerOverlay) dom.drawerOverlay.classList.remove('open');
    if (dom.fullscreenControls) dom.fullscreenControls.classList.remove('show');
    const savedFolder = getDefaultSaveFolder(); if (savedFolder && dom.folderPathModal) dom.folderPathModal.textContent = savedFolder;
    const globalDelay = (document.getElementById('delaySlider') as HTMLInputElement); if (globalDelay) { const slot = cam.getActiveSlot(); globalDelay.value = String(slot.delaySeconds); if (dom.delayLbl) dom.delayLbl.textContent = `${slot.delaySeconds}s`; }
    setInterval(async () => { await heartbeatLicense(); const result = await verifyLicense(); if (!result.valid) showLicenseBlock(result.reason || 'Licença inválida.'); else hideLicenseBlock(); }, 4 * 60 * 60 * 1000);
    // Delay ajustado nas Configurações: aplica na hora se a câmera já estiver rodando.
    window.addEventListener('delay-changed', ((e: CustomEvent) => {
        const secs = (e.detail?.seconds as number) ?? 0;
        const slot = cam.getActiveSlot();
        if (frameDelayers[slot.id]) frameDelayers[slot.id]!.setDelay(secs);
    }) as EventListener);

    document.addEventListener('mousemove', () => {
    if (document.fullscreenElement) resetAutoHide();
    });

    document.addEventListener('keydown', (e) => {
        if (document.fullscreenElement) {
            resetAutoHide();
            // Atalhos de teclado (espaço, setas, etc.)
            handleFullscreenShortcuts(e);
        }
    });
}

function bindEvents(): void {
    (dom.btnStart as HTMLButtonElement)?.addEventListener('click', onStart);
    (dom.btnStop as HTMLButtonElement)?.addEventListener('click', onStop);
    (dom.btnDesligar as HTMLButtonElement)?.addEventListener('click', onDesligar);
    (dom.btnPP as HTMLButtonElement)?.addEventListener('click', togglePP);
    (dom.btnB5 as HTMLButtonElement)?.addEventListener('click', () => handleSeek(-5));
    (dom.btnF5 as HTMLButtonElement)?.addEventListener('click', () => handleSeek(5));
    (dom.btnSave as HTMLButtonElement)?.addEventListener('click', () => { if (cam.getActiveSlot().bufSec === 0) { showToast('Nenhum vídeo gravado ainda.'); return; } onSave(); });
    (dom.s025 as HTMLButtonElement)?.addEventListener('click', () => setSpeed(0.25));
    (dom.s05 as HTMLButtonElement)?.addEventListener('click', () => setSpeed(0.5));
    (dom.s1 as HTMLButtonElement)?.addEventListener('click', () => setSpeed(1));
    (dom.s2 as HTMLButtonElement)?.addEventListener('click', () => setSpeed(2));
    (dom.btnPP2 as HTMLButtonElement)?.addEventListener('click', togglePP);
    (dom.btnB5_2 as HTMLButtonElement)?.addEventListener('click', () => handleSeek(-5));
    (dom.btnF5_2 as HTMLButtonElement)?.addEventListener('click', () => handleSeek(5));
    (dom.btnSave2 as HTMLButtonElement)?.addEventListener('click', () => { if (cam.getActiveSlot().bufSec === 0) { showToast('Nenhum vídeo gravado ainda.'); return; } onSave(); });
    (dom.s025_2 as HTMLButtonElement)?.addEventListener('click', () => setSpeed(0.25));
    (dom.s05_2 as HTMLButtonElement)?.addEventListener('click', () => setSpeed(0.5));
    (dom.s1_2 as HTMLButtonElement)?.addEventListener('click', () => setSpeed(1));
    (dom.s2_2 as HTMLButtonElement)?.addEventListener('click', () => setSpeed(2));
    (dom.btnExitFullscreen as HTMLButtonElement)?.addEventListener('click', () => { if (document.fullscreenElement) document.exitFullscreen(); });
    (dom.btnPrevSlot as HTMLButtonElement)?.addEventListener('click', () => changeFullscreenSlot(-1));
    (dom.btnNextSlot as HTMLButtonElement)?.addEventListener('click', () => changeFullscreenSlot(1));
    (dom.tlBar as HTMLElement)?.addEventListener('mousedown', startDrag);
    (dom.tlBar as HTMLElement)?.addEventListener('touchstart', startDrag, { passive: true });
    (dom.tlBar as HTMLElement)?.addEventListener('click', onTimelineClick);
    (dom.tlLive as HTMLButtonElement)?.addEventListener('click', onLiveJump);
    bindActiveSlotVideoEvents(0);
    (dom.bufSlider as HTMLInputElement)?.addEventListener('input', e => { const v = parseInt((e.target as HTMLInputElement).value, 10); if (dom.bufLbl) dom.bufLbl.textContent = `${v} min`; cam.setMaxBufSec(v * 60); updateEstimate(); });
    (dom.delaySlider as HTMLInputElement)?.addEventListener('input', e => { const v = parseInt((e.target as HTMLInputElement).value, 10); const active = cam.getActiveSlot(); active.delaySeconds = v; if (dom.delayLbl) dom.delayLbl.textContent = `${v}s`; if (frameDelayers[active.id] && active.cameraOn) frameDelayers[active.id]!.setDelay(v); });
    (dom.resSel as HTMLSelectElement)?.addEventListener('change', () => restartCapture());
    (dom.fpsSel as HTMLSelectElement)?.addEventListener('change', () => restartCapture());
    (dom.camSel as HTMLSelectElement)?.addEventListener('change', () => { if (cam.getActiveSlot().stream) restartCapture(); });
    (dom.btnRefresh as HTMLButtonElement)?.addEventListener('click', () => cam.populateCameraList(dom.camSel as HTMLSelectElement));
    (dom.btnHamburger as HTMLButtonElement)?.addEventListener('click', toggleDrawer);
    (dom.drawerClose as HTMLButtonElement)?.addEventListener('click', closeDrawer);
    (dom.drawerOverlay as HTMLElement)?.addEventListener('click', closeDrawer);
    (dom.menuFullscreen as HTMLButtonElement)?.addEventListener('click', () => { toggleFullscreen(); closeDrawer(); });
    (dom.menuHelp as HTMLButtonElement)?.addEventListener('click', () => { closeDrawer(); const ob = document.getElementById('onboarding'); if (ob) { ob.style.display = 'flex'; ob.style.opacity = '1'; } });
    (dom.menuActivateToken as HTMLButtonElement)?.addEventListener('click', () => { closeDrawer(); openActivateModal(); });
    (dom.btnFullscreen as HTMLButtonElement)?.addEventListener('click', toggleFullscreen);
    (dom.btnZoom as HTMLButtonElement)?.addEventListener('click', toggleZoom);

    // Zoom com roda do mouse
document.addEventListener('wheel', (e) => {
    if (!zoomActive) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.2 : 0.2;
    setZoomLevel(zoomLevel + delta);
}, { passive: false });

// Zoom com teclado
document.addEventListener('keydown', (e) => {
    if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        toggleZoom();
    } else if (zoomActive) {
        if (e.key === '+' || e.key === '=') {
            e.preventDefault();
            setZoomLevel(zoomLevel + 0.2);
        } else if (e.key === '-') {
            e.preventDefault();
            setZoomLevel(zoomLevel - 0.2);
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            zoomPanX = Math.max(-0.5, zoomPanX - 0.1);
            applyZoom();
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            zoomPanX = Math.min(0.5, zoomPanX + 0.1);
            applyZoom();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            zoomPanY = Math.max(-0.5, zoomPanY - 0.1);
            applyZoom();
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            zoomPanY = Math.min(0.5, zoomPanY + 0.1);
            applyZoom();
        }
    }
});

    document.addEventListener('fullscreenchange', updateFullscreenUI);
    const btnBlockActivate = document.getElementById('btnBlockActivate'); if (btnBlockActivate) btnBlockActivate.addEventListener('click', () => { hideLicenseBlock(); openActivateModal(); });
    const btnBlockBuy = document.getElementById('btnBlockBuy'); if (btnBlockBuy) btnBlockBuy.addEventListener('click', () => window.open('https://tatamicam.com/comprar', '_blank'));
    const btnBlockExit = document.getElementById('btnBlockExit'); if (btnBlockExit) btnBlockExit.addEventListener('click', () => { if (isTauri()) (window as any).__TAURI__.process.exit(0); else window.close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && dom.drawer?.classList.contains('open')) closeDrawer(); });
    if (navigator.mediaDevices && typeof navigator.mediaDevices.addEventListener === 'function') {
        navigator.mediaDevices.addEventListener('devicechange', () => { cam.populateCameraList(dom.camSel as HTMLSelectElement); showToast('Dispositivos alterados.'); });
    }
    window.addEventListener('beforeunload', e => { const hasUnsaved = cam.getState().slots.some(slot => slot.bufSec > 0); if (hasUnsaved) { e.preventDefault(); e.returnValue = 'Há vídeo não salvo em pelo menos uma câmera.'; } });
    window.addEventListener('slot-changed', ((e: CustomEvent) => {
        const newSlotId = e.detail.slotId;
        const newSlot = state.slots[newSlotId];
        const newElements: Record<string, HTMLElement | null> = { liveVid: newSlot.videoElement, replayVid: document.getElementById(`replayVid${newSlotId}`), liveWrap: document.getElementById(`liveWrap${newSlotId}`), replayWrap: document.getElementById(`replayWrap${newSlotId}`), bLive: document.getElementById(`bLive${newSlotId}`), bDvr: document.getElementById(`bDvr${newSlotId}`), idleOv: document.getElementById(`idleOv${newSlotId}`), flashIco: document.getElementById(`flashIco${newSlotId}`), delayCanvas: document.getElementById(`delayCanvas${newSlotId}`) };
        (window as any).__updateUIElements(newElements);
        bindActiveSlotVideoEvents(newSlotId);
        refreshTL();
        updatePP();
    }) as EventListener);
}

function bindActiveSlotVideoEvents(slotId: number): void {
    const slot = state.slots[slotId]; if (!slot || !slot.videoElement) return;
    slotAbortControllers[slotId]?.abort(); const controller = new AbortController(); slotAbortControllers[slotId] = controller; const { signal } = controller;
    const vid = slot.videoElement; const replayVid = document.getElementById(`replayVid${slotId}`) as HTMLVideoElement;
    vid.addEventListener('click', togglePP, { signal }); vid.addEventListener('play', updatePP, { signal }); vid.addEventListener('pause', updatePP, { signal });
    replayVid?.addEventListener('click', togglePP, { signal }); replayVid?.addEventListener('play', updatePP, { signal }); replayVid?.addEventListener('pause', updatePP, { signal });
    replayVid?.addEventListener('timeupdate', () => { if (!isDrag) refreshTL(); }, { signal });
    vid.addEventListener('mousedown', startPan);
    replayVid?.addEventListener('mousedown', startPan);
    // Ao chegar no fim, NÃO volta pro ao vivo sozinho: segura no último frame (fica no
    // modo replay pro árbitro rever/scrubar). O nudge para trás tira do estado "ended"
    // (que fazia o play reiniciar do zero).
    replayVid?.addEventListener('ended', () => {
        replayVid.pause();
        if (isFinite(replayVid.duration) && replayVid.duration > 0.15) replayVid.currentTime = replayVid.duration - 0.1;
        updatePP();
    }, { signal });
    replayVid?.addEventListener('ratechange', refreshSpeedButtons, { signal });
    replayVid?.addEventListener('waiting', () => console.log(`[VIDEO] Slot ${slotId}: waiting`), { signal });
    replayVid?.addEventListener('stalled', () => console.log(`[VIDEO] Slot ${slotId}: stalled`), { signal });
}

/* ── Bloqueio de licença ── */
function showLicenseBlock(reason: string): void { const overlay = document.getElementById('licenseBlockOverlay'); const msg = document.getElementById('licenseBlockMsg'); if (overlay) { overlay.style.display = 'flex'; if (msg) msg.textContent = reason; } }
function hideLicenseBlock(): void { const overlay = document.getElementById('licenseBlockOverlay'); if (overlay) overlay.style.display = 'none'; }

/* ── LOOP PRINCIPAL ── */
function tlLoop(): void { const slot = cam.getActiveSlot(); if (slot.mode === 'live' && !isDrag) refreshTL(); requestAnimationFrame(tlLoop); }

/* ── SEEK ── */
function handleSeek(delta: number): void {
    console.log(`[SEEK] delta=${delta}`);
    const slot = cam.getActiveSlot();
    if (slot.mode === 'idle') { showToast('Câmera não iniciada.'); return; }
    const isFull = slot.bufferMode === 'disk-full';
    const bufWindow = isFull ? slot.bufSec : Math.min(slot.bufSec, slot.maxBufSec);
    const bufStart = isFull ? 0 : Math.max(0, slot.bufSec - slot.maxBufSec);
    if (slot.mode === 'live') {
        slot.wasPlaying = true;
        const newPos = Math.min(Math.max(slot.bufSec + delta, bufStart), bufStart + bufWindow);
        goDVR(slot, newPos - bufStart);
        return;
    }
    // Modo DVR
    const replayVid = document.getElementById(`replayVid${slot.id}`) as HTMLVideoElement;
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

function seekOffset(delta: number): void { const slot = cam.getActiveSlot(); if (slot.mode !== 'dvr') return; const replayVid = document.getElementById(`replayVid${slot.id}`) as HTMLVideoElement; if (!replayVid || !isFinite(replayVid.duration) || replayVid.duration === 0) { showToast('Vídeo de replay indisponível.', true); return; } replayVid.currentTime = Math.min(Math.max(replayVid.currentTime + delta, 0), replayVid.duration); refreshTL(); }

/* ── DRAWER / FULLSCREEN (mantidos) ── */
function toggleDrawer(): void { dom.drawer?.classList.toggle('open'); dom.drawerOverlay?.classList.toggle('open'); }
function closeDrawer(): void { dom.drawer?.classList.remove('open'); dom.drawerOverlay?.classList.remove('open'); }

function toggleFullscreen(): void {
    const stage = document.querySelector('.stage');
    if (!stage) {
        showToast('Elemento não encontrado.', true);
        return;
    }
    if (!document.fullscreenElement) {
        stage.requestFullscreen().catch(() => showToast('Tela cheia indisponível', true));
    } else {
        document.exitFullscreen();
    }
}

function isTimeInWindow(slot: cam.CameraSlot, time: number): boolean {
    if (!slot.dvrFeed) return false;
    return time >= slot.dvrFeed.windowStart && time <= slot.dvrFeed.windowEnd;
}

function applyZoom(): void {
    const slot = cam.getActiveSlot();
    const video = slot.mode === 'dvr'
        ? document.getElementById(`replayVid${slot.id}`) as HTMLVideoElement
        : slot.videoElement;
    if (!video) return;

    if (zoomActive && zoomLevel > 1) {
        video.style.transformOrigin = `${50 + zoomPanX * 100}% ${50 + zoomPanY * 100}%`;
        video.style.transform = `scale(${zoomLevel})`;
        video.style.cursor = 'grab';
    } else {
        video.style.transform = '';
        video.style.transformOrigin = '';
        video.style.cursor = 'pointer';
    }
}

function setZoomLevel(level: number): void {
    zoomLevel = Math.min(Math.max(level, 1), 5); // entre 1x e 5x
    applyZoom();
    showToast(`Zoom: ${zoomLevel.toFixed(1)}x`);
}

function toggleZoom(): void {
    zoomActive = !zoomActive;
    if (!zoomActive) {
        zoomLevel = 1;
        zoomPanX = 0;
        zoomPanY = 0;
    }
    applyZoom();
    showToast(zoomActive ? 'Zoom ativado' : 'Zoom desativado');
}

function updateFullscreenUI(): void {
    const stage = document.querySelector('.stage');
    const fs = document.getElementById('fullscreenControls');
    const ctrl = document.getElementById('ctrlBar');
    const btn = document.getElementById('btnFullscreen');
    
    if (document.fullscreenElement) {
        stage?.classList.add('fullscreen-active');
        if (fs) {
            fs.classList.add('show');
        }
        if (ctrl) ctrl.style.display = 'none';
        if (btn) btn.querySelector('i')!.className = 'fas fa-compress';
        // Auto-hide desativado por enquanto
        // startAutoHide();
    } else {
        stage?.classList.remove('fullscreen-active');
        if (fs) fs.classList.remove('show');
        if (ctrl) ctrl.style.display = '';
        if (btn) btn.querySelector('i')!.className = 'fas fa-expand';
        // stopAutoHide();
    }
}

let isPanning = false;
let panStartX = 0;
let panStartY = 0;

function startPan(e: MouseEvent): void {
    if (!zoomActive) return;
    isPanning = true;
    panStartX = e.clientX;
    panStartY = e.clientY;
    document.addEventListener('mousemove', onPan);
    document.addEventListener('mouseup', endPan);
}

function onPan(e: MouseEvent): void {
    if (!isPanning) return;
    const dx = (e.clientX - panStartX) / window.innerWidth;
    const dy = (e.clientY - panStartY) / window.innerHeight;
    zoomPanX = Math.min(0.5, Math.max(-0.5, zoomPanX + dx));
    zoomPanY = Math.min(0.5, Math.max(-0.5, zoomPanY + dy));
    panStartX = e.clientX;
    panStartY = e.clientY;
    applyZoom();
}

function endPan(): void {
    isPanning = false;
    document.removeEventListener('mousemove', onPan);
    document.removeEventListener('mouseup', endPan);
}

function moveTimelineToFullscreenControls(): void {
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

function restoreTimelineFromFullscreenControls(): void {
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

function handleFullscreenShortcuts(e: KeyboardEvent): void {
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
            if (document.fullscreenElement) document.exitFullscreen();
            break;
    }
}

function changeFullscreenSlot(direction: number): void { const totalSlots = document.querySelectorAll('.camera-slot').length; if (totalSlots <= 1) return; let next = state.activeSlot + direction; if (next < 0) next = totalSlots - 1; if (next >= totalSlots) next = 0; setActiveSlot(next); updateUIForActiveSlot(next); }
function updateUIForActiveSlot(slotId: number): void { const newElements = { liveVid: document.getElementById(`liveVid${slotId}`), replayVid: document.getElementById(`replayVid${slotId}`), liveWrap: document.getElementById(`liveWrap${slotId}`), replayWrap: document.getElementById(`replayWrap${slotId}`), bLive: document.getElementById(`bLive${slotId}`), bDvr: document.getElementById(`bDvr${slotId}`), idleOv: document.getElementById(`idleOv${slotId}`), flashIco: document.getElementById(`flashIco${slotId}`), delayCanvas: document.getElementById(`delayCanvas${slotId}`) }; (window as any).__updateUIElements(newElements); refreshTL(); }

let autoHideTimer: ReturnType<typeof setTimeout> | null = null;

function startAutoHide(): void {
    const fs = document.getElementById('fullscreenControls');
    if (!fs) return;
    // Remove qualquer timer existente
    if (autoHideTimer) clearTimeout(autoHideTimer);
    // Esconde após 3s
    autoHideTimer = setTimeout(() => {
        fs.classList.add('hide');
    }, 3000);
}

function stopAutoHide(): void {
    if (autoHideTimer) {
        clearTimeout(autoHideTimer);
        autoHideTimer = null;
    }
    const fs = document.getElementById('fullscreenControls');
    if (fs) fs.classList.remove('hide');
}

function resetAutoHide(): void {
    stopAutoHide();
    startAutoHide();
}

/* ── ONSTART ── */
async function onStart(): Promise<void> {
    console.log('[START] onStart chamado');
    (dom.btnStart as HTMLButtonElement).disabled = true; const slot = cam.getActiveSlot(); if (!slot.videoElement) { showToast('Elemento de vídeo não encontrado para este slot.', true); (dom.btnStart as HTMLButtonElement).disabled = false; return; }
    try {
        if (slot.cameraOn && slot.stream) {
            slot.mode = 'live';
            // Recria o FrameDelayer se o Parar o zerou, senão o delay some ao reiniciar.
            if (!frameDelayers[slot.id]) frameDelayers[slot.id] = new FrameDelayer(slot.videoElement, document.getElementById(`delayCanvas${slot.id}`) as HTMLCanvasElement, slot.delaySeconds);
            else frameDelayers[slot.id]!.setDelay(slot.delaySeconds);
            frameDelayers[slot.id]!.start();
            await cam.startRecorder(slot.id);
            goLiveSlot(slot.id);
            return;
        }
        const devId = slot.deviceId || (dom.camSel as HTMLSelectElement)?.value || undefined;
        await cam.startCamera(devId, (dom.resSel as HTMLSelectElement)?.value, (dom.fpsSel as HTMLSelectElement)?.value, slot.videoElement, slot.id);
        slot.mode = 'live'; await cam.startRecorder(slot.id); await cam.populateCameraList(dom.camSel as HTMLSelectElement); startStats();
        if (!frameDelayers[slot.id]) frameDelayers[slot.id] = new FrameDelayer(slot.videoElement, document.getElementById(`delayCanvas${slot.id}`) as HTMLCanvasElement, slot.delaySeconds);
        else frameDelayers[slot.id]!.setDelay(slot.delaySeconds);
        frameDelayers[slot.id]!.start(); goLiveSlot(slot.id);
    } catch (err) { showToast(err instanceof Error ? err.message : 'Erro desconhecido', true); }
    (dom.btnStart as HTMLButtonElement).disabled = false;
}

function goLiveSlot(slotId: number): void {
    console.log(`[LIVE] Slot ${slotId}: voltando ao vivo. mode anterior=${state.slots[slotId].mode}`);
    const slot = state.slots[slotId];
    cam.stopDvrFeed(slot);
    slot.mode = 'live';

    const liveWrap = document.getElementById(`liveWrap${slotId}`);
    const replayWrap = document.getElementById(`replayWrap${slotId}`);
    const liveVid = document.getElementById(`liveVid${slotId}`) as HTMLVideoElement;
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
    if (replayWrap) replayWrap.classList.add('hidden');

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

    (dom.btnStop as HTMLButtonElement).disabled = false;
    (dom.btnPP as HTMLButtonElement).disabled = false;
    if (dom.btnDesligar) dom.btnDesligar.style.display = 'inline-flex';
    const canvas = document.getElementById(`delayCanvas${slotId}`) as HTMLCanvasElement;
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
function forceDuration(video: HTMLVideoElement): Promise<void> {
    return new Promise<void>((resolve) => {
        if (isFinite(video.duration) && video.duration > 0) { resolve(); return; }
        let done = false;
        const finish = () => { if (done) return; done = true; video.removeEventListener('durationchange', onDur); video.removeEventListener('timeupdate', onDur); resolve(); };
        const onDur = () => { if (isFinite(video.duration) && video.duration > 0) finish(); };
        video.addEventListener('durationchange', onDur);
        video.addEventListener('timeupdate', onDur);
        try { video.currentTime = 1e7; } catch { finish(); }
        setTimeout(finish, 2000); // segurança: não trava se o evento não vier
    });
}

/** Posiciona o vídeo e espera o seek concluir (senão o play() volta pro início). */
function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
    return new Promise<void>((resolve) => {
        let done = false;
        const finish = () => { if (done) return; done = true; video.removeEventListener('seeked', finish); resolve(); };
        video.addEventListener('seeked', finish);
        try { video.currentTime = time; } catch { finish(); }
        setTimeout(finish, 1000);
    });
}

async function goDVR(slot: cam.CameraSlot, seekSec: number): Promise<void> {
    console.log(`[DVR] Slot ${slot.id}: goDVR(bufSec=${slot.bufSec}, mode=${slot.mode}, seekSec=${seekSec})`);
    if (slot.bufSec === 0) { showToast('Nenhum vídeo gravado ainda.'); return; }
    const replayVid = document.getElementById(`replayVid${slot.id}`) as HTMLVideoElement;

    try {
        const useMse = (slot.recordMime || '').includes('mp4');
        console.log(`[DVR] Slot ${slot.id}: montando replay (${useMse ? 'MSE para MP4' : 'blob direto'})`);
        slot.mode = 'dvr';
        document.getElementById(`liveWrap${slot.id}`)?.classList.add('hidden'); document.getElementById(`replayWrap${slot.id}`)?.classList.remove('hidden');
        document.getElementById(`bLive${slot.id}`)?.classList.add('dim'); document.getElementById(`bDvr${slot.id}`)?.classList.add('show');

        let url: string;
let sourceReady: Promise<void> = Promise.resolve();

if (slot.bufferMode === 'disk' || slot.bufferMode === 'disk-full') {
    // Modo disco: prefere MSE se possível, mas cai para Blob URL em caso de erro
    try {
        const source = await cam.prepareReplaySource(slot, seekSec);
        url = source.url;
        sourceReady = source.ready;
    } catch (e) {
        console.warn('[DVR] MSE falhou, usando Blob URL', e);
        url = await cam.prepareReplayBlobUrl(slot);
    }
} else {
    // RAM: tenta MSE, senão Blob
    if (useMse) {
        try {
            const source = await cam.prepareReplaySource(slot, seekSec);
            url = source.url;
            sourceReady = source.ready;
        } catch (e) {
            console.warn('[DVR] MSE falhou, usando Blob URL', e);
            url = await cam.prepareReplayBlobUrl(slot);
        }
    } else {
        url = await cam.prepareReplayBlobUrl(slot);
    }
}
        if (replayVid) {
            // Sem áudio na gravação (audio:false). Mudo = a política de autoplay não
            // bloqueia o play() chamado após await (fora do gesto de clique), que era o
            // motivo de ficar pausado no ponto buscado.
            replayVid.muted = true;
            replayVid.src = url;
            await sourceReady;
            await new Promise<void>((resolve) => {
                if (replayVid.readyState >= 1) { resolve(); return; }
                const done = () => resolve();
                replayVid.addEventListener('loadedmetadata', done, { once: true });
                replayVid.addEventListener('error', done, { once: true });
            });
            // WebM do MediaRecorder não tem duração/cues → duration=Infinity e o seek pausa
            // sozinho no ponto buscado. Força a varredura até o fim para o navegador calcular
            // a duração real e tornar o vídeo seekável.
            if (!isFinite(replayVid.duration) || replayVid.duration === 0) await forceDuration(replayVid);
            const dur = isFinite(replayVid.duration) && replayVid.duration > 0 ? replayVid.duration : slot.bufSec;
            const target = Math.min(Math.max(seekSec, 0), dur);
            await seekTo(replayVid, target);
            const seekEnd = replayVid.seekable.length ? replayVid.seekable.end(replayVid.seekable.length - 1) : -1;
            console.log(`[DVR-DIAG] pós-seek: alvo=${target.toFixed(2)} currentTime=${replayVid.currentTime.toFixed(2)} duration=${replayVid.duration} seekableEnd=${seekEnd} readyState=${replayVid.readyState} paused=${replayVid.paused}`);
            if (slot.wasPlaying) {
                try {
                    await replayVid.play();
                    console.log(`[DVR-DIAG] play OK: currentTime=${replayVid.currentTime.toFixed(2)} paused=${replayVid.paused}`);
                } catch (e) {
                    console.warn('[DVR-DIAG] play REJEITADO:', (e as Error)?.name, (e as Error)?.message);
                }
            }
            updatePP(); refreshTL();
        }
    } catch (e) { console.error('[DVR] erro ao preparar replay:', e); showToast('Erro ao preparar replay.', true); goLiveSlot(slot.id); }
}

/* ── STOP / DESLIGAR / PLAY / PAUSE / TIMELINE / STATS / SALVAR (mantidos) ── */
function onStop(): void { const slot = cam.getActiveSlot(); if (slot.bufSec > 0) { showConfirm({ title: 'Salvar gravação?', message: 'Há vídeo no buffer. Deseja salvar antes de parar?', buttons: [{ label: '<i class="fas fa-floppy-disk"></i> Salvar', class: 'gold', callback: async () => { try { await onSave(); } catch (e) { } executeStop(); } }, { label: '<i class="fas fa-trash"></i> Descartar', callback: () => executeStop() }, { label: 'Cancelar', callback: () => { } }] }); return; } executeStop(); }
function onDesligar(): void { if (desligarEmAndamento) return; const slot = cam.getActiveSlot(); if (!slot.cameraOn) return; if (slot.bufSec > 0) { desligarEmAndamento = true; showConfirm({ title: 'Salvar gravação?', message: 'Há vídeo no buffer. Deseja salvar antes de desligar a câmera?', buttons: [{ label: '<i class="fas fa-floppy-disk"></i> Salvar', class: 'gold', callback: async () => { try { await onSave(); } catch (e) { } executeDesligar(); desligarEmAndamento = false; } }, { label: '<i class="fas fa-trash"></i> Descartar', callback: () => { executeDesligar(); desligarEmAndamento = false; } }, { label: 'Cancelar', callback: () => { desligarEmAndamento = false; } }] }); return; } executeDesligar(); }
function executeStop(): void { const slot = cam.getActiveSlot(); cam.stopRecorder(slot.id); if (slot.mode === 'dvr') { slot.wasPlaying = true; goLiveSlot(slot.id); } cam.clearBuffer(slot); resetTimeline(); slot.mode = 'live'; (dom.btnStop as HTMLButtonElement).disabled = true; (dom.btnStart as HTMLButtonElement).disabled = false; updatePP(); if (dom.btnDesligar) dom.btnDesligar.style.display = 'inline-flex'; if (frameDelayers[slot.id]) { frameDelayers[slot.id]!.stop(); frameDelayers[slot.id] = null; } }
function executeDesligar(): void { const slot = cam.getActiveSlot(); cam.stopRecorder(slot.id); cam.stopCamera(slot.id); if (slot.videoElement) slot.videoElement.srcObject = null; const replayVid = document.getElementById(`replayVid${slot.id}`) as HTMLVideoElement; if (replayVid) { replayVid.pause(); replayVid.src = ''; } cam.clearBuffer(slot); slot.mode = 'idle'; if (dom.statusPill) dom.statusPill.innerHTML = '<i class="fas fa-circle-dot"></i> INATIVO'; dom.statusPill?.classList.remove('live'); document.getElementById(`bLive${slot.id}`)?.classList.remove('dim'); document.getElementById(`bDvr${slot.id}`)?.classList.remove('show'); document.getElementById(`liveWrap${slot.id}`)?.classList.remove('hidden'); document.getElementById(`replayWrap${slot.id}`)?.classList.add('hidden'); document.getElementById(`idleOv${slot.id}`)?.classList.remove('gone'); (dom.btnStop as HTMLButtonElement).disabled = true; (dom.btnStart as HTMLButtonElement).disabled = false; if (dom.btnDesligar) dom.btnDesligar.style.display = 'none'; updatePP(); stopStats(); resetTimeline(); if (frameDelayers[slot.id]) { frameDelayers[slot.id]!.stop(); frameDelayers[slot.id] = null; } }

function togglePP(): void {
    // Remove o delay de 200ms para resposta imediata
    const slot = cam.getActiveSlot();
    if (slot.mode === 'live') {
        const vid = slot.videoElement;
        if (!vid) return;
        if (vid.paused) {
            vid.play().catch(() => { });
            showFlash(true);
        } else {
            vid.pause();
            showFlash(false);
        }
    } else if (slot.mode === 'dvr') {
        const replayVid = document.getElementById(`replayVid${slot.id}`) as HTMLVideoElement;
        if (!replayVid) return;
        if (replayVid.paused) {
            replayVid.play().catch(() => { });
            showFlash(true);
        } else {
            replayVid.pause();
            showFlash(false);
        }
    }
    updatePP();
}

function updatePP(): void { const slot = cam.getActiveSlot(); const paused = slot.mode === 'dvr' ? (document.getElementById(`replayVid${slot.id}`) as HTMLVideoElement)?.paused ?? true : (slot.videoElement?.paused ?? true); const icon = paused ? 'fa-play' : 'fa-pause'; const text = paused ? 'PLAY' : 'PAUSE'; if (dom.btnPP) { dom.btnPP.innerHTML = `<i class="fas ${icon}"></i> ${text}`; (dom.btnPP as HTMLButtonElement).disabled = slot.mode === 'idle'; } if (dom.btnPP2) { dom.btnPP2.innerHTML = `<i class="fas ${icon}"></i>`; (dom.btnPP2 as HTMLButtonElement).disabled = slot.mode === 'idle'; } }
function setSpeed(rate: number): void { const slot = cam.getActiveSlot(); if (slot.mode !== 'dvr') { showToast('Disponível apenas no modo DVR'); return; } const replayVid = document.getElementById(`replayVid${slot.id}`) as HTMLVideoElement; if (replayVid) replayVid.playbackRate = rate; refreshSpeedButtons(); }
function refreshSpeedButtons(): void { const slot = cam.getActiveSlot(); const replayVid = document.getElementById(`replayVid${slot.id}`) as HTMLVideoElement; const r = replayVid?.playbackRate ?? 1; const pairs: [HTMLElement | null, number][] = [[dom.s025, 0.25], [dom.s05, 0.5], [dom.s1, 1], [dom.s2, 2], [dom.s025_2, 0.25], [dom.s05_2, 0.5], [dom.s1_2, 1], [dom.s2_2, 2]]; pairs.forEach(([b, v]) => { if (b) b.classList.toggle('spd-on', r === v); }); }
/* ── TIMELINE ── */
function refreshTL(): void { const slot = cam.getActiveSlot(); const isFull = slot.bufferMode === 'disk-full'; const bufWindow = isFull ? slot.bufSec : Math.min(slot.bufSec, slot.maxBufSec); const bufStart = isFull ? 0 : Math.max(0, slot.bufSec - slot.maxBufSec); let cur = 0; if (slot.mode === 'dvr') { const r = document.getElementById(`replayVid${slot.id}`) as HTMLVideoElement; if (r && isFinite(r.currentTime)) { cur = bufStart + r.currentTime; } } else { cur = slot.bufSec; } const pct = bufWindow > 0 ? ((cur - bufStart) / bufWindow) * 100 : 0; if (dom.tlProg) dom.tlProg.style.width = pct + '%'; if (dom.tlThumb) dom.tlThumb.style.left = pct + '%'; if (!isDrag) { if (dom.tlCur) dom.tlCur.textContent = formatTime(cur); if (dom.tlTot) dom.tlTot.textContent = formatTime(bufStart + bufWindow); } dom.tlLive?.classList.toggle('at-live', slot.mode === 'live' || cur >= bufStart + bufWindow - 0.5); }
function resetTimeline(): void { if (dom.tlProg) dom.tlProg.style.width = '0%'; if (dom.tlThumb) dom.tlThumb.style.left = '0%'; if (dom.tlCur) dom.tlCur.textContent = '0:00'; if (dom.tlTot) dom.tlTot.textContent = '0:00'; dom.tlLive?.classList.add('at-live'); }
function pctFromEvent(e: MouseEvent | TouchEvent): number { const r = (dom.tlBar as HTMLElement).getBoundingClientRect(); const x = ('touches' in e ? e.touches[0]?.clientX : (e as MouseEvent).clientX) ?? 0; return Math.min(Math.max((x - r.left) / r.width, 0), 1); }
function applyDragVisual(pct: number): void { const slot = cam.getActiveSlot(); const isFull = slot.bufferMode === 'disk-full'; const bufWindow = isFull ? slot.bufSec : Math.min(slot.bufSec, slot.maxBufSec); const bufStart = isFull ? 0 : Math.max(0, slot.bufSec - slot.maxBufSec); const sec = bufStart + pct * bufWindow; if (dom.tlProg) dom.tlProg.style.width = pct * 100 + '%'; if (dom.tlThumb) dom.tlThumb.style.left = pct * 100 + '%'; if (dom.tlTip) dom.tlTip.style.left = pct * 100 + '%'; if (dom.tlTip) dom.tlTip.textContent = formatTime(sec); if (dom.tlCur) dom.tlCur.textContent = formatTime(sec); }
function startDrag(e: MouseEvent | TouchEvent): void { const slot = cam.getActiveSlot(); if (slot.mode === 'idle') return; isDrag = true; dom.tlBar?.classList.add('drag'); slot.wasPlaying = slot.mode === 'dvr' ? !(document.getElementById(`replayVid${slot.id}`) as HTMLVideoElement)?.paused : !slot.videoElement?.paused; if (slot.mode === 'dvr') { const replayVid = document.getElementById(`replayVid${slot.id}`) as HTMLVideoElement; if (replayVid && !replayVid.paused) replayVid.pause(); } else { if (slot.videoElement && !slot.videoElement.paused) slot.videoElement.pause(); } applyDragVisual(pctFromEvent(e)); window.addEventListener('mousemove', onDrag); window.addEventListener('touchmove', onDrag, { passive: true }); window.addEventListener('mouseup', endDrag); window.addEventListener('touchend', endDrag); }


function onDrag(e: MouseEvent | TouchEvent): void { if (isDrag) applyDragVisual(pctFromEvent(e)); }

function endDrag(e: MouseEvent | TouchEvent): void {
    if (!isDrag) return;
    isDrag = false;
    dom.tlBar?.classList.remove('drag');
    window.removeEventListener('mousemove', onDrag);
    window.removeEventListener('touchmove', onDrag);
    window.removeEventListener('mouseup', endDrag);
    window.removeEventListener('touchend', endDrag);

    const slot = cam.getActiveSlot();
    const pct = pctFromEvent(e);
    const isFull = slot.bufferMode === 'disk-full';
    const bufWindow = isFull ? slot.bufSec : Math.min(slot.bufSec, slot.maxBufSec);
    const bufStart = isFull ? 0 : Math.max(0, slot.bufSec - slot.maxBufSec);
    const sec = Math.min(Math.max(bufStart + pct * bufWindow, bufStart), bufStart + bufWindow);

    if (slot.mode === 'live') {
        slot.wasPlaying = true;
        const videoTime = sec - bufStart;
        goDVR(slot, videoTime);
        return;
    }

    // Modo DVR
    const replayVid = document.getElementById(`replayVid${slot.id}`) as HTMLVideoElement;
    if (replayVid) {
        if (!isTimeInWindow(slot, sec)) {
            // Ponto fora da janela carregada: reconstruir MSE com nova janela
            // slot.wasPlaying já reflete se o vídeo estava tocando antes do arrasto
            goDVR(slot, sec - bufStart);
        } else {
            replayVid.currentTime = sec - bufStart;
            if (slot.wasPlaying) replayVid.play().catch(() => { });
        }
    }
    refreshTL();
}

function onTimelineClick(e: MouseEvent): void { if (isDrag) return; const slot = cam.getActiveSlot(); if (slot.mode === 'idle') return; const pct = pctFromEvent(e); const isFull = slot.bufferMode === 'disk-full'; const bufWindow = isFull ? slot.bufSec : Math.min(slot.bufSec, slot.maxBufSec); const bufStart = isFull ? 0 : Math.max(0, slot.bufSec - slot.maxBufSec); const sec = Math.min(Math.max(bufStart + pct * bufWindow, bufStart), bufStart + bufWindow); if (slot.mode === 'live') { slot.wasPlaying = true; goDVR(slot, sec - bufStart); } else { const replayVid = document.getElementById(`replayVid${slot.id}`) as HTMLVideoElement; if (replayVid) { replayVid.currentTime = sec - bufStart; if (slot.wasPlaying) replayVid.play().catch(() => { }); } refreshTL(); } }
function onLiveJump(): void { const slot = cam.getActiveSlot(); if (slot.mode === 'dvr') { slot.wasPlaying = true; goLiveSlot(slot.id); } }
function showFlash(play: boolean): void { const slot = cam.getActiveSlot(); const flashIco = document.getElementById(`flashIco${slot.id}`); if (flashIco) { flashIco.className = play ? 'fas fa-play' : 'fas fa-pause'; flashIco.classList.remove('pop'); void (flashIco as HTMLElement).offsetWidth; flashIco.classList.add('pop'); } }

/* ── STATS / SALVAR ── */
function startStats(): void { if (statsInterval) return; let fc = 0, lt = performance.now(); function raf(n: number): void { if (!cam.getActiveSlot().stream) return; fc++; if (n - lt >= 1000) { state.fpsCount = fc; fc = 0; lt = n; } requestAnimationFrame(raf); } requestAnimationFrame(raf); statsInterval = setInterval(() => { const slot = cam.getActiveSlot(); let ram = 'n/d'; if (performance.memory) { const u = Math.round(performance.memory.usedJSHeapSize / 1048576); const t = Math.round(performance.memory.jsHeapSizeLimit / 1048576); ram = `${u}/${t} MB`; } const mb = (slot.bufBytes / 1048576).toFixed(1); const m = Math.floor(slot.bufSec / 60); const s = slot.bufSec % 60; const res = slot.videoElement ? `${slot.videoElement.videoWidth}×${slot.videoElement.videoHeight}` : '--'; if (dom.statsBar) dom.statsBar.innerHTML = `<span><i class="fas fa-chart-line"></i> FPS: ${state.fpsCount}</span><span>|</span><span><i class="fas fa-expand"></i> Res: ${res}</span><span>|</span><span><i class="fas fa-database"></i> Buffer: ${mb} MB</span><span>|</span><span><i class="fas fa-hourglass"></i> Gravado: ${m}:${String(s).padStart(2, '0')}</span><span>|</span><span><i class="fas fa-microchip"></i> RAM: ${ram}</span>`; }, 1000); }
function stopStats(): void { if (statsInterval) clearInterval(statsInterval); statsInterval = null; if (dom.statsBar) dom.statsBar.innerHTML = '<span><i class="fas fa-chart-line"></i> FPS: --</span><span>|</span><span><i class="fas fa-expand"></i> Res: --</span><span>|</span><span><i class="fas fa-database"></i> Buffer: 0 MB</span><span>|</span><span><i class="fas fa-hourglass"></i> Gravado: 0s</span><span>|</span><span><i class="fas fa-microchip"></i> RAM: --</span>'; }
function updateEstimate(): void { const slot = cam.getActiveSlot(); const { w, h, fps } = slot.camCfg; if (!w || !h || !fps || slot.bufSec === 0) { if (dom.sizeEst) dom.sizeEst.textContent = '-- MB'; if (dom.ramWarn) dom.ramWarn.style.display = 'none'; return; } const mb = slot.bufBytes > 0 ? (slot.bufBytes / 1048576).toFixed(1) : (2 * slot.bufSec / 8).toFixed(1); const min = (slot.bufSec / 60).toFixed(1); if (dom.sizeEst) dom.sizeEst.textContent = `${mb} MB (${min} min)`; const mbNum = parseFloat(mb); const big = mbNum > 800; const hiRam = performance.memory ? mbNum > (performance.memory.jsHeapSizeLimit / 1048576) * 0.7 : false; if (dom.ramWarn) { dom.ramWarn.style.display = (big || hiRam) ? 'inline-flex' : 'none'; dom.ramWarn.innerHTML = big ? '<i class="fas fa-triangle-exclamation"></i> &gt;800 MB' : '<i class="fas fa-triangle-exclamation"></i> RAM alta'; } }
async function restartCapture(): Promise<void> { const slot = cam.getActiveSlot(); await cam.restartCapture((dom.camSel as HTMLSelectElement)?.value || '', (dom.resSel as HTMLSelectElement)?.value || '', (dom.fpsSel as HTMLSelectElement)?.value || '', slot.videoElement!, slot.id); await cam.populateCameraList(dom.camSel as HTMLSelectElement); if (slot.mode !== 'idle') goLiveSlot(slot.id); }
async function onSave(): Promise<void> { const slot = cam.getActiveSlot(); let blob: Blob | null = null; if (slot.bufferMode === 'disk' || slot.bufferMode === 'disk-full') { if (slot.diskBuffer) { const url = await slot.diskBuffer.getUrl(); if (url) { const response = await fetch(url); blob = await response.blob(); } } if (!blob) { showToast('Nenhum dado no buffer.', true); return; } } else if (slot.bufferMode === 'ram') { if (!slot.chunks.length) { showToast('Nenhum dado no buffer.', true); return; } blob = new Blob(slot.chunks, { type: slot.recordMime || 'video/webm' }); } if (!blob) { showToast('Nenhum dado no buffer.', true); return; } const ext = (slot.recordMime || '').includes('mp4') ? 'mp4' : 'webm'; const now = new Date(); const fn = `replay_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}h${String(now.getMinutes()).padStart(2, '0')}.${ext}`; const defaultFolder = getDefaultSaveFolder(); if (defaultFolder && isTauri()) { const fullPath = `${defaultFolder}/${fn}`; const success = await writeFileNative(fullPath, blob); if (success) showToast(`Replay salvo em: ${defaultFolder}`); else showToast('Erro ao salvar.', true); } else { const saved = await saveFileNative(blob, fn); if (saved) showToast('Replay salvo!'); else showToast('Salvamento cancelado.'); } }
