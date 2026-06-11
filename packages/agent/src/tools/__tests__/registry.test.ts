import { describe, it, expect } from 'vitest';
import { buildToolList, routeToolCall } from '../registry.js';
import { ALWAYS_ON_TOOLS } from '../../utils/resolve-enabled-tools.js';
import type { ToolContext, ToolsHabilitadas } from '../types.js';

const allFalse: ToolsHabilitadas = {
  consultar_base_conhecimento: false,
  agendar_followup: false,
  transferir_humano: false,
  adicionar_tag: false,
  solicitar_reengajamento: false,
};

const ctx: ToolContext = {
  tenantId: 't1',
  leadId: 'l1',
  leadPhone: '+5511999999999',
  connectionId: 'c1',
  threadId: 'th1',
  conversationWindowId: 'w1',
};

describe('buildToolList', () => {
  it('includes every always-on tool when all toggles are off', () => {
    const tools = buildToolList(allFalse);
    const names = tools.map((t) => t.name);
    for (const t of ALWAYS_ON_TOOLS) expect(names).toContain(t);
    expect(tools).toHaveLength(ALWAYS_ON_TOOLS.length);
  });

  it('appends only enabled configurable tools', () => {
    const tools = buildToolList({ ...allFalse, transferir_humano: true });
    const names = tools.map((t) => t.name);
    expect(names).toContain('transferir_humano');
    expect(names).not.toContain('agendar_followup');
  });

  it('produces a deterministic order (always-on first, then configurable)', () => {
    const a = buildToolList({ ...allFalse, adicionar_tag: true });
    const b = buildToolList({ ...allFalse, adicionar_tag: true });
    expect(a.map((t) => t.name)).toEqual(b.map((t) => t.name));
    // always-on come before configurable
    const names = a.map((t) => t.name);
    expect(names.indexOf('adicionar_tag')).toBe(ALWAYS_ON_TOOLS.length);
  });

  it('excludes consultar_base_conhecimento when its toggle is off (AC#4)', () => {
    const names = buildToolList(allFalse).map((t) => t.name);
    expect(names).not.toContain('consultar_base_conhecimento');
  });

  it('includes consultar_base_conhecimento when its toggle is on', () => {
    const names = buildToolList({ ...allFalse, consultar_base_conhecimento: true }).map(
      (t) => t.name
    );
    expect(names).toContain('consultar_base_conhecimento');
  });

  it('consultar_base_conhecimento schema exposes tipo (required) + categoria, not consulta', () => {
    const tool = buildToolList({ ...allFalse, consultar_base_conhecimento: true }).find(
      (t) => t.name === 'consultar_base_conhecimento'
    );
    expect(tool).toBeDefined();
    const props = Object.keys(tool!.input_schema.properties);
    expect(props).toEqual(expect.arrayContaining(['tipo', 'categoria']));
    expect(props).not.toContain('consulta');
    expect(tool!.input_schema.required).toEqual(['tipo']);
  });

  it('schemas never expose ctx/identity fields to the model', () => {
    const tools = buildToolList({ ...allFalse, consultar_base_conhecimento: true });
    for (const tool of tools) {
      const props = Object.keys(tool.input_schema.properties);
      for (const forbidden of ['tenantId', 'leadId', 'leadPhone', 'connectionId', 'threadId', 'conversationWindowId']) {
        expect(props).not.toContain(forbidden);
      }
    }
  });
});

describe('routeToolCall', () => {
  it('returns a sandboxed stub for write-side tools in sandbox mode (no side effects)', async () => {
    // Story 13.4: agendar_followup is now implemented; in sandbox mode it must be
    // intercepted before any DB/QStash side effect.
    const followup = (await routeToolCall(
      'agendar_followup',
      { agendado_para: new Date(Date.now() + 2 * 3600 * 1000).toISOString(), motivo: 'x' },
      { ...ctx, sandboxMode: true }
    )) as { scheduled: boolean; sandboxed: boolean };
    expect(followup.scheduled).toBe(true);
    expect(followup.sandboxed).toBe(true);

    const reeng = (await routeToolCall(
      'solicitar_reengajamento',
      { motivo: 'frio' },
      { ...ctx, sandboxMode: true }
    )) as { requested: boolean; sandboxed: boolean };
    expect(reeng.requested).toBe(true);
    expect(reeng.sandboxed).toBe(true);
  });

  it('returns a structured pending result for unknown tools (never throws)', async () => {
    const out = (await routeToolCall('uma_ferramenta_inexistente', {}, ctx)) as {
      ok: boolean;
      reason: string;
    };
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('tool_not_implemented');
  });
});
