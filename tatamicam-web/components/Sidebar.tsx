import Link from 'next/link';

export function Sidebar({ role }: { role: string }) {
    const isAdmin = role === 'SUPERADMIN';
    return (
        <aside className="w-64 bg-navy text-white min-h-screen p-4">
            <h2 className="text-2xl font-bold mb-6">TatamiCam</h2>
            <nav className="space-y-2">
                {isAdmin && (
                    <>
                        <SidebarLink href="/admin/dashboard" icon="📊" label="Dashboard" />
                        <SidebarLink href="/admin/users" icon="👥" label="Usuários" />
                        <SidebarLink href="/admin/tokens" icon="🔑" label="Tokens" />
                        <SidebarLink href="/admin/logs" icon="📜" label="Logs" />
                    </>
                )}
                <SidebarLink href="/dashboard" icon="🏠" label="Meu Painel" />
            </nav>
        </aside>
    );
}

function SidebarLink({ href, icon, label }: { href: string; icon: string; label: string }) {
    return (
        <Link href={href} className="flex items-center gap-2 p-2 rounded hover:bg-red-700 transition-colors">
            <span>{icon}</span> {label}
        </Link>
    );
}