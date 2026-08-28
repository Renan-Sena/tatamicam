import { getState, setActiveSlot as setActive, getActiveSlot, stopCamera, stopRecorder, clearBuffer } from './camera.js';
import { loadConfig } from './storage.js';

const MAX_SLOTS = 4;
let currentSlots = 1;

export function initSlotsUI(): void {
    const addBtn = document.getElementById('btnAddCamera') as HTMLButtonElement | null;
    const container = document.getElementById('slotsContainer') as HTMLElement | null;
    if (!addBtn || !container) return;

    // Vincula o slot 0 ao elemento de vídeo que já existe no HTML
    const state = getState();
    if (state.slots[0]) {
        state.slots[0].videoElement = document.getElementById('liveVid0') as HTMLVideoElement;
    }

    updateGridClass();

    addBtn.addEventListener('click', () => {
        if (currentSlots >= MAX_SLOTS) return;
        createSlotElement(currentSlots);
        currentSlots++;
        updateGridClass();
        if (currentSlots >= MAX_SLOTS) addBtn.classList.add('hidden');
    });

    container.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.closest('.btn-close-slot')) {
            const slotDiv = target.closest('.camera-slot') as HTMLElement;
            if (!slotDiv || !slotDiv.dataset.slot) return;
            const slotId = parseInt(slotDiv.dataset.slot, 10);
            removeSlot(slotId);
            return;
        }
        if (target.closest('.btn-fullscreen-slot')) {
            const slotDiv = target.closest('.camera-slot') as HTMLElement;
            if (!slotDiv || !slotDiv.dataset.slot) return;
            const slotId = parseInt(slotDiv.dataset.slot, 10);
            setActiveSlot(slotId);
            requestFullscreenForSlot(slotId);
            return;
        }
        const slot = target.closest('.camera-slot') as HTMLElement | null;
        if (!slot || !slot.dataset.slot) return;
        const slotId = parseInt(slot.dataset.slot, 10);
        if (getState().activeSlot === slotId) return; // já é o slot ativo — não refaz o bind
        setActiveSlot(slotId);
    });

    container.addEventListener('dblclick', (e) => {
        const target = e.target as HTMLElement;
        const slot = target.closest('.camera-slot') as HTMLElement | null;
        if (!slot || !slot.dataset.slot) return;
        const slotId = parseInt(slot.dataset.slot, 10);
        window.dispatchEvent(new CustomEvent('slot-select-camera', { detail: { slotId } }));
    });
}

function createSlotElement(id: number): void {
    const container = document.getElementById('slotsContainer');
    if (!container) return;
    const slotDiv = document.createElement('div');
    slotDiv.className = 'stage-box camera-slot';
    slotDiv.id = `slot${id}`;
    slotDiv.dataset.slot = String(id);
    slotDiv.innerHTML = `
        <button class="btn-close-slot" title="Fechar câmera"><i class="fas fa-times"></i></button>
        <button class="btn-fullscreen-slot" title="Tela cheia"><i class="fas fa-expand"></i></button>
        <div class="v-wrap" id="liveWrap${id}">
            <video id="liveVid${id}" autoplay muted playsinline></video>
            <canvas id="delayCanvas${id}" style="display:none;"></canvas>
        </div>
        <div class="v-wrap hidden" id="replayWrap${id}">
            <video id="replayVid${id}" playsinline preload="auto"></video>
        </div>
        <div class="badge-live" id="bLive${id}"><span class="dot"></span> AO VIVO</div>
        <div class="badge-dvr" id="bDvr${id}"><i class="fas fa-clock-rotate-left"></i> DVR</div>
        <div class="idle-overlay" id="idleOv${id}">
            <i class="fas fa-video-slash"></i>
            <p>Câmera inativa</p>
        </div>
        <div class="flash" id="flash${id}"><i class="fas fa-play" id="flashIco${id}"></i></div>
        <div class="camera-label">Câmera ${id + 1}</div>
    `;
    container.appendChild(slotDiv);
    const state = getState();
    if (state.slots[id]) {
        state.slots[id].videoElement = document.getElementById(`liveVid${id}`) as HTMLVideoElement;

        // Herda configurações salvas
        const saved = loadConfig();
        if (saved.bufferMode) state.slots[id].bufferMode = saved.bufferMode as any;
        if (saved.bufMax) state.slots[id].maxBufSec = parseInt(saved.bufMax as string) * 60;
        if (saved.delay) state.slots[id].delaySeconds = parseInt(saved.delay as string);
        if (saved.resolution) {
            const [w, h] = (saved.resolution as string).split('x').map(Number);
            state.slots[id].camCfg.w = w || 1280;
            state.slots[id].camCfg.h = h || 720;
        }
        if (saved.fps) state.slots[id].camCfg.fps = saved.fps === 'auto' ? 30 : parseInt(saved.fps as string);
    }

    // Auto-seleciona e abre o seletor de câmera
    setActiveSlot(id);
    window.dispatchEvent(new CustomEvent('slot-select-camera', { detail: { slotId: id } }));
}

function removeSlot(slotId: number): void {
    if (currentSlots <= 1) return;
    const slotDiv = document.getElementById(`slot${slotId}`);
    if (slotDiv) slotDiv.remove();
    const slot = getState().slots[slotId];
    if (slot.cameraOn) {
        stopRecorder(slotId);
        stopCamera(slotId);
        clearBuffer(slot);
    }
    currentSlots--;
    updateGridClass();
    if (currentSlots < MAX_SLOTS) {
        const addBtn = document.getElementById('btnAddCamera');
        if (addBtn) addBtn.classList.remove('hidden');
    }
    if (getState().activeSlot === slotId) {
        setActiveSlot(0);
    }
}

function updateGridClass(): void {
    const container = document.getElementById('slotsContainer');
    if (!container) return;
    container.className = `slots-container cameras-${currentSlots}`;
}

export function setActiveSlot(slotId: number): void {
    document.querySelectorAll('.camera-slot').forEach(s => s.classList.remove('active-slot'));
    const activeEl = document.getElementById(`slot${slotId}`);
    if (activeEl) activeEl.classList.add('active-slot');
    setActive(slotId);
    window.dispatchEvent(new CustomEvent('slot-changed', { detail: { slotId } }));
}

function requestFullscreenForSlot(slotId: number): void {
    const el = document.getElementById(`slot${slotId}`);
    if (el && el.requestFullscreen) {
        el.requestFullscreen().catch(() => { });
    }
}