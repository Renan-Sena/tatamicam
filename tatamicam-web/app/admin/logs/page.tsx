import { cookies } from 'next/headers';
import { apiFetch } from '@/lib/api';
import type { ActivationLog } from '@/types';

export default async function LogsPage() {
    const cookieStore = await cookies();
    const authToken = cookieStore.get('auth-token')?.value;
    const logs: ActivationLog[] = await apiFetch('/admin/logs', {
        headers: { Authorization: `Bearer ${authToken}` },
    });

    return (
        <div>
            <h1 className="text-3xl font-bold mb-6">Logs de Ativação</h1>
            <table className="w-full bg-white rounded shadow">
                <thead>
                    <tr className="bg-gray-100">
                        <th className="p-2 text-left">Data</th>
                        <th className="p-2 text-left">Token</th>
                        <th className="p-2 text-left">Ação</th>
                        <th className="p-2 text-left">HWID</th>
                        <th className="p-2 text-left">Sucesso</th>
                    </tr>
                </thead>
                <tbody>
                    {logs.map(log => (
                        <tr key={log.id} className="border-t">
                            <td className="p-2">{new Date(log.createdAt).toLocaleString()}</td>
                            <td className="p-2">{log.token?.code || '—'}</td>
                            <td className="p-2">{log.action}</td>
                            <td className="p-2">{log.hwid}</td>
                            <td className="p-2">{log.success ? '✅' : '❌'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}