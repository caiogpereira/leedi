import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AIAssistedTextarea } from './AIAssistedTextarea';

// Mock lucide-react icons
vi.mock('lucide-react', () => {
  const Icon = (props: object) => <svg {...props} />;
  return { Sparkles: Icon, AlertCircle: Icon, Loader2: Icon };
});

// Mock Dialog to render inline (avoid portal/jsdom issues)
vi.mock('./ui/dialog.js', () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div role="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));

function makeStreamResponse(text: string, status = 200): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
  return new Response(stream, { status, headers: { 'Content-Type': 'text/plain' } });
}

afterEach(cleanup);

describe('AIAssistedTextarea', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders textarea and the Melhorar com IA button', () => {
    render(
      <AIAssistedTextarea value="texto original" onChange={vi.fn()} context="agent persona" />
    );
    expect(screen.getByRole('textbox')).toBeTruthy();
    expect(screen.getByRole('button', { name: /melhorar com ia/i })).toBeTruthy();
  });

  it('disables the trigger when value is empty', () => {
    render(<AIAssistedTextarea value="" onChange={vi.fn()} context="agent persona" />);
    const btn = screen.getByRole('button', { name: /melhorar com ia/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('calls onChange with suggestion when Aceitar is clicked', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeStreamResponse('texto melhorado')));

    const onChange = vi.fn();
    render(
      <AIAssistedTextarea value="texto original" onChange={onChange} context="agent persona" />
    );

    fireEvent.click(screen.getByRole('button', { name: /melhorar com ia/i }));

    const acceptBtn = await screen.findByRole('button', { name: /^aceitar$/i });
    fireEvent.click(acceptBtn);

    expect(onChange).toHaveBeenCalledWith('texto melhorado');
  });

  it('does NOT call onChange when modal is closed via Cancelar', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeStreamResponse('texto melhorado')));

    const onChange = vi.fn();
    render(
      <AIAssistedTextarea value="texto original" onChange={onChange} context="agent persona" />
    );

    fireEvent.click(screen.getByRole('button', { name: /melhorar com ia/i }));

    const cancelBtn = await screen.findByRole('button', { name: /cancelar/i });
    fireEvent.click(cancelBtn);

    expect(onChange).not.toHaveBeenCalled();
  });

  it('applies edited text on Aceitar after Editar antes de aceitar', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeStreamResponse('sugestão da IA')));

    const onChange = vi.fn();
    render(
      <AIAssistedTextarea value="texto original" onChange={onChange} context="agent persona" />
    );

    fireEvent.click(screen.getByRole('button', { name: /melhorar com ia/i }));

    const editBtn = await screen.findByRole('button', { name: /editar antes de aceitar/i });
    fireEvent.click(editBtn);

    const editableTextarea = screen.getByRole('textbox', { name: /editar sugestão/i });
    fireEvent.change(editableTextarea, { target: { value: 'texto editado pelo usuário' } });

    fireEvent.click(screen.getByRole('button', { name: /^aceitar$/i }));

    expect(onChange).toHaveBeenCalledWith('texto editado pelo usuário');
  });

  it('shows error banner + retry button on API failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Server error' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );

    render(
      <AIAssistedTextarea value="texto original" onChange={vi.fn()} context="agent persona" />
    );

    fireEvent.click(screen.getByRole('button', { name: /melhorar com ia/i }));

    await waitFor(() => {
      expect(screen.getByText(/não foi possível gerar a sugestão/i)).toBeTruthy();
    });
    expect(screen.getByRole('button', { name: /tentar novamente/i })).toBeTruthy();
  });
});
