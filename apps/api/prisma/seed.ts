// ─────────────────────────────────────────────────────────────────────────────
// Seed inicial — cria empresa demo + admin
// Uso: npm run db:seed (pode rodar de novo: só cria o que falta)
// ─────────────────────────────────────────────────────────────────────────────
import { PrismaClient, Role, Plan, AutoAttendanceAction } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { randomBytes } from "crypto";
import { writeFileSync } from "fs";

const prisma = new PrismaClient();

// B-66 (ADR-0019, regra 7): cada setor de atendimento é um departamento com a
// sua fila — os 13 setores definidos pelo responsável em 2026-10-17
const SECTORS = [
  "AGENDAMENTO DE CONSULTAS COM ESPECIALISTAS",
  "AGENDAMENTO DE EXAMES OU PROCEDIMENTOS",
  "CONFIRMAÇÃO DE AGENDAMENTO",
  "ENDOSC/COLONO - ORÇAM/AGEND DE EXAMES/PROC",
  "EXAMES OFTALMOLÓGICOS",
  "OUTROS - ATENDIMENTO",
  "OUTROS EXAMES - ORÇAM/AGEND DE EXAMES/PROC",
  "PROCED CIRURGICO - ORÇAM/AGEND DE EXAMES/PROC",
  "RECEITAS",
  "PEDIDOS MÉDICOS",
  "OUTRAS INFORMAÇÕES",
  "RESULTADOS DE EXAMES",
  "ULTRASSOM - ORÇAM/AGEND DE EXAMES/PROC",
];

const SECTOR_COLORS = ["#0f766e", "#2563eb", "#d97706", "#7c3aed", "#db2777", "#059669", "#dc2626"];

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

  // ── Admin com senha temporária aleatória ────────────────────────────────────
  // B-66: só gera senha quando o admin é criado agora — antes, rodar o seed de
  // novo gravava no arquivo uma senha que nunca era aplicada (o upsert mantinha
  // a antiga)
  const existingAdmin = await prisma.user.findUnique({ where: { email: "admin@demo.com" } });
  let temporaryPassword: string | null = null;

  if (existingAdmin) {
    console.log(`✓ Admin já existia: ${existingAdmin.email} (senha mantida)`);
  } else {
    temporaryPassword = randomBytes(16).toString("hex");
    const admin = await prisma.user.create({
      data: {
        companyId: company.id,
        name: "Administrador",
        // email é único globalmente (B-20), não só por empresa
        email: "admin@demo.com",
        passwordHash: await bcrypt.hash(temporaryPassword, 12),
        role: Role.ADMIN,
      },
    });
    console.log(`✓ Admin criado: ${admin.email}`);
  }

  // ── Setores (departamentos), cada um com a sua fila ──────────────────────────
  const sectors: { id: string; name: string }[] = [];
  for (const [index, name] of SECTORS.entries()) {
    const department = await prisma.department.upsert({
      where: { companyId_name: { companyId: company.id, name } },
      update: {},
      create: { companyId: company.id, name, color: SECTOR_COLORS[index % SECTOR_COLORS.length] },
    });
    // Fila compartilhada (MANUAL, o padrão do schema): quem atender primeiro fica
    await prisma.queue.upsert({
      where: { companyId_name: { companyId: company.id, name: `Fila ${name}` } },
      update: {},
      create: { companyId: company.id, departmentId: department.id, name: `Fila ${name}`, maxWaitSecs: 300 },
    });
    sectors.push(department);
  }

  console.log(`✓ ${sectors.length} setores criados, cada um com a sua fila`);

  // ── Menu do auto-atendimento: uma opção por setor (ADR-0019, regra 23) ───────
  // Fica desligado: ligar em Configurações → Auto-atendimento, quando quiser que
  // o paciente receba o menu
  const flow = await prisma.autoAttendanceFlow.upsert({
    where: { companyId: company.id },
    update: {},
    create: {
      companyId: company.id,
      isActive: false,
      greetingMessage: "Olá! Para agilizar o seu atendimento, escolha o assunto respondendo com o número da opção:",
    },
  });

  for (const [index, sector] of sectors.entries()) {
    await prisma.autoAttendanceMenuOption.upsert({
      where: { flowId_order: { flowId: flow.id, order: index + 1 } },
      update: {},
      create: {
        flowId: flow.id,
        order: index + 1,
        label: sector.name,
        action: AutoAttendanceAction.ROUTE_TO_DEPARTMENT,
        departmentId: sector.id,
      },
    });
  }

  console.log("✓ Menu do auto-atendimento com uma opção por setor (desligado)");

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

  // ── Salvar credenciais em arquivo seguro (não em logs) ─────────────────────
  if (!temporaryPassword) {
    console.log("\n✅ Seed concluído com sucesso!");
    return;
  }

  const seedCredentials = `
CREDENCIAIS DE SEED
===================
Geradas em: ${new Date().toISOString()}

Email: admin@demo.com
Senha Temporária: ${temporaryPassword}

⚠️  AÇÃO REQUERIDA:
1. Guarde essas credenciais em local seguro
2. Acesse a aplicação com essas credenciais
3. Mude a senha imediatamente após primeiro login
4. Não compartilhe este arquivo
5. Delete este arquivo após guardar as credenciais

NUNCA comita este arquivo no Git.
  `.trim();

  const fileName = `.seed-credentials-${Date.now()}.txt`;
  writeFileSync(fileName, seedCredentials, { mode: 0o600 }); // Modo 600 = apenas owner pode ler

  console.log("\n✅ Seed concluído com sucesso!");
  console.log(`📄 Credenciais salvas em: ${fileName}`);
  console.log("⚠️  Guarde a senha em local seguro e delete o arquivo em seguida.");
}

main()
  .catch((error) => {
    console.error("❌ Erro no seed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
