import { withServiceRole, schema } from '../index.js';

const LIBRARY_ENTRIES = [
  {
    id: '00000000-0000-4000-8000-000000000101',
    categoriaOcasiao: 'boas_vindas',
    titulo: 'Boas-vindas',
    descricao: 'Mensagem de boas-vindas para novos leads que entraram em contato.',
    componentesSugeridos: {
      body: { type: 'BODY' as const, text: 'Olá, {{1}}! 👋 Seja bem-vindo(a) à {{2}}. Estou aqui para te ajudar. Como posso te atender hoje?' },
    },
    isGlobal: true,
  },
  {
    id: '00000000-0000-4000-8000-000000000102',
    categoriaOcasiao: 'carrinho_abandonado_1h',
    titulo: 'Carrinho Abandonado (1h)',
    descricao: 'Recuperação urgente enviada 1 hora após abandono do carrinho.',
    componentesSugeridos: {
      body: { type: 'BODY' as const, text: 'Oi, {{1}}! 🛒 Você deixou algo no seu carrinho. Ainda está pensando? Posso te ajudar a tomar a melhor decisão. O acesso ainda está disponível: {{2}}' },
      footer: { type: 'FOOTER' as const, text: 'Responda PARAR para não receber mais mensagens.' },
    },
    isGlobal: true,
  },
  {
    id: '00000000-0000-4000-8000-000000000103',
    categoriaOcasiao: 'carrinho_abandonado_6h',
    titulo: 'Carrinho Abandonado (6h)',
    descricao: 'Follow-up suave 6 horas após abandono do carrinho.',
    componentesSugeridos: {
      body: { type: 'BODY' as const, text: 'Olá, {{1}}! Sei que a vida é corrida 😊 Só queria lembrar que {{2}} ainda está esperando por você. Quer que eu tire alguma dúvida antes de você decidir?' },
    },
    isGlobal: true,
  },
  {
    id: '00000000-0000-4000-8000-000000000104',
    categoriaOcasiao: 'carrinho_abandonado_24h',
    titulo: 'Carrinho Abandonado (24h)',
    descricao: 'Último lembrete 24 horas após abandono do carrinho.',
    componentesSugeridos: {
      body: { type: 'BODY' as const, text: '{{1}}, esta é a minha última mensagem sobre {{2}} 🎯 Depois disso, vou respeitar sua decisão. Mas se ainda tiver interesse, estou aqui. O que acha?' },
    },
    isGlobal: true,
  },
  {
    id: '00000000-0000-4000-8000-000000000105',
    categoriaOcasiao: 'ultima_chamada',
    titulo: 'Última Chamada',
    descricao: 'Mensagem de urgência quando o carrinho está prestes a fechar.',
    componentesSugeridos: {
      body: { type: 'BODY' as const, text: '⚠️ {{1}}, o carrinho fecha em {{2}}! Após isso, não será mais possível garantir sua vaga nesta turma. Aproveite agora: {{3}}' },
    },
    isGlobal: true,
  },
  {
    id: '00000000-0000-4000-8000-000000000106',
    categoriaOcasiao: 'pos_compra',
    titulo: 'Pós-compra',
    descricao: 'Mensagem de parabéns e próximos passos após a compra confirmada.',
    componentesSugeridos: {
      body: { type: 'BODY' as const, text: '🎉 Parabéns, {{1}}! Sua compra de {{2}} foi confirmada. Em breve você receberá os dados de acesso no e-mail cadastrado. Qualquer dúvida, é só me chamar!' },
    },
    isGlobal: true,
  },
  {
    id: '00000000-0000-4000-8000-000000000107',
    categoriaOcasiao: 'reengajamento',
    titulo: 'Reengajamento',
    descricao: 'Reconectar com leads inativos há algum tempo.',
    componentesSugeridos: {
      body: { type: 'BODY' as const, text: 'Oi, {{1}}! Faz um tempo que não nos falamos 😊 Queria saber como você está e se posso te ajudar com algo. Temos novidades incríveis em {{2}}. Topa uma conversa rápida?' },
    },
    isGlobal: true,
  },
  {
    id: '00000000-0000-4000-8000-000000000108',
    categoriaOcasiao: 'lembrete_evento',
    titulo: 'Lembrete de Evento',
    descricao: 'Lembrete de webinar, aula ao vivo ou evento para leads inscritos.',
    componentesSugeridos: {
      body: { type: 'BODY' as const, text: '📅 Lembrete, {{1}}! {{2}} começa em {{3}}. Anote o link de acesso: {{4}}\n\nTe esperamos lá! 🚀' },
    },
    isGlobal: true,
  },
] as const;

export async function seedTemplateLibrary(): Promise<void> {
  await withServiceRole(async (tx) => {
    for (const entry of LIBRARY_ENTRIES) {
      await tx
        .insert(schema.templateLibrary)
        .values(entry)
        .onConflictDoNothing();
    }
  });
  console.log(`[seed] template_library: ${LIBRARY_ENTRIES.length} entries seeded.`);
}
