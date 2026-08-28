import { populateCameraList, getState, startCamera, stopCamera, startRecorder, stopRecorder } from './camera.js';

let currentSlotId = 0;

export function initCameraSelector(): void {
    const closeBtn = document.getElementById('cameraSelectorClose');
    const overlay = document.getElementById('cameraSelectorOverlay');
    const applyBtn = document.getElementById('btnApplyCamera');
    const selectEl = document.getElementById('cameraDeviceSelect') as HTMLSelectElement;
    const label = document.getElementById('cameraSlotLabel');

    closeBtn?.addEventListener('click', closeSelector);
    overlay?.addEventListener('click', (e) => { if (e.target === overlay) closeSelector(); });

    applyBtn?.addEventListener('click', async () => {
        const deviceId = selectEl?.value;
        if (deviceId) {
            const slot = getState().slots[currentSlotId];
            slot.deviceId = deviceId;
            if (slot.cameraOn && slot.videoElement) {
                stopCamera(currentSlotId);
                stopRecorder(currentSlotId);
                await startCamera(deviceId, undefined, undefined, slot.videoElement, currentSlotId);
                await startRecorder(currentSlotId);
            }
        }
        closeSelector();
    });

    window.addEventListener('slot-select-camera', ((e: CustomEvent) => {
        currentSlotId = e.detail.slotId;
        if (label) label.textContent = `Câmera ${currentSlotId + 1}`;
        if (overlay) overlay.style.display = 'flex';
        if (selectEl) populateCameraList(selectEl);
    }) as EventListener);
}

function closeSelector(): void {
    const overlay = document.getElementById('cameraSelectorOverlay');
    if (overlay) overlay.style.display = 'none';
}