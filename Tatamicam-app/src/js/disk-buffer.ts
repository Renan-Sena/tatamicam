import { isTauri } from './tauri.js';
import { showToast } from './utils.js';
import { getDefaultBufferFolder } from './storage.js';

interface SegmentInfo {
    index: number;
    startTime: number; // em segundos relativos ao início do buffer
    endTime: number;
    filePath: string;
    byteSize: number;
}

export class DiskBuffer {
    maxSeconds: number;
    tempDir: string | null;
    segments: SegmentInfo[];
    isRecording: boolean;
    mimeType: string;
    private nextIndex: number;
    private writing: boolean;
    private pendingBlobs: Blob[] = [];
    private pendingStartTime: number = 0;
    private currentTime: number = 0; // tempo acumulado em segundos
    private segmentDuration = 6; // segundos por arquivo

    constructor(maxSeconds: number = 300, mimeType: string = 'video/webm') {
    this.maxSeconds = maxSeconds;
    this.tempDir = null;
    this.segments = [];
    this.isRecording = false;
    this.mimeType = mimeType;
    this.nextIndex = 0;
    this.writing = false;
    }

    async start(mimeType?: string): Promise<void> {
        if (mimeType) this.mimeType = mimeType;
        if (!isTauri()) return;
        if (!isTauri()) return;
        const tauri = (window as any).__TAURI__;
        const customDir = getDefaultBufferFolder();
        const baseDir = customDir || (await tauri.path.appLocalDataDir());
        this.tempDir = `${baseDir}/buffer_${Date.now()}`;
        await tauri.fs.mkdir(this.tempDir, { recursive: true });
        this.nextIndex = 0;
        this.segments = [];
        this.currentTime = 0;
        this.pendingBlobs = [];
        this.pendingStartTime = 0;
        this.isRecording = true;
        this.writing = false;
    }

    async addChunk(blob: Blob): Promise<void> {
        if (!this.isRecording || !this.tempDir) return;

        // Adiciona o chunk ao lote atual
        if (this.pendingBlobs.length === 0) {
            this.pendingStartTime = this.currentTime;
        }
        this.pendingBlobs.push(blob);
        this.currentTime += 1; // cada chunk do MediaRecorder é 1s (ainda)
        
        // Se atingiu a duração do segmento, grava o arquivo
        if (this.pendingBlobs.length >= this.segmentDuration) {
            await this._flushPendingSegment();
        }

        // Trim do buffer (modo circular)
        await this._trim();
    }

    async _flushPendingSegment(): Promise<void> {
        if (this.pendingBlobs.length === 0 || !this.tempDir) return;
        const blob = new Blob(this.pendingBlobs, { type: this.mimeType });
        const arrayBuffer = await blob.arrayBuffer();
        const uint8 = new Uint8Array(arrayBuffer);
        const idx = this.nextIndex++;
        const ext = this.mimeType.includes('mp4') ? 'mp4' : 'webm';
        const fileName = `${String(idx).padStart(6, '0')}.${ext}`;
        const filePath = `${this.tempDir}/${fileName}`;
        const tauri = (window as any).__TAURI__;
        await tauri.fs.writeFile(filePath, uint8);
        const seg: SegmentInfo = {
            index: idx,
            startTime: this.pendingStartTime,
            endTime: this.currentTime,
            filePath,
            byteSize: uint8.length,
        };
        this.segments.push(seg);
        this.pendingBlobs = [];
    }

    async _trim(): Promise<void> {
        if (!this.tempDir || this.maxSeconds === Infinity) return;
        const cutoff = this.currentTime - this.maxSeconds;
        const tauri = (window as any).__TAURI__;

        while (this.segments.length > 2 && this.segments[1].endTime < cutoff) {
            const old = this.segments.splice(1, 1)[0];
            if (old) {
                try {
                    await tauri.fs.remove(old.filePath);
                } catch (e) {
                    console.error('Erro ao remover segmento antigo:', e);
                }
            }
        }
    }

    /** Retorna os segmentos que cobrem o intervalo [startSec, endSec] */
    async getSegmentsBetween(startSec: number, endSec: number): Promise<Uint8Array[]> {
        if (!this.tempDir || this.segments.length === 0) return [];
        const tauri = (window as any).__TAURI__;
        const result: Uint8Array[] = [];
        // Inclui também os chunks pendentes ainda não gravados em disco?
        // Para simplificar, vamos buscar apenas os segmentos prontos.
        for (const seg of this.segments) {
            if (seg.endTime >= startSec && seg.startTime <= endSec) {
                try {
                    result.push(await tauri.fs.readFile(seg.filePath));
                } catch (e) {
                    console.error('Erro ao ler segmento:', e);
                }
            }
        }
        // Adiciona os blobs pendentes (se houver) que estão dentro do intervalo
        if (this.pendingBlobs.length > 0 && this.pendingStartTime <= endSec && this.currentTime >= startSec) {
            const pendingBlob = new Blob(this.pendingBlobs, { type: this.mimeType });	
            const arrayBuffer = await pendingBlob.arrayBuffer();
            result.push(new Uint8Array(arrayBuffer));
        }
        return result;
    }

    /** Retorna todos os segmentos (para fallback ou salvamento) */
    async getAllSegments(): Promise<Uint8Array[]> {
        return this.getSegmentsBetween(0, Number.MAX_SAFE_INTEGER);
    }

    async getUrl(): Promise<string | null> {
        const all = await this.getAllSegments();
        if (all.length === 0) return null;
        const combined = concatenate(all);
        const arrayBuffer = combined.buffer as ArrayBuffer;
        const blob = new Blob([arrayBuffer], { type: this.mimeType });
        return URL.createObjectURL(blob);
    }

    async stop(savePath: string | null = null): Promise<void> {
        this.isRecording = false;
        const tauri = (window as any).__TAURI__;
        if (this.pendingBlobs.length > 0) {
            await this._flushPendingSegment();
        }
        if (savePath) {
            const url = await this.getUrl();
            if (url) {
                const response = await fetch(url);
                const blob = await response.blob();
                const arrayBuffer = await blob.arrayBuffer();
                await tauri.fs.writeFile(savePath, new Uint8Array(arrayBuffer));
            }
        }
        if (this.tempDir) {
            const tauri = (window as any).__TAURI__;
            // Remove arquivos individuais primeiro (ignora erros de arquivos já deletados)
            for (const seg of this.segments) {
                try {
                    await tauri.fs.remove(seg.filePath);
                } catch (_) {
                    // arquivo pode já ter sido removido no trim ou estar sendo usado
                }
            }
            // Agora remove o diretório vazio
            try {
                await tauri.fs.removeDir(this.tempDir, { recursive: true });
            } catch (e) {
                showToast('Aviso: não foi possível limpar arquivos temporários do buffer.', true);
            }
        }
        this.tempDir = null;
        this.segments = [];
        this.pendingBlobs = [];
    }
}

function concatenate(arrays: Uint8Array[]): Uint8Array<ArrayBuffer> {
    let totalLength = 0;
    for (const arr of arrays) totalLength += arr.length;
    const result = new Uint8Array(totalLength); // tipo inferido Uint8Array<ArrayBuffer>
    let offset = 0;
    for (const arr of arrays) {
        result.set(arr, offset);
        offset += arr.length;
    }
    return result;
}

