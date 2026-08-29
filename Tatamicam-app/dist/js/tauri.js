let _isTauri;
export function isTauri() {
    if (_isTauri !== undefined)
        return _isTauri;
    _isTauri = typeof window !== 'undefined' &&
        (window.__TAURI__ !== undefined ||
            window.__TAURI_INTERNALS__ !== undefined);
    return _isTauri;
}
export async function saveFileNative(blob, defaultName) {
    if (isTauri()) {
        try {
            const tauri = window.__TAURI__;
            const { save } = tauri.dialog;
            const { writeFile } = tauri.fs;
            const filePath = await save({
                defaultPath: defaultName,
                filters: [{ name: 'Vídeo WebM', extensions: ['webm'] }]
            });
            if (filePath) {
                const arrayBuffer = await blob.arrayBuffer();
                const uint8Array = new Uint8Array(arrayBuffer);
                await writeFile(filePath, uint8Array);
                return true;
            }
            return false;
        }
        catch (e) {
            console.error('Tauri save error:', e);
            return false;
        }
    }
    else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = defaultName;
        a.click();
        URL.revokeObjectURL(url);
        return true;
    }
}
/**
 * Converte um caminho de arquivo local numa URL que o <video> consegue carregar
 * (protocolo asset:// do Tauri) — em vez de Blob URL.
 *
 * Por quê: no Linux (WebKitGTK), reproduzir um WebM a partir de uma Blob URL
 * falha com MEDIA_ERR_SRC_NOT_SUPPORTED, mesmo com os codecs instalados
 * (bug conhecido do WebKitGTK/Tauri). O protocolo asset:// serve o arquivo
 * como se fosse uma resposta HTTP de verdade, com Content-Type real, o que
 * contorna esse problema de detecção.
 *
 * Requer no tauri.conf.json:
 *   "app": { "security": {
 *     "assetProtocol": { "enable": true, "scope": ["$APPLOCALDATA/**"] },
 *     "csp": "... media-src 'self' asset: http://asset.localhost blob: mediastream:; ..."
 *   }}
 */
export function assetUrlFromPath(path) {
    const tauri = window.__TAURI__;
    return tauri.core.convertFileSrc(path);
}
let _appLocalDataDirCache = null;
export async function getAppLocalDataDir() {
    if (!isTauri())
        return null;
    if (_appLocalDataDirCache)
        return _appLocalDataDirCache;
    try {
        const tauri = window.__TAURI__;
        _appLocalDataDirCache = await tauri.path.appLocalDataDir();
        return _appLocalDataDirCache;
    }
    catch (e) {
        console.error('Erro ao obter appLocalDataDir:', e);
        return null;
    }
}
export async function writeFileNative(filePath, blob) {
    if (!isTauri())
        return false;
    try {
        const tauri = window.__TAURI__;
        const { writeFile } = tauri.fs;
        const arrayBuffer = await blob.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        await writeFile(filePath, uint8Array);
        return true;
    }
    catch (e) {
        console.error('writeFileNative error:', e);
        return false;
    }
}
//# sourceMappingURL=tauri.js.map