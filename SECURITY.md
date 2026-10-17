# Política de Segurança

## Reportar uma vulnerabilidade

**Nunca abra uma issue pública para vulnerabilidade de segurança.** Uma issue pública expõe o problema
antes que exista correção, colocando em risco os dados dos clientes que usam a plataforma.

### Canal correto

1. **Preferencial:** [Security Advisory privado](https://github.com/Cmdev2019/atendehub/security/advisories/new)
2. **Alternativa:** contato direto com o mantenedor

### O que incluir

- Descrição da vulnerabilidade e do impacto potencial
- Passos para reproduzir
- Versão ou commit afetado
- Sugestão de correção, se tiver
- Se você deseja ser creditado publicamente

### Nosso compromisso

| Etapa | Prazo |
|---|---|
| Confirmação de recebimento | 48 horas |
| Avaliação inicial e classificação de severidade | 5 dias úteis |
| Atualização de progresso | a cada 7 dias |
| Correção de severidade crítica ou alta | conforme SLA abaixo |
| Divulgação coordenada | após a correção, com crédito se desejado |

### SLA de correção

| Severidade | Definição | Prazo |
|---|---|---|
| **Crítica** | Execução remota de código, vazamento entre tenants, acesso não autenticado a dado de cliente | 7 dias |
| **Alta** | Escalação de privilégio, exposição de dado sensível com autenticação | 30 dias |
| **Média** | Vulnerabilidade que exige condições específicas | 90 dias |
| **Baixa** | Impacto limitado, exploração impraticável | próximo ciclo |

## Escopo

### Dentro do escopo
- Aplicação backend (`apps/api`) e frontend
- Configuração de infraestrutura versionada (`infra/`, `docker-compose*.yml`)
- Pipeline de CI/CD
- Dependências diretas do projeto

### Fora do escopo
- Vulnerabilidades em serviços de terceiros (Evolution API, MinIO, PostgreSQL) — reporte ao fornecedor,
  mas nos avise se afetar o AtendeHub
- Ataques de engenharia social
- Negação de serviço por volume bruto
- Problemas que exijam acesso físico ao servidor
- Ausência de proteções em ambiente de desenvolvimento local

## Vulnerabilidades em aberto

Este repositório é público. Por isso, **detalhes técnicos de falhas ainda não corrigidas não são
publicados aqui** — nem neste arquivo, nem em issues ou pull requests. Os relatórios de auditoria
ficam fora do repositório, e os itens de segurança em aberto são registrados no roadmap sem passos
de exploração.

**Nenhum ambiente de produção com dados reais de clientes está no ar.** Os itens de endurecimento
pendentes são pré-requisito de go-live.

### Correções já publicadas

| ID | Área | Severidade | Corrigido em |
|---|---|---|---|
| B-38 | Armazenamento de mídia (bucket com leitura pública) | 🔴 Crítica | 2026-07-29, reforçado em 2026-08-01 |

## Práticas de segurança do projeto

- Segredos JWT validados no boot; a aplicação **não inicia** em produção com segredo fraco
- `CORS_ORIGINS` validado no boot; a aplicação **não inicia** com CORS permissivo em produção
- Refresh token armazenado como hash SHA-256, com rotação e revogação individual
- Access token revogável via blacklist em Redis
- Webhook validado com comparação em tempo constante
- Nível de log travado em código para nunca expor dado pessoal em produção
- Isolamento multi-tenant aplicado na camada de serviço (filtro por `companyId`)

## Divulgação responsável

Pedimos que você:
- Nos dê tempo razoável para corrigir antes de divulgar publicamente
- Não acesse, modifique ou exfiltre dados de terceiros
- Não degrade o serviço durante os testes
- Interrompa os testes ao encontrar dado pessoal e nos avise imediatamente

Em troca, nos comprometemos a não tomar medida legal contra pesquisa de segurança conduzida de boa-fé
dentro destas diretrizes.
