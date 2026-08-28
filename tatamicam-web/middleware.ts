import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'fallback-secret');

async function verifyAuth(token: string) {
    try {
        const { payload } = await jwtVerify(token, JWT_SECRET);
        return payload as { userId: string; role: string };
    } catch {
        return null;
    }
}

export async function middleware(req: NextRequest) {
    const token = req.cookies.get('auth-token')?.value;
    if (!token) {
        return NextResponse.redirect(new URL('/login', req.url));
    }

    const decoded = await verifyAuth(token);
    if (!decoded) {
        return NextResponse.redirect(new URL('/login', req.url));
    }

    const path = req.nextUrl.pathname;
    if (path.startsWith('/admin') && decoded.role !== 'SUPERADMIN') {
        return NextResponse.redirect(new URL('/dashboard', req.url));
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/dashboard/:path*', '/admin/:path*'],
};