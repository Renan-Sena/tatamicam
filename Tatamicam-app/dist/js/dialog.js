export function showConfirm({ title, message, buttons, onClose }) {
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.innerHTML = `
        <div class="dialog-box">
            <h3>${title}</h3>
            <p>${message}</p>
            <div class="dialog-buttons"></div>
        </div>
    `;
    const btnContainer = overlay.querySelector('.dialog-buttons');
    buttons.forEach(btn => {
        const b = document.createElement('button');
        b.className = btn.class || '';
        b.innerHTML = btn.label;
        b.addEventListener('click', () => {
            if (btn.callback)
                btn.callback();
            close();
        });
        btnContainer.appendChild(b);
    });
    const close = () => {
        overlay.remove();
        if (onClose)
            onClose();
    };
    document.body.appendChild(overlay);
}
//# sourceMappingURL=dialog.js.map