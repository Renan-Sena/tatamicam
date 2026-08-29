import { isTauri } from './tauri.js';
export function saveConfig(config) {
    try {
        localStorage.setItem('tatamicam_config', JSON.stringify(config));
    }
    catch (_) { }
}
export function loadConfig() {
    try {
        const v = localStorage.getItem('tatamicam_config');
        return v ? JSON.parse(v) : {};
    }
    catch (_) {
        return {};
    }
}
export function getDefaultSaveFolder() {
    try {
        return localStorage.getItem('tatamicam_saveFolder');
    }
    catch (_) {
        return null;
    }
}
export function setDefaultSaveFolder(path) {
    try {
        localStorage.setItem('tatamicam_saveFolder', path);
    }
    catch (_) { }
}
export function clearDefaultSaveFolder() {
    try {
        localStorage.removeItem('tatamicam_saveFolder');
    }
    catch (_) { }
}
export async function chooseFolder() {
    if (!isTauri()) {
        alert('Escolha de pasta disponível apenas no aplicativo desktop.');
        return null;
    }
    try {
        const tauri = window.__TAURI__;
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
    }
    catch (e) {
        console.error('Error choosing folder:', e);
        return null;
    }
}
export function getDefaultBufferFolder() {
    try {
        return localStorage.getItem('tatamicam_bufferFolder');
    }
    catch (_) {
        return null;
    }
}
export function setDefaultBufferFolder(path) {
    try {
        localStorage.setItem('tatamicam_bufferFolder', path);
    }
    catch (_) { }
}
export function clearDefaultBufferFolder() {
    try {
        localStorage.removeItem('tatamicam_bufferFolder');
    }
    catch (_) { }
}
//# sourceMappingURL=storage.js.map