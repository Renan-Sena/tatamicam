import { isTauri } from './tauri.js';

const DEFAULT_API_BASE = 'http://localhost:3001';
const JWT_STORAGE_KEY = 'tatamicam_license_jwt';
const TOKEN_STORAGE_KEY = 'tatamicam_license_token';
const API_BASE_KEY = 'tatamicam_api_base';

// ⚠️ TEMPORÁRIO: autenticação por token DESATIVADA para rodar sem licença.
// Para REATIVAR a licença, basta trocar para: false
const LICENSE_DISABLED = true;

/** Endereço do backend de licença. Configurável (Configurações → Servidor de licença),
 *  pois nos notebooks dos árbitros "localhost" é o próprio notebook — precisa apontar
 *  para o IP do PC que roda o backend, ou para a nuvem. */
function apiBase(): string {
    try {
        const saved = localStorage.getItem(API_BASE_KEY);
        if (saved && saved.trim()) return saved.trim().replace(/\/+$/, '');
    } catch { /* ignore */ }
    return DEFAULT_API_BASE;
}

let cachedHwid: string | null = null;

interface ActivateResult {
    success: boolean;
    message: string;
    conflict?: boolean;
}

interface VerifyResult {
    valid: boolean;
    reason?: string;
    blocked?: boolean;
}

export async function getHwid(): Promise<string | null> {
    if (cachedHwid) return cachedHwid;
    if (!isTauri()) return null;
    try {
        cachedHwid = await (window as any).__TAURI__.core.invoke('get_hwid');
        return cachedHwid;
    } catch (e) {
        console.error('Erro ao obter HWID:', e);
        return null;
    }
}

export async function activateLicense(tokenCode: string, force = false): Promise<ActivateResult> {
    const hwid = await getHwid();
    if (!hwid) return { success: false, message: 'Não foi possível obter identificação do hardware.' };

    try {
        const res = await fetch(`${apiBase()}/activate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: tokenCode, hwid, force }),
        });
        const data = await res.json();

        if (res.ok && data.jwt) {
            localStorage.setItem(JWT_STORAGE_KEY, data.jwt);
            localStorage.setItem(TOKEN_STORAGE_KEY, tokenCode);
            return { success: true, message: 'Licença ativada com sucesso.' };
        }
        if (res.status === 409) {
            return { success: false, conflict: true, message: data.error || 'Token já está em uso em outra máquina.' };
        }
        return { success: false, message: data.error || 'Erro ao ativar licença.' };
    } catch (e) {
        return { success: false, message: 'Servidor de licenciamento indisponível.' };
    }
}

export async function verifyLicense(): Promise<VerifyResult> {
    if (LICENSE_DISABLED) return { valid: true };
    const jwt = localStorage.getItem(JWT_STORAGE_KEY);
    const tokenCode = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!jwt || !tokenCode) return { valid: false, blocked: true, reason: 'Nenhuma licença encontrada. Ative o produto.' };

    const hwid = await getHwid();
    if (!hwid) return { valid: false, blocked: true, reason: 'Não foi possível confirmar o hardware.' };

    const result = await (window as any).__TAURI__.core.invoke('verify_license_jwt', { jwt, expectedHwid: hwid });

    if (!result.valid) {
        try {
            const res = await fetch(`${apiBase()}/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: tokenCode, hwid }),
            });
            if (res.ok) {
                const data = await res.json();
                localStorage.setItem(JWT_STORAGE_KEY, data.jwt);
                return { valid: true };
            }
            const err = await res.json();
            return { valid: false, blocked: true, reason: err.error || 'Licença inválida.' };
        } catch {
            return { valid: false, blocked: true, reason: result.reason || 'Licença expirada e sem conexão.' };
        }
    }

    return { valid: true };
}

/**
 * Bate no servidor pra renovar/confirmar a licença, INDEPENDENTE do JWT
 * local ainda estar válido. Sem isso, o app só descobre uma revogação
 * quando o JWT expira sozinho (até 8 dias depois). Chame periodicamente
 * (ver setInterval em ui.ts) enquanto o app estiver online.
 *
 * Falha silenciosamente se estiver offline — o app segue com o JWT que
 * já tem, e o verifyLicense() local continua garantindo o offline puro.
 */
export async function heartbeatLicense(): Promise<void> {
    if (LICENSE_DISABLED) return;
    const tokenCode = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!tokenCode) return;
    const hwid = await getHwid();
    if (!hwid) return;

    try {
        const res = await fetch(`${apiBase()}/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: tokenCode, hwid }),
        });
        if (res.ok) {
            const data = await res.json();
            if (data.jwt) localStorage.setItem(JWT_STORAGE_KEY, data.jwt);
        }
        // Se o servidor responder com erro (ex: 403 = token revogado), não sobrescrevemos
        // o JWT local aqui — quem decide bloquear é sempre o verifyLicense(), que roda em
        // seguida no mesmo intervalo (ver ui.ts). O backend precisa checar revogação por
        // HWID/token a cada chamada de /verify, não só o "exp" do JWT.
    } catch {
        // Offline: sem problema, o app continua funcionando com o JWT já salvo.
    }
}

export function clearLicense(): void {
    localStorage.removeItem(JWT_STORAGE_KEY);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    cachedHwid = null;
}