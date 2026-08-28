import { getState, setBufferMode, setMaxBufSec } from './camera.js';
import {
    getDefaultSaveFolder, chooseFolder, clearDefaultSaveFolder, saveConfig, loadConfig,
    getDefaultBufferFolder, setDefaultBufferFolder, clearDefaultBufferFolder
} from './storage.js';
import { showToast } from './utils.js';

export function initSettings(): void {
    console.log('[SETTINGS] Inicializando módulo de configurações');
    const overlay = document.getElementById('settingsModalOverlay');
    if (overlay) overlay.style.display = 'none';

    restoreConfig();

    document.getElementById('menuConfig')?.addEventListener('click', openSettingsModal);
    document.getElementById('settingsModalClose')?.addEventListener('click', closeSettingsModal);
    overlay?.addEventListener('click', (e) => { if (e.target === overlay) closeSettingsModal(); });

    const bufSlider = document.getElementById('bufSlider') as HTMLInputElement | null;
    const delaySlider = document.getElementById('delaySlider') as HTMLInputElement | null;
    const resSel = document.getElementById('resSel') as HTMLSelectElement | null;
    const fpsSel = document.getElementById('fpsSel') as HTMLSelectElement | null;
    const bufModeSel = document.getElementById('bufferModeSel') as HTMLSelectElement | null;

    bufSlider?.addEventListener('input', e => {
        const v = parseInt((e.target as HTMLInputElement).value, 10);
        console.log(`[SETTINGS] Buffer máximo: ${v} min`);
        document.getElementById('bufLbl')!.textContent = `${v} min`;
        setMaxBufSec(v * 60);
        saveCurrentConfig();
    });
    delaySlider?.addEventListener('input', e => {
        const v = parseInt((e.target as HTMLInputElement).value, 10);
        console.log(`[SETTINGS] Delay: ${v}s`);
        document.getElementById('delayLbl')!.textContent = `${v}s`;
        getActiveSlot().delaySeconds = v;
        // aplica ao vivo (sem precisar reiniciar a câmera)
        window.dispatchEvent(new CustomEvent('delay-changed', { detail: { seconds: v } }));
        saveCurrentConfig();
    });
    resSel?.addEventListener('change', () => {
        console.log(`[SETTINGS] Resolução: ${(resSel as HTMLSelectElement).value}`);
        saveCurrentConfig();
    });
    fpsSel?.addEventListener('change', () => {
        console.log(`[SETTINGS] FPS: ${(fpsSel as HTMLSelectElement).value}`);
        saveCurrentConfig();
    });
    bufModeSel?.addEventListener('change', e => {
        const value = (e.target as HTMLSelectElement).value;
        console.log(`[SETTINGS] Modo buffer: ${value}`);
        setBufferMode(value);
        toggleBufferSlider(value);
        saveCurrentConfig();
        showToast(`Modo: ${value === 'ram' ? 'RAM' : value === 'disk' ? 'Disco Circular' : 'Disco Total'}`);
    });

    // Pasta de salvamento
    document.getElementById('btnChooseFolderModal')?.addEventListener('click', chooseAndSetSaveFolder);
    document.getElementById('btnClearFolderModal')?.addEventListener('click', clearAndSetSaveFolder);

    // NOVO: Pasta do buffer
    document.getElementById('btnChooseBufferFolder')?.addEventListener('click', chooseAndSetBufferFolder);
    document.getElementById('btnClearBufferFolder')?.addEventListener('click', clearAndSetBufferFolder);

    if (bufModeSel) {
        bufModeSel.value = getActiveSlot().bufferMode;
        toggleBufferSlider(bufModeSel.value);
    }

    // Endereço do servidor de licença (para apontar aos notebooks o IP do PC / nuvem).
    const apiBaseInput = document.getElementById('apiBaseInput') as HTMLInputElement | null;
    if (apiBaseInput) apiBaseInput.value = localStorage.getItem('tatamicam_api_base') || '';
    document.getElementById('btnSaveApiBase')?.addEventListener('click', () => {
        const v = (document.getElementById('apiBaseInput') as HTMLInputElement)?.value.trim();
        if (v) {
            localStorage.setItem('tatamicam_api_base', v.replace(/\/+$/, ''));
            showToast('Servidor de licença salvo.');
        } else {
            localStorage.removeItem('tatamicam_api_base');
            showToast('Servidor voltou ao padrão (localhost).');
        }
    });

    window.addEventListener('slot-changed', ((e: CustomEvent) => {
        const slotId = e.detail.slotId;
        const slot = getState().slots[slotId];
        console.log(`[SETTINGS] Slot alterado para ${slotId}, bufferMode=${slot.bufferMode}`);
        if (bufModeSel) bufModeSel.value = slot.bufferMode;
        if (bufSlider) bufSlider.value = String(slot.maxBufSec / 60);
        if (document.getElementById('bufLbl')) document.getElementById('bufLbl')!.textContent = `${slot.maxBufSec / 60} min`;
        if (delaySlider) delaySlider.value = String(slot.delaySeconds);
        if (document.getElementById('delayLbl')) document.getElementById('delayLbl')!.textContent = `${slot.delaySeconds}s`;
        if (resSel) resSel.value = `${slot.camCfg.w}x${slot.camCfg.h}`;
        if (fpsSel) fpsSel.value = String(slot.camCfg.fps);
        toggleBufferSlider(slot.bufferMode);
    }) as EventListener);
}

