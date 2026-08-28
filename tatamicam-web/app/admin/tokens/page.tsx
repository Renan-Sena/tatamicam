import { cookies } from 'next/headers';
import { apiFetch } from '@/lib/api';
import { TokenTable } from '@/components/TokenTable';
import type { Token } from '@/types';

export default async function TokensPage() {
    const cookieStore = await cookies();
    const authToken = cookieStore.get('auth-token')?.value;
    const tokens: Token[] = await apiFetch('/admin/tokens', {
        headers: { Authorization: `Bearer ${authToken}` },
    });

    return (
        <div>
            <h1 className="text-3xl font-bold mb-6">Gerenciar Tokens</h1>
            <TokenTable tokens={tokens} />
        </div>
    );
}