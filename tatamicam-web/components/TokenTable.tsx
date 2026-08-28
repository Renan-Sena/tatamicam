'use client';
import { useState } from 'react';
import type { Token } from '@/types';

interface Props {
    tokens: Token[];
}

export function TokenTable({ tokens: initialTokens }: Props) {
    const [tokens, setTokens] = useState<Token[]>(initialTokens);

    async function revokeToken(id: string) {
        await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/tokens/${id}/revoke`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        });
        setTokens(prev => prev.map(t => t.id === id ? { ...t, status: 'REVOKED' as const } : t));
    }

    return (
        <table className="w-full bg-white rounded shadow">
            <thead>
                <tr className="bg-gray-100">
                    <th className="p-2 text-left">Código</th>
                    <th className="p-2 text-left">Plano</th>
                    <th className="p-2 text-left">Status</th>
                    <th className="p-2 text-left">Máquina</th>
                    <th className="p-2 text-left">Ações</th>
                </tr>
            </thead>
            <tbody>
                {tokens.map(token => (
                    <tr key={token.id} className="border-t">
                        <td className="p-2">{token.code}</td>
                        <td className="p-2">{token.plan}</td>
                        <td className="p-2">{token.status}</td>
                        <td className="p-2">{token.currentMachine?.hwid || '—'}</td>
                        <td className="p-2">
                            {token.status === 'ACTIVE' && (
                                <button
                                    onClick={() => revokeToken(token.id)}
                                    className="bg-red-600 text-white px-3 py-1 rounded"
                                >
                                    Revogar
                                </button>
                            )}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}