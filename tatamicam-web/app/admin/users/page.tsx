import { cookies } from 'next/headers';
import { apiFetch } from '@/lib/api';
import type { User } from '@/types';

export default async function UsersPage() {
    const cookieStore = await cookies();
    const authToken = cookieStore.get('auth-token')?.value;
    const users: User[] = await apiFetch('/admin/users', {
        headers: { Authorization: `Bearer ${authToken}` },
    });

    return (
        <div>
            <h1 className="text-3xl font-bold mb-6">Usuários</h1>
            <table className="w-full bg-white rounded shadow">
                <thead>
                    <tr className="bg-gray-100">
                        <th className="p-2 text-left">Nome</th>
                        <th className="p-2 text-left">E-mail</th>
                        <th className="p-2 text-left">Plano</th>
                        <th className="p-2 text-left">Tokens</th>
                    </tr>
                </thead>
                <tbody>
                    {users.map(user => (
                        <tr key={user.id} className="border-t">
                            <td className="p-2">{user.name}</td>
                            <td className="p-2">{user.email}</td>
                            <td className="p-2">{user.tokens?.[0]?.plan || '—'}</td>
                            <td className="p-2">{user.tokens?.length || 0}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}