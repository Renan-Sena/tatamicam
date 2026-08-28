'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

export default function AdminDashboard() {
    const [metrics, setMetrics] = useState({ activeTokens: 0, expiringSoon: 0, offlineMachines: 0 });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function load() {
            const data = await apiFetch('/admin/metrics');
            setMetrics(data);
            setLoading(false);
        }
        load();
    }, []);

    if (loading) return <p>Carregando...</p>;

    return (
        <div>
            <h1 className="text-3xl font-bold mb-6">Dashboard Admin</h1>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <MetricCard title="Tokens Ativos" value={metrics.activeTokens} />
                <MetricCard title="Expirando em breve" value={metrics.expiringSoon} />
                <MetricCard title="Máquinas offline" value={metrics.offlineMachines} />
            </div>
        </div>
    );
}

function MetricCard({ title, value }: { title: string; value: number }) {
    return (
        <div className="bg-white p-4 rounded shadow">
            <h2 className="text-lg">{title}</h2>
            <p className="text-3xl font-bold text-red-600">{value}</p>
        </div>
    );
}