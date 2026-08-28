export function formatTime(seconds: number): string {
    if (!isFinite(seconds) || seconds < 0) seconds = 0;
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
}

export function showToast(message: string, isError: boolean = false): void {
    const el = document.createElement('div');
    el.className = 'toast' + (isError ? ' err' : '');
    el.innerHTML = `<i class="fas fa-circle-info"></i> ${message}`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3600);
}