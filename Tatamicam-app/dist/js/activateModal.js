import { activateLicense, verifyLicense } from './license.js';
let currentToken = '';
export function initActivateModal() {
    document.getElementById('activateModalClose')?.addEventListener('click', closeActivateModal);
    document.getElementById('activateModalOverlay')?.addEventListener('click', (e) => {
        if (e.target === document.getElementById('activateModalOverlay'))
            closeActivateModal();
    });
    document.getElementById('btnActivateToken')?.addEventListener('click', handleActivate);
}
export function openActivateModal() {
    const overlay = document.getElementById('activateModalOverlay');
    if (overlay) {
        overlay.style.display = 'flex';
        document.getElementById('tokenInput').value = '';
        document.getElementById('activateMsg').textContent = '';
        const existingTransferBtn = document.getElementById('btnTransfer');
        if (existingTransferBtn)
            existingTransferBtn.remove();
    }
}
function closeActivateModal() {
    const overlay = document.getElementById('activateModalOverlay');
    if (overlay)
        overlay.style.display = 'none';
    const jwt = localStorage.getItem('tatamicam_license_jwt');
    if (!jwt) {
        const blockOverlay = document.getElementById('licenseBlockOverlay');
        if (blockOverlay)
            blockOverlay.style.display = 'flex';
    }
    else {
        verifyLicense().then(result => {
            if (!result.valid) {
                const blockOverlay = document.getElementById('licenseBlockOverlay');
                if (blockOverlay)
                    blockOverlay.style.display = 'flex';
                document.getElementById('licenseBlockMsg').textContent = result.reason || 'Licença inválida.';
            }
        });
    }
}
async function handleActivate() {
    const input = document.getElementById('tokenInput');
    const msg = document.getElementById('activateMsg');
    const token = input.value.trim();
    currentToken = token;
    if (!token) {
        msg.textContent = 'Digite um token.';
        msg.style.color = 'var(--red)';
        return;
    }
    msg.textContent = 'Ativando...';
    msg.style.color = 'var(--navy)';
    const result = await activateLicense(token);
    if (result.success) {
        msg.textContent = '✅ ' + result.message;
        msg.style.color = '#2e7d32';
        const transferBtn = document.getElementById('btnTransfer');
        if (transferBtn)
            transferBtn.remove();
        setTimeout(closeActivateModal, 1500);
        const blockOverlay = document.getElementById('licenseBlockOverlay');
        if (blockOverlay)
            blockOverlay.style.display = 'none';
    }
    else if (result.conflict) {
        msg.textContent = result.message;
        msg.style.color = 'var(--red)';
        showTransferButton();
    }
    else {
        msg.textContent = '❌ ' + result.message;
        msg.style.color = 'var(--red)';
    }
}
function showTransferButton() {
    const oldBtn = document.getElementById('btnTransfer');
    if (oldBtn)
        oldBtn.remove();
    const transferBtn = document.createElement('button');
    transferBtn.id = 'btnTransfer';
    transferBtn.className = 'gold';
    transferBtn.style.cssText = 'width:100%; padding:10px; margin-top:8px;';
    transferBtn.innerHTML = '<i class="fas fa-exchange-alt"></i> Transferir para esta máquina';
    transferBtn.addEventListener('click', async () => {
        transferBtn.disabled = true;
        transferBtn.textContent = 'Transferindo...';
        const result = await activateLicense(currentToken, true);
        if (result.success) {
            document.getElementById('activateMsg').textContent = '✅ Licença transferida com sucesso!';
            document.getElementById('activateMsg').style.color = '#2e7d32';
            transferBtn.remove();
            setTimeout(closeActivateModal, 1500);
            const blockOverlay = document.getElementById('licenseBlockOverlay');
            if (blockOverlay)
                blockOverlay.style.display = 'none';
        }
        else {
            document.getElementById('activateMsg').textContent = '❌ Falha na transferência: ' + result.message;
            transferBtn.disabled = false;
            transferBtn.innerHTML = '<i class="fas fa-exchange-alt"></i> Transferir para esta máquina';
        }
    });
    document.getElementById('activateModal').querySelector('.modal-body').appendChild(transferBtn);
}
//# sourceMappingURL=activateModal.js.map