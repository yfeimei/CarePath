import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { AssistContext, AssistProvider, ProviderResult } from './types';

/**
 * Claude-backed recovery. Only ever sees this pass's approved route text — no
 * catalog, no other passes, no visitor identity. The reply is still run through
 * the post-filter before a visitor sees it; this provider is not trusted on its
 * own.
 *
 * Nothing here logs the visitor's message or the model's reply.
 */

const NOT_CONFIDENT: ProviderResult = { confident: false, instruction: '', landmarkUsed: null };

/** `landmarkUsed` is "" rather than null so the schema stays a plain string field. */
const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    confident: {
      type: 'boolean',
      description: 'True only if an approved landmark in the message locates the visitor on the route.',
    },
    instruction: {
      type: 'string',
      description: 'One recovery instruction, quoting the approved step. Empty when not confident.',
    },
    landmarkUsed: {
      type: 'string',
      description: 'The approved landmark the visitor named, copied exactly. Empty string if none.',
    },
  },
  required: ['confident', 'instruction', 'landmarkUsed'],
  additionalProperties: false,
} as const;

const ResultSchema = z.object({
  confident: z.boolean(),
  instruction: z.string(),
  landmarkUsed: z.string(),
});

function systemPrompt(ctx: AssistContext): string {
  const steps = ctx.steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
  const landmarks = ctx.landmarks.map((l) => `- ${l}`).join('\n');

  return [
    'You help a hospital visitor who is following a pre-approved walking route and has become lost.',
    '',
    `Route: ${ctx.origin} to ${ctx.destination}`,
    'Approved steps:',
    steps,
    '',
    'Approved landmarks:',
    landmarks,
    '',
    'Rules:',
    '- These steps and landmarks are the only places you know. Never mention any other floor, elevator, corridor, door, or department.',
    '- You cannot see the visitor and have no location data. Never claim to know where they are.',
    '- Work only from a landmark the visitor names. If they name none of the approved landmarks, set confident to false.',
    '- When confident, give exactly one instruction: the single next approved step, quoted from the list above.',
    '- Never answer questions about people, medical matters, appointments, or anything other than this route. Set confident to false instead.',
    '- If you are unsure at all, set confident to false. Being unsure is safe; guessing is not.',
  ].join('\n');
}

export class ClaudeAssistProvider implements AssistProvider {
  readonly name = 'claude';
  private client: Anthropic;
  private model: string;

  constructor(client = new Anthropic(), model = process.env.CAREPATH_ASSIST_MODEL ?? 'claude-opus-5') {
    this.client = client;
    this.model = model;
  }

  async respond(ctx: AssistContext, message: string): Promise<ProviderResult> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 16000,
      system: systemPrompt(ctx),
      // `low` keeps latency down for a visitor standing in a corridor. Thinking
      // stays on: disabling it on Opus 5 risks tool-call and tag leakage into
      // the visible text, and low effort already cuts the token spend.
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: OUTPUT_SCHEMA },
      },
      messages: [{ role: 'user', content: message }],
    });

    // Safety classifiers can decline; content is empty or partial when they do.
    if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') {
      return NOT_CONFIDENT;
    }

    const text = response.content.find((block) => block.type === 'text')?.text;
    if (!text) return NOT_CONFIDENT;

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return NOT_CONFIDENT;
    }

    const result = ResultSchema.safeParse(parsed);
    if (!result.success) return NOT_CONFIDENT;

    return {
      confident: result.data.confident,
      instruction: result.data.instruction,
      landmarkUsed: result.data.landmarkUsed || null,
    };
  }
}
