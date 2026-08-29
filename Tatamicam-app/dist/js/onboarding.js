import { requestPermission, populateCameraList, getState } from './camera.js';
const TOTAL_STEPS = 4;
let currentStep = 0;
const ob = document.getElementById('onboarding');
const obTrack = document.getElementById('obTrack');
const obDots = document.querySelectorAll('.ob-dot');
const btnObBack = document.getElementById('btnObBack');
const btnObNext = document.getElementById('btnObNext');
const btnObSkip = document.getElementById('btnObSkip');
const btnGrant = document.getElementById('btnGrantPerm');
const permIcon = document.getElementById('permIcon');
const permDesc = document.getElementById('permDesc');
const permStat = document.getElementById('permStatus');
let initialized = false;
export function initOnboarding() {
    if (initialized)
        return;
    initialized = true;
    const drawer = document.getElementById('drawer');
    const drawerOverlay = document.getElementById('drawerOverlay');
    if (drawer)
        drawer.classList.remove('open');
    if (drawerOverlay)
        drawerOverlay.classList.remove('open');
    document.getElementById('settingsModalOverlay')?.classList.remove('open');
    goStep(0);
    btnObNext.addEventListener('click', onNext);
    btnObBack.addEventListener('click', onBack);
    btnObSkip.addEventListener('click', closeOnboarding);
    obDots.forEach(d => {
        d.addEventListener('click', () => goStep(parseInt(d.dataset.i)));
    });
    if (btnGrant) {
        btnGrant.addEventListener('click', onGrant);
    }
}
function onNext() {
    if (currentStep === TOTAL_STEPS - 1) {
        closeOnboarding();
        return;
    }
    goStep(currentStep + 1);
}
function onBack() {
    goStep(currentStep - 1);
}
async function onGrant() {
    if (!btnGrant)
        return;
    btnGrant.disabled = true;
    btnGrant.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Aguardando...';
    const ok = await requestPermission();
    if (ok) {
        await populateCameraList(document.getElementById('camSel'));
        syncPermUI();
    }
    else {
        if (permStat) {
            permStat.className = 'perm-status err';
            permStat.innerHTML = '<i class="fas fa-times-circle"></i> Permissão negada. Verifique as configurações do navegador.';
        }
        btnGrant.disabled = false;
        btnGrant.innerHTML = '<i class="fas fa-unlock"></i> Tentar novamente';
        btnObNext.disabled = false;
    }
}
function goStep(n) {
    currentStep = Math.min(Math.max(n, 0), TOTAL_STEPS - 1);
    obTrack.style.transform = `translateX(-${currentStep * 100}%)`;
    obDots.forEach((d, i) => d.classList.toggle('active', i === currentStep));
    btnObBack.disabled = currentStep === 0;
    const isLast = currentStep === TOTAL_STEPS - 1;
    btnObNext.innerHTML = isLast
        ? '<i class="fas fa-check"></i> Começar'
        : 'Próximo <i class="fas fa-chevron-right"></i>';
    if (currentStep === 1)
        syncPermUI();
    if (currentStep !== 1)
        btnObNext.disabled = false;
}
function syncPermUI() {
    const { permGranted } = getState();
    if (permGranted) {
        if (permIcon) {
            permIcon.style.color = '#4caf50';
            permIcon.className = 'fas fa-check-circle big';
        }
        if (permDesc)
            permDesc.textContent = 'Câmeras disponíveis! Você pode prosseguir.';
        if (btnGrant)
            btnGrant.disabled = true;
        if (permStat) {
            permStat.className = 'perm-status ok';
            permStat.innerHTML = '<i class="fas fa-check-circle"></i> Permissão concedida';
        }
        btnObNext.disabled = false;
    }
    else {
        if (permIcon) {
            permIcon.style.color = '';
            permIcon.className = 'fas fa-camera big';
        }
        if (permDesc)
            permDesc.textContent = 'Clique no botão abaixo e permita o acesso à câmera quando o navegador perguntar.';
        if (btnGrant)
            btnGrant.disabled = false;
        if (permStat)
            permStat.innerHTML = '';
        btnObNext.disabled = false;
    }
}
function closeOnboarding() {
    ob.style.transition = 'opacity .3s';
    ob.style.opacity = '0';
    setTimeout(() => {
        ob.style.display = 'none';
    }, 300);
}
//# sourceMappingURL=onboarding.js.map