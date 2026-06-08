import { describe, it, expect } from 'vitest';
import {
  resolveEnabledTools,
  ALWAYS_ON_TOOLS,
  type ToolsHabilitadas,
} from '../resolve-enabled-tools.js';

const allFalse: ToolsHabilitadas = {
  consultar_base_conhecimento: false,
  agendar_followup: false,
  transferir_humano: false,
  adicionar_tag: false,
  solicitar_reengajamento: false,
};

describe('resolveEnabledTools', () => {
  it('always includes every always-on tool', () => {
    const tools = resolveEnabledTools(allFalse);
    for (const t of ALWAYS_ON_TOOLS) {
      expect(tools).toContain(t);
    }
  });

  it('excludes transferir_humano when disabled (AC#5)', () => {
    const tools = resolveEnabledTools({ ...allFalse, transferir_humano: false });
    expect(tools).not.toContain('transferir_humano');
  });

  it('includes transferir_humano when enabled', () => {
    const tools = resolveEnabledTools({ ...allFalse, transferir_humano: true });
    expect(tools).toContain('transferir_humano');
  });

  it('with all configurable tools disabled, returns only the always-on set', () => {
    const tools = resolveEnabledTools(allFalse);
    expect(tools).toHaveLength(ALWAYS_ON_TOOLS.length);
  });

  it('includes only the enabled configurable tools', () => {
    const tools = resolveEnabledTools({
      ...allFalse,
      consultar_base_conhecimento: true,
      adicionar_tag: true,
    });
    expect(tools).toContain('consultar_base_conhecimento');
    expect(tools).toContain('adicionar_tag');
    expect(tools).not.toContain('agendar_followup');
    expect(tools).not.toContain('transferir_humano');
    expect(tools).not.toContain('solicitar_reengajamento');
  });
});
