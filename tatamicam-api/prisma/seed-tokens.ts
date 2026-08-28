import { prisma } from '../src/lib/prisma.js';
import { randomInt } from 'crypto';
import bcrypt from 'bcryptjs';

// Alfabeto sem caracteres ambíguos (O/0, I/1) para facilitar digitação.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const group = (n = 4) => Array.from({ length: n }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
const makeCode = () => `TATA-${group()}-${group()}-${group()}`;

const HOW_MANY = 8;
const PLAN = 'FEDERATION' as const;

async function main() {
    // Dono dos tokens: usa o primeiro usuário existente; se não houver, cria um admin de seed.
    let user = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!user) {
        const password = await bcrypt.hash(randomInt(1e9).toString(), 10);
        user = await prisma.user.create({
            data: { email: 'admin@fejama.local', password, name: 'FEJAMA Admin', role: 'SUPERADMIN' },
        });
        console.log(`Usuário dono criado: ${user.email} (${user.id}) — sem login utilizável (defina a senha pelo painel).`);
    } else {
        console.log(`Usando usuário existente como dono: ${user.email} (${user.id})`);
    }

    const created: string[] = [];
    for (let i = 0; i < HOW_MANY; i++) {
        let code = makeCode();
        while (await prisma.licenseToken.findUnique({ where: { code } })) code = makeCode();
        const t = await prisma.licenseToken.create({
            data: { code, userId: user.id, plan: PLAN, status: 'ACTIVE', maxMachines: 1 },
        });
        created.push(t.code);
    }

    console.log(`\n=== ${HOW_MANY} TOKENS CRIADOS (status ATIVO, plano ${PLAN}) ===`);
    created.forEach((c, i) => console.log(`${String(i + 1).padStart(2, '0')}. ${c}`));
    console.log('\nUse qualquer um na primeira ativação do app.');
}

main()
    .then(() => process.exit(0))
    .catch((e) => { console.error('Erro ao criar tokens:', e); process.exit(1); });
