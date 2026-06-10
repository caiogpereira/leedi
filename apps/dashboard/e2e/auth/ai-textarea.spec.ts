import { test, expect } from '@playwright/test';

/**
 * Phase 2 authed E2E — Story 3.3 AI-Assisted Textarea (modal stream → accept).
 *
 * This is the flow Story 3.3 explicitly deferred ("open modal → suggestion streams
 * → Aceitar updates the field — NOT delivered, no Playwright harness").
 *
 * Both backend calls are intercepted so the test is deterministic and needs no AI
 * provider / API server:
 *   - GET  /api/tenants/:id/agent-config → a fixed AgentConfig so the page renders
 *     regardless of DB state (the client shows an error state if this fails).
 *   - POST /api/ai/improve-text → a fixed body; the component reads it as a stream
 *     (response.body.getReader()), so a plain fulfilled body exercises the real
 *     streaming-accumulation path.
 */

const IMPROVED = 'Sou a Mari, consultora de vendas atenciosa e direta no WhatsApp.';

const AGENT_CONFIG = {
  nomeAgente: 'Mari',
  persona: '',
  estiloMensagem: { tamanho: 'medio', formalidade: 'informal', emoji: true },
  limites: '',
  salesMethodId: null,
  modeloIa: 'haiku',
  toolsHabilitadas: {
    consultar_base_conhecimento: true,
    agendar_followup: false,
    transferir_humano: false,
    adicionar_tag: false,
    solicitar_reengajamento: false,
  },
  ativo: true,
};

test('AI-assisted textarea: modal streams a suggestion and Aceitar applies it', async ({
  page,
}) => {
  await page.route('**/api/tenants/*/agent-config', async (route) => {
    await route.fulfill({ json: AGENT_CONFIG });
  });

  await page.route('**/api/ai/improve-text', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/plain; charset=utf-8',
      body: IMPROVED,
    });
  });

  await page.goto('/agente/configuracoes');

  // Persona is the first AI-assisted field. Its "Melhorar com IA" button is
  // disabled until the field has text — so seed it first.
  const persona = page.getByPlaceholder('Descreva a personalidade, tom e papel do agente…');
  await expect(persona).toBeVisible();
  await persona.fill('persona inicial');

  // Only the persona field has text, so its is the only enabled improve button.
  await page.getByRole('button', { name: /melhorar com ia/i }).first().click();

  // Modal opens and the streamed suggestion lands in the suggestion pane.
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Sugestão de melhoria' })).toBeVisible();
  await expect(dialog.getByText(IMPROVED)).toBeVisible();

  // Accept → the suggestion replaces the field value and the modal closes.
  await dialog.getByRole('button', { name: 'Aceitar', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(persona).toHaveValue(IMPROVED);
});