function openSettingsModal(): void {
    console.log('[SETTINGS] Abrindo modal de configurações');
    document.getElementById('drawer')?.classList.remove('open');
    document.getElementById('drawerOverlay')?.classList.remove('open');
    const overlay = document.getElementById('settingsModalOverlay');
    if (overlay) {
        overlay.style.display = 'flex';
        // Exibe pastas configuradas
        const savedSave = getDefaultSaveFolder();
        const folderSpan = document.getElementById('folderPathModal');
        if (folderSpan) folderSpan.textContent = savedSave || '';

        const savedBuffer = getDefaultBufferFolder();
        const bufferSpan = document.getElementById('bufferPath');
        if (bufferSpan) bufferSpan.textContent = savedBuffer || '';

        const bufModeSel = document.getElementById('bufferModeSel') as HTMLSelectElement | null;
        if (bufModeSel) {
            bufModeSel.disabled = getActiveSlot().cameraOn;
        }
    }
}

function closeSettingsModal(): void {
    console.log('[SETTINGS] Fechando modal');
    const overlay = document.getElementById('settingsModalOverlay');
    if (overlay) overlay.style.display = 'none';
}

function saveCurrentConfig(): void {
    const config = {
        bufMax: (document.getElementById('bufSlider') as HTMLInputElement)?.value,
        delay: (document.getElementById('delaySlider') as HTMLInputElement)?.value,
        resolution: (document.getElementById('resSel') as HTMLSelectElement)?.value,
        fps: (document.getElementById('fpsSel') as HTMLSelectElement)?.value,
        bufferMode: (document.getElementById('bufferModeSel') as HTMLSelectElement)?.value,
    };
    console.log('[SETTINGS] Salvando config', config);
    saveConfig(config);
}

function restoreConfig(): void {
    console.log('[SETTINGS] Restaurando configuração');
    const saved = loadConfig();
    if (saved.bufMax) {
        const s = document.getElementById('bufSlider') as HTMLInputElement | null;
        if (s) { s.value = saved.bufMax as string; document.getElementById('bufLbl')!.textContent = `${saved.bufMax} min`; setMaxBufSec(parseInt(saved.bufMax as string) * 60); }
    }
    if (saved.delay) {
        const d = document.getElementById('delaySlider') as HTMLInputElement | null;
        if (d) { d.value = saved.delay as string; document.getElementById('delayLbl')!.textContent = `${saved.delay}s`; getActiveSlot().delaySeconds = parseInt(saved.delay as string); }
    }
    if (saved.resolution) {
        const r = document.getElementById('resSel') as HTMLSelectElement | null;
        if (r) r.value = saved.resolution as string;
    }
    if (saved.fps) {
        const f = document.getElementById('fpsSel') as HTMLSelectElement | null;
        if (f) f.value = saved.fps as string;
    }
    if (saved.bufferMode) {
        const b = document.getElementById('bufferModeSel') as HTMLSelectElement | null;
        if (b) { b.value = saved.bufferMode as string; setBufferMode(saved.bufferMode as string); toggleBufferSlider(saved.bufferMode as string); }
    }
}

function toggleBufferSlider(mode: string): void {
    const group = document.getElementById('bufferMaxGroup');
    const slider = document.getElementById('bufSlider') as HTMLInputElement | null;
    if (group && slider) {
        // Agora ambos os modos disco usam gravação contínua – slider desabilitado
        if (mode === 'disk' || mode === 'disk-full') {
            group.style.opacity = '0.5';
            slider.disabled = true;
        } else {
            group.style.opacity = '1';
            slider.disabled = false;
        }
    }
}

async function chooseAndSetSaveFolder(): Promise<void> {
    console.log('[SETTINGS] Escolhendo pasta de salvamento...');
    const folder = await chooseFolder();
    if (folder) {
        const span = document.getElementById('folderPathModal');
        if (span) span.textContent = folder;
        showToast('Pasta de salvamento definida.');
        console.log('[SETTINGS] Pasta de salvamento:', folder);
    }
}

function clearAndSetSaveFolder(): void {
    console.log('[SETTINGS] Limpando pasta de salvamento');
    clearDefaultSaveFolder();
    const span = document.getElementById('folderPathModal');
    if (span) span.textContent = '';
    showToast('Pasta de salvamento removida.');
}

// NOVAS FUNÇÕES PARA BUFFER
async function chooseAndSetBufferFolder(): Promise<void> {
    console.log('[SETTINGS] Escolhendo pasta do buffer...');
    const folder = await chooseFolder();
    if (folder) {
        setDefaultBufferFolder(folder);
        const span = document.getElementById('bufferPath');
        if (span) span.textContent = folder;
        showToast('Pasta do buffer definida.');
        console.log('[SETTINGS] Pasta do buffer:', folder);
    }
}

function clearAndSetBufferFolder(): void {
    console.log('[SETTINGS] Limpando pasta do buffer');
    clearDefaultBufferFolder();
    const span = document.getElementById('bufferPath');
    if (span) span.textContent = '';
    showToast('Pasta do buffer removida.');
}

function getActiveSlot() {
    return getState().slots[getState().activeSlot];
}