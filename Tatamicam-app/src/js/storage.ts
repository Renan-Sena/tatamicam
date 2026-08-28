import { isTauri } from './tauri.js';

export function saveConfig(config: Record<string, unknown>): void {
    try { localStorage.setItem('tatamicam_config', JSON.stringify(config)); } catch (_) { }
}

export function loadConfig(): Record<string, unknown> {
    try {
        const v = localStorage.getItem('tatamicam_config');
        return v ? JSON.parse(v) : {};
    } catch (_) { return {}; }
}

export function getDefaultSaveFolder(): string | null {
    try { return localStorage.getItem('tatamicam_saveFolder'); } catch (_) { return null; }
}

export function setDefaultSaveFolder(path: string): void {
    try { localStorage.setItem('tatamicam_saveFolder', path); } catch (_) { }
}

export function clearDefaultSaveFolder(): void {
    try { localStorage.removeItem('tatamicam_saveFolder'); } catch (_) { }
}

export async function chooseFolder(): Promise<string | null> {
    if (!isTauri()) {
        alert('Escolha de pasta disponível apenas no aplicativo desktop.');
        return null;
    }
    try {
        const tauri = (window as any).__TAURI__;
        const { open } = tauri.dialog;
        const selected = await open({
            directory: true,
            multiple: false,
            title: 'Escolher pasta para salvar replays',
        });
        if (selected) {
            setDefaultSaveFolder(selected);
            return selected;
        }
        return null;
    } catch (e) {
        console.error('Error choosing folder:', e);
        return null;
    }
}

export function getDefaultBufferFolder(): string | null {
    try { return localStorage.getItem('tatamicam_bufferFolder'); } catch (_) { return null; }
}

export function setDefaultBufferFolder(path: string): void {
    try { localStorage.setItem('tatamicam_bufferFolder', path); } catch (_) { }
}

export function clearDefaultBufferFolder(): void {
    try { localStorage.removeItem('tatamicam_bufferFolder'); } catch (_) { }
}