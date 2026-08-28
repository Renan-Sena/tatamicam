import { cookies } from 'next/headers';
import { apiFetch } from '@/lib/api';
import type { User } from '@/types';

export default async function UserDashboard() {
  const cookieStore = await cookies();
  const authToken = cookieStore.get('auth-token')?.value;
  const data: User = await apiFetch('/user/me', {
    headers: { Authorization: `Bearer ${authToken}` },
  });

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Meu Painel</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded shadow">
          <h2 className="text-xl mb-2">Meus Tokens</h2>
          {data.tokens?.map(t => (
            <div key={t.id} className="border-b py-2">
              <p><strong>Código:</strong> {t.code}</p>
              <p><strong>Plano:</strong> {t.plan}</p>
              <p><strong>Status:</strong> {t.status}</p>
              <p><strong>Máquina:</strong> {t.currentMachine?.hwid || '—'}</p>
            </div>
          ))}
        </div>
        <div className="bg-white p-4 rounded shadow">
          <h2 className="text-xl mb-2">Ações</h2>
          <button className="bg-red-600 text-white px-4 py-2 rounded">Comprar novo token</button>
        </div>
      </div>
    </div>
  );
}