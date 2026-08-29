import { initOnboarding } from './onboarding.js';
import { initUI } from './ui.js';
import { populateCameraList } from './camera.js';
import { initSlotsUI } from './slots-ui.js';
import { initCameraSelector } from './camera-selector.js';
document.addEventListener('DOMContentLoaded', () => {
    const elements = {
        liveVid: document.getElementById('liveVid0'),
        replayVid: document.getElementById('replayVid0'),
        liveWrap: document.getElementById('liveWrap0'),
        replayWrap: document.getElementById('replayWrap0'),
        bLive: document.getElementById('bLive0'),
        bDvr: document.getElementById('bDvr0'),
        idleOv: document.getElementById('idleOv0'),
        flashIco: document.getElementById('flashIco0'),
        delayCanvas: document.getElementById('delayCanvas0'),
        statusPill: document.getElementById('statusPill'),
        tlBar: document.getElementById('tlBar'),
        tlProg: document.getElementById('tlProg'),
        tlThumb: document.getElementById('tlThumb'),
        tlTip: document.getElementById('tlTip'),
        tlCur: document.getElementById('tlCur'),
        tlTot: document.getElementById('tlTot'),
        tlLive: document.getElementById('tlLive'),
        btnStart: document.getElementById('btnStart'),
        btnStop: document.getElementById('btnStop'),
        btnDesligar: document.getElementById('btnDesligar'),
        btnPP: document.getElementById('btnPP'),
        btnB5: document.getElementById('btnB5'),
        btnF5: document.getElementById('btnF5'),
        btnSave: document.getElementById('btnSave'),
        s025: document.getElementById('s025'),
        s05: document.getElementById('s05'),
        s1: document.getElementById('s1'),
        s2: document.getElementById('s2'),
        camSel: document.getElementById('camSel'),
        btnRefresh: document.getElementById('btnRefresh'),
        bufSlider: document.getElementById('bufSlider'),
        bufLbl: document.getElementById('bufLbl'),
        delaySlider: document.getElementById('delaySlider'),
        delayLbl: document.getElementById('delayLbl'),
        resSel: document.getElementById('resSel'),
        fpsSel: document.getElementById('fpsSel'),
        sizeEst: document.getElementById('sizeEst'),
        ramWarn: document.getElementById('ramWarn'),
        statsBar: document.getElementById('statsBar'),
        resOk: document.getElementById('resOk'),
        fpsOk: document.getElementById('fpsOk'),
        countdownOverlay: document.getElementById('countdownOverlay'),
        countdownNumber: document.getElementById('countdownNumber'),
        btnHamburger: document.getElementById('btnHamburger'),
        drawer: document.getElementById('drawer'),
        drawerOverlay: document.getElementById('drawerOverlay'),
        drawerClose: document.getElementById('drawerClose'),
        menuFullscreen: document.getElementById('menuFullscreen'),
        menuHelp: document.getElementById('menuHelp'),
        folderPathModal: document.getElementById('folderPathModal'),
        menuActivateToken: document.getElementById('menuActivateToken'),
        activateModalOverlay: document.getElementById('activateModalOverlay'),
        activateModal: document.getElementById('activateModal'),
        activateModalClose: document.getElementById('activateModalClose'),
        tokenInput: document.getElementById('tokenInput'),
        btnActivateToken: document.getElementById('btnActivateToken'),
        activateMsg: document.getElementById('activateMsg'),
        btnFullscreen: document.getElementById('btnFullscreen'),
        fullscreenControls: document.getElementById('fullscreenControls'),
        btnPP2: document.getElementById('btnPP2'),
        btnB5_2: document.getElementById('btnB5_2'),
        btnF5_2: document.getElementById('btnF5_2'),
        btnSave2: document.getElementById('btnSave2'),
        s025_2: document.getElementById('s025_2'),
        s05_2: document.getElementById('s05_2'),
        s1_2: document.getElementById('s1_2'),
        s2_2: document.getElementById('s2_2'),
        btnExitFullscreen: document.getElementById('btnExitFullscreen'),
        btnPrevSlot: document.getElementById('btnPrevSlot'),
        btnNextSlot: document.getElementById('btnNextSlot'),
        licenseBlockOverlay: document.getElementById('licenseBlockOverlay'),
        licenseBlockMsg: document.getElementById('licenseBlockMsg'),
        btnBlockActivate: document.getElementById('btnBlockActivate'),
        btnBlockBuy: document.getElementById('btnBlockBuy'),
        btnBlockExit: document.getElementById('btnBlockExit'),
    };
    // Ordem correta: primeiro a UI dos slots, depois a lógica principal
    initSlotsUI();
    initCameraSelector();
    initUI(elements);
    initOnboarding();
    populateCameraList(elements.camSel);
    const settingsOverlay = document.getElementById('settingsModalOverlay');
    if (settingsOverlay)
        settingsOverlay.classList.remove('open');
    document.getElementById('btnHelp')?.addEventListener('click', () => {
        const ob = document.getElementById('onboarding');
        if (ob) {
            ob.style.display = 'flex';
            ob.style.opacity = '1';
        }
        const drawer = document.getElementById('drawer');
        const drawerOverlay = document.getElementById('drawerOverlay');
        if (drawer)
            drawer.classList.remove('open');
        if (drawerOverlay)
            drawerOverlay.classList.remove('open');
        if (settingsOverlay)
            settingsOverlay.classList.remove('open');
    });
    window.addEventListener('error', (event) => {
        console.error('[ERRO GLOBAL]', event.message, event.filename, event.lineno, event.colno, event.error);
    });
    window.addEventListener('unhandledrejection', (event) => {
        console.error('[PROMISE REJECTION]', event.reason);
    });
});
//# sourceMappingURL=main.js.map