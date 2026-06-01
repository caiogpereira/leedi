import { Hono } from 'hono';
import { z } from 'zod';
import { Redis } from '@upstash/redis';
import { env } from '@leedi/config';
import type { AIProvider } from '../ai/provider.js';

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';

const improveTextSchema = z.object({
  text: z.string().min(1, 'text is required').max(10_000, 'text is too long'),
  context: z.string().min(1, 'context is required').max(200, 'context is too long'),
});

const contextInstructions: Record<string, string> = {
  sales_argument:
    'Torne-o mais persuasivo e focado nos benefícios. Máximo 2 frases, em português do Brasil.',
  differential:
    'Destaque o diferencial de forma clara e memorável. Máximo 2 frases, em português do Brasil.',
  social_proof:
    'Torne a prova social mais convincente e específica. Máximo 2 frases, em português do Brasil.',
  guarantee:
    'Redija a garantia de forma clara, tranquilizadora e profissional, em português do Brasil.',
  bonus:
    'Descreva o bônus de forma atraente, destacando o valor percebido. Máximo 2 frases, em português do Brasil.',
  faq_answer:
    'Responda de forma clara, direta e amigável. Português do Brasil, linguagem natural de WhatsApp.',
  objection_counter:
    'Redija um contorno de objeção empático e persuasivo. Máximo 2 frases, em português do Brasil.',
};

function buildPrompt(text: string, context: string): string {
  const specificInstruction = contextInstructions[context];
  const instruction = specificInstruction
    ? specificInstruction
    : `Melhore o texto de ${context}. Mantenha o significado original, em português do Brasil.`;

  return `Você é um especialista em copywriting para vendas pelo WhatsApp no mercado brasileiro.

Melhore o seguinte texto. ${instruction} Retorne APENAS o texto melhorado — sem explicações, sem preâmbulo, sem markdown.

Texto original:
${text}`;
}

export function createAiRouter(aiProvider: AIProvider) {
  const router = new Hono();

  const redis = new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });

  router.post('/improve-text', async (c) => {
    // Tenant rate limiting — 10 requests per minute per IP (basic, until auth is wired)
    const clientIp = c.req.header('x-forwarded-for') ?? 'unknown';
    const rateLimitKey = `ratelimit:improve-text:${clientIp}`;
    const current = await redis.incr(rateLimitKey);
    if (current === 1) {
      await redis.expire(rateLimitKey, 60);
    }
    if (current > 10) {
      return c.json({ error: 'Limite de requisições atingido. Tente novamente em 1 minuto.' }, 429);
    }

    // Validate input
    const body = await c.req.json().catch(() => null);
    const parsed = improveTextSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues?.[0]?.message ?? parsed.error.message ?? 'Invalid input';
      return c.json({ error: msg }, 400);
    }

    const { text, context } = parsed.data;
    const prompt = buildPrompt(text, context);

    try {
      const tokenStream = await aiProvider.completarStream(prompt, HAIKU_MODEL);

      // Convert string ReadableStream to byte ReadableStream for the Response
      const byteStream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const reader = tokenStream.getReader();
          const encoder = new TextEncoder();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              controller.enqueue(encoder.encode(value));
            }
            controller.close();
          } catch (err) {
            controller.error(err);
          }
        },
      });

      return new Response(byteStream, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Transfer-Encoding': 'chunked',
          'Cache-Control': 'no-cache',
        },
      });
    } catch {
      return c.json(
        { error: 'Erro ao processar a sugestão. Verifique sua conexão e tente novamente.' },
        500
      );
    }
  });

  return router;
}
