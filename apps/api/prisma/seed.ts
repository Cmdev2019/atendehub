// ─────────────────────────────────────────────────────────────────────────────
// Seed inicial — cria empresa demo + admin
// Uso: npm run db:seed
// ─────────────────────────────────────────────────────────────────────────────
import { PrismaClient, Role, Plan } from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Iniciando seed...");

  // ── Empresa demo ────────────────────────────────────────────────────────────
  const company = await prisma.company.upsert({
    where: { slug: "demo" },
    update: {},
    create: {
      name: "Empresa Demo",
      slug: "demo",
      plan: Plan.PROFESSIONAL,
      maxAgents: 20,
      maxChannels: 10,
    },
  });

  console.log(`✓ Empresa criada: ${company.name} (${company.id})`);

  // ── Admin ────────────────────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash("Admin@123", 12);

  const admin = await prisma.user.upsert({
    where: { companyId_email: { companyId: company.id, email: "admin@demo.com" } },
    update: {},
    create: {
      companyId: company.id,
      name: "Administrador",
      email: "admin@demo.com",
      passwordHash,
      role: Role.ADMIN,
    },
  });

  console.log(`✓ Admin criado: ${admin.email}`);

  // ── Departamentos ────────────────────────────────────────────────────────────
  const departments = await Promise.all([
    prisma.department.upsert({
      where: { companyId_name: { companyId: company.id, name: "Atendimento" } },
      update: {},
      create: { companyId: company.id, name: "Atendimento", color: "#0f766e" },
    }),
    prisma.department.upsert({
      where: { companyId_name: { companyId: company.id, name: "Financeiro" } },
      update: {},
      create: { companyId: company.id, name: "Financeiro", color: "#2563eb" },
    }),
    prisma.department.upsert({
      where: { companyId_name: { companyId: company.id, name: "Suporte" } },
      update: {},
      create: { companyId: company.id, name: "Suporte", color: "#d97706" },
    }),
  ]);

  console.log(`✓ ${departments.length} departamentos criados`);

  // ── Filas ────────────────────────────────────────────────────────────────────
  await Promise.all(
    departments.map((dept) =>
      prisma.queue.upsert({
        where: { companyId_name: { companyId: company.id, name: `Fila ${dept.name}` } },
        update: {},
        create: {
          companyId: company.id,
          departmentId: dept.id,
          name: `Fila ${dept.name}`,
          greetingMsg: `Olá! Você entrou na fila de ${dept.name}. Em breve um atendente irá atendê-lo.`,
        },
      }),
    ),
  );

  console.log("✓ Filas criadas");

  // ── Tags padrão ──────────────────────────────────────────────────────────────
  const tagData = [
    { name: "Urgente", color: "#dc2626" },
    { name: "VIP", color: "#d97706" },
    { name: "Aguardando", color: "#6366f1" },
    { name: "Reclamação", color: "#ef4444" },
    { name: "Elogio", color: "#16a34a" },
  ];

  await Promise.all(
    tagData.map((tag) =>
      prisma.tag.upsert({
        where: { companyId_name: { companyId: company.id, name: tag.name } },
        update: {},
        create: { companyId: company.id, ...tag },
      }),
    ),
  );

  console.log("✓ Tags padrão criadas");
  console.log("\n✅ Seed concluído com sucesso!");
  console.log("   Email: admin@demo.com");
  console.log("   Senha: Admin@123");
}

main()
  .catch((error) => {
    console.error("❌ Erro no seed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
