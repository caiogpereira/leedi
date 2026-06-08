-- Stories 12.1 + 12.2: templates + template_library tables
-- set_updated_at() was created in migration 0004 — do NOT redefine it.

-- ─── Enums ──────────────────────────────────────────────────────────────────────
CREATE TYPE "public"."template_categoria" AS ENUM('marketing', 'utility', 'authentication');

CREATE TYPE "public"."template_status" AS ENUM(
  'rascunho',
  'pendente',
  'aprovado',
  'rejeitado',
  'pausado'
);

-- ─── templates ────────────────────────────────────────────────────────────────────
CREATE TABLE "templates" (
  "id"                uuid        DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"         uuid        NOT NULL,
  "connection_id"     uuid,
  "nome"              text        NOT NULL,
  "categoria"         "template_categoria" NOT NULL,
  "idioma"            text        NOT NULL DEFAULT 'pt_BR',
  "componentes"       jsonb       NOT NULL,
  "variaveis"         jsonb       NOT NULL DEFAULT '[]',
  "meta_template_id"  text,
  "status"            "template_status" NOT NULL DEFAULT 'rascunho',
  "motivo_rejeicao"   text,
  "created_at"        timestamptz DEFAULT now() NOT NULL,
  "updated_at"        timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "templates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "templates_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "whatsapp_connections"("id") ON DELETE SET NULL
);

ALTER TABLE "templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "templates" FORCE ROW LEVEL SECURITY;

CREATE POLICY "templates_tenant_isolation" ON "templates"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE TRIGGER "templates_updated_at"
  BEFORE UPDATE ON "templates"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── template_library ─────────────────────────────────────────────────────────────
-- Global read-only table — no RLS needed (no tenant_id column).
CREATE TABLE "template_library" (
  "id"                    uuid        DEFAULT gen_random_uuid() NOT NULL,
  "categoria_ocasiao"     text        NOT NULL,
  "titulo"                text        NOT NULL,
  "descricao"             text        NOT NULL,
  "componentes_sugeridos" jsonb       NOT NULL,
  "is_global"             boolean     NOT NULL DEFAULT true,
  "created_at"            timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "template_library_pkey" PRIMARY KEY ("id")
);

-- ─── Seed: 8 suggested library entries ───────────────────────────────────────────
INSERT INTO "template_library" ("id", "categoria_ocasiao", "titulo", "descricao", "componentes_sugeridos") VALUES
(
  '00000000-0000-4000-8000-000000000101',
  'boas_vindas',
  'Boas-vindas',
  'Mensagem de boas-vindas para novos leads que entraram em contato.',
  '{"body":{"type":"BODY","text":"Olá, {{1}}! 👋 Seja bem-vindo(a) à {{2}}. Estou aqui para te ajudar. Como posso te atender hoje?"},"variaveis":[{"index":1,"exemplo":"João"},{"index":2,"exemplo":"Minha Empresa"}]}'
),
(
  '00000000-0000-4000-8000-000000000102',
  'carrinho_abandonado_1h',
  'Carrinho Abandonado (1h)',
  'Recuperação urgente enviada 1 hora após abandono do carrinho.',
  '{"body":{"type":"BODY","text":"Oi, {{1}}! 🛒 Você deixou algo no seu carrinho. Ainda está pensando? Posso te ajudar a tomar a melhor decisão. O acesso ainda está disponível: {{2}}"},"footer":{"type":"FOOTER","text":"Responda PARAR para não receber mais mensagens."},"variaveis":[{"index":1,"exemplo":"Maria"},{"index":2,"exemplo":"https://checkout.link/abc"}]}'
),
(
  '00000000-0000-4000-8000-000000000103',
  'carrinho_abandonado_6h',
  'Carrinho Abandonado (6h)',
  'Follow-up suave 6 horas após abandono do carrinho.',
  '{"body":{"type":"BODY","text":"Olá, {{1}}! Sei que a vida é corrida 😊 Só queria lembrar que {{2}} ainda está esperando por você. Quer que eu tire alguma dúvida antes de você decidir?"},"variaveis":[{"index":1,"exemplo":"Carlos"},{"index":2,"exemplo":"o Curso de Marketing Digital"}]}'
),
(
  '00000000-0000-4000-8000-000000000104',
  'carrinho_abandonado_24h',
  'Carrinho Abandonado (24h)',
  'Último lembrete 24 horas após abandono do carrinho.',
  '{"body":{"type":"BODY","text":"{{1}}, esta é a minha última mensagem sobre {{2}} 🎯 Depois disso, vou respeitar sua decisão. Mas se ainda tiver interesse, estou aqui. O que acha?"},"variaveis":[{"index":1,"exemplo":"Ana"},{"index":2,"exemplo":"o Curso de Marketing Digital"}]}'
),
(
  '00000000-0000-4000-8000-000000000105',
  'ultima_chamada',
  'Última Chamada',
  'Mensagem de urgência quando o carrinho está prestes a fechar.',
  '{"body":{"type":"BODY","text":"⚠️ {{1}}, o carrinho fecha em {{2}}! Após isso, não será mais possível garantir sua vaga nesta turma. Aproveite agora: {{3}}"},"variaveis":[{"index":1,"exemplo":"Paulo"},{"index":2,"exemplo":"2 horas"},{"index":3,"exemplo":"https://checkout.link/abc"}]}'
),
(
  '00000000-0000-4000-8000-000000000106',
  'pos_compra',
  'Pós-compra',
  'Mensagem de parabéns e próximos passos após a compra confirmada.',
  '{"body":{"type":"BODY","text":"🎉 Parabéns, {{1}}! Sua compra de {{2}} foi confirmada. Em breve você receberá os dados de acesso no e-mail cadastrado. Qualquer dúvida, é só me chamar!"},"variaveis":[{"index":1,"exemplo":"Fernanda"},{"index":2,"exemplo":"Curso de Marketing Digital"}]}'
),
(
  '00000000-0000-4000-8000-000000000107',
  'reengajamento',
  'Reengajamento',
  'Reconectar com leads inativos há algum tempo.',
  '{"body":{"type":"BODY","text":"Oi, {{1}}! Faz um tempo que não nos falamos 😊 Queria saber como você está e se posso te ajudar com algo. Temos novidades incríveis em {{2}}. Topa uma conversa rápida?"},"variaveis":[{"index":1,"exemplo":"Roberto"},{"index":2,"exemplo":"nossa plataforma"}]}'
),
(
  '00000000-0000-4000-8000-000000000108',
  'lembrete_evento',
  'Lembrete de Evento',
  'Lembrete de webinar, aula ao vivo ou evento para leads inscritos.',
  '{"body":{"type":"BODY","text":"📅 Lembrete, {{1}}! {{2}} começa em {{3}}. Anote o link de acesso: {{4}}\n\nTe esperamos lá! 🚀"},"variaveis":[{"index":1,"exemplo":"Juliana"},{"index":2,"exemplo":"A Masterclass gratuita"},{"index":3,"exemplo":"1 hora"},{"index":4,"exemplo":"https://evento.link/xyz"}]}'
)
ON CONFLICT ("id") DO NOTHING;
