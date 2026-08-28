// Delay ao vivo ("tape delay") leve: em vez de comprimir um JPEG por frame
// (encode + decode custosos, pesado no i3), guardamos ImageBitmaps em um ring
// buffer, com downscale — captura acelerada por GPU e quase sem custo de CPU.
// Memória limitada: ~targetFPS × delaySeconds frames pequenos, liberados ao vencer.

interface DelayFrame { bmp: ImageBitmap; timestamp: number; }

export class FrameDelayer {
    video: HTMLVideoElement;
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    delaySeconds: number;
    isRunning: boolean;
    animationId: number | null;
    frameBuffer: DelayFrame[];
    targetFPS: number;
    lastCaptureTime: number;
    captureWidth: number;    // largura de captura (downscale) — alivia CPU e RAM
    private capturing: boolean;
    private lastDrawn: DelayFrame | null;

    constructor(videoElement: HTMLVideoElement, canvasElement: HTMLCanvasElement, delaySeconds: number = 0) {
        this.video = videoElement;
        this.canvas = canvasElement;
        this.canvas.style.display = 'none';
        this.ctx = canvasElement.getContext('2d')!;
        this.delaySeconds = delaySeconds;
        this.isRunning = false;
        this.animationId = null;
        this.frameBuffer = [];
        this.targetFPS = 12;
        this.lastCaptureTime = 0;
        this.captureWidth = 480;
        this.capturing = false;
        this.lastDrawn = null;
    }

    start(): void {
        if (this.isRunning) return;
        this.isRunning = true;
        if (this.delaySeconds <= 0) {
            this.canvas.style.display = 'none';
            return;
        }
        // NÃO escondemos o vídeo: ele precisa continuar decodificando para a captura
        // funcionar. O canvas fica POR CIMA (z-index no CSS) cobrindo o ao vivo.
        this.canvas.style.display = 'block';
        this.frameBuffer = [];
        this.lastCaptureTime = 0;
        this.lastDrawn = null;
        this.animationId = requestAnimationFrame(this._loop.bind(this));
    }

    stop(): void {
        this.isRunning = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        this.frameBuffer.forEach(f => f.bmp.close());
        this.frameBuffer = [];
        this.lastDrawn = null;
        this.canvas.style.display = 'none';
    }

    setDelay(seconds: number): void {
        this.delaySeconds = seconds;
        if (this.isRunning) { this.stop(); this.start(); }
    }

    _loop(timestamp: number): void {
        if (!this.isRunning) return;
        const video = this.video;
        if (video.readyState >= 2 && video.videoWidth > 0) {
            const captureInterval = 1000 / this.targetFPS;
            if (timestamp - this.lastCaptureTime >= captureInterval) {
                this.lastCaptureTime = timestamp;
                this._captureFrame(timestamp);
            }
            // Descarta frames mais antigos que o atraso (mantém [0] ≈ delaySeconds atrás).
            const threshold = timestamp - this.delaySeconds * 1000;
            while (this.frameBuffer.length > 1 && this.frameBuffer[0].timestamp < threshold) {
                const old = this.frameBuffer.shift();
                old?.bmp.close();
            }
            // Só redesenha quando o frame a exibir realmente muda (evita 60 draws/s à toa).
            const oldest = this.frameBuffer[0];
            if (oldest && oldest !== this.lastDrawn) {
                this.lastDrawn = oldest;
                if (this.canvas.width !== oldest.bmp.width || this.canvas.height !== oldest.bmp.height) {
                    this.canvas.width = oldest.bmp.width;
                    this.canvas.height = oldest.bmp.height;
                }
                this.ctx.drawImage(oldest.bmp, 0, 0);
            }
        }
        this.animationId = requestAnimationFrame(this._loop.bind(this));
    }

    _captureFrame(timestamp: number): void {
        if (this.capturing) return; // evita acumular capturas assíncronas
        const vw = this.video.videoWidth;
        const vh = this.video.videoHeight;
        if (!vw || !vh) return;
        const w = Math.min(this.captureWidth, vw);
        const h = Math.round(w * (vh / vw));
        this.capturing = true;
        createImageBitmap(this.video, { resizeWidth: w, resizeHeight: h, resizeQuality: 'low' })
            .then(bmp => {
                if (!this.isRunning) { bmp.close(); return; }
                this.frameBuffer.push({ bmp, timestamp });
            })
            .catch(() => { /* frame perdido, sem problema */ })
            .finally(() => { this.capturing = false; });
    }
}
