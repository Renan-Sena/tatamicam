export interface User {
    id: string;
    email: string;
    name: string;
    role: 'USER' | 'SUPERADMIN';
    tokens?: Token[];
}

export interface Token {
    id: string;
    code: string;
    plan: 'BASIC' | 'FEDERATION' | 'CONFEDERATION';
    status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
    currentMachine?: Machine | null;
    user?: User;
}

export interface Machine {
    id: string;
    hwid: string;
    label?: string;
}

export interface ActivationLog {
    id: string;
    tokenId: string;
    token?: Token;
    hwid: string;
    action: string;
    success: boolean;
    createdAt: string;
}