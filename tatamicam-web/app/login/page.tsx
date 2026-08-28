'use client';
import { useState } from 'react';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (res.ok) {
            // Salva token em cookie via API route do Next (para HTTP-only)
            await fetch('/api/set-auth-cookie', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: data.token }),
            });
            window.location.href = data.user.role === 'SUPERADMIN' ? '/admin/dashboard' : '/dashboard';
        } else {
            setError(data.error || 'Credenciais inválidas');
        }
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-navy">
            <form onSubmit={handleSubmit} className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
                <h1 className="text-2xl font-bold text-navy mb-6">TatamiCam Admin</h1>
                {error && <p className="text-red-500 mb-4">{error}</p>}
                <input
                    type="email"
                    placeholder="E-mail"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full p-2 border rounded mb-4"
                />
                <input
                    type="password"
                    placeholder="Senha"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full p-2 border rounded mb-6"
                />
                <button type="submit" className="w-full bg-red-600 text-white py-2 rounded hover:bg-red-700">
                    Entrar
                </button>
            </form>
        </div>
    );
}