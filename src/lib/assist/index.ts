import { EMERGENCY_RESPONSE, guardMessage, refusalFor } from './guard';
import { postFilter } from './postfilter';
import { RulesAssistProvider } from './rules';
import { uncertainReply } from './types';
import type { AssistContext, AssistProvider, AssistResponse } from './types';

export * from './types';
export { guardMessage, MAX_MESSAGE_LENGTH } from './guard';
export { postFilter } from './postfilter';
export { RulesAssistProvider } from './rules';

let cached: AssistProvider | null = null;

export async function selectProvider(): Promise<AssistProvider> {
  if (cached) return cached;

  if (process.env.CAREPATH_ASSIST_PROVIDER === 'claude') {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('CAREPATH_ASSIST_PROVIDER=claude but ANTHROPIC_API_KEY is not set');
    }
    // Imported lazily so the deterministic default never loads the SDK.
    const { ClaudeAssistProvider } = await import('./claude');
    cached = new ClaudeAssistProvider();
  } else {
    cached = new RulesAssistProvider();
  }
  return cached;
}

/**
 * The whole lost-help pipeline: guard, provider, post-filter. Every path that
 * isn't a confidently grounded instruction ends at the same "call the front
 * desk" reply.
 */
export async function assist(
  ctx: AssistContext,
  rawMessage: string,
  override?: AssistProvider,
): Promise<AssistResponse> {
  const verdict = guardMessage(rawMessage, ctx);

  switch (verdict.kind) {
    case 'emergency':
      return { outcome: 'emergency', reply: EMERGENCY_RESPONSE };
    case 'out_of_scope':
      return { outcome: 'refused', reply: refusalFor(verdict.category) };
    case 'empty':
      return { outcome: 'refused', reply: 'Tell me a sign, door, or landmark you can see right now.' };
    case 'too_long':
      return {
        outcome: 'refused',
        reply: 'That is a bit long for me. In a few words, what sign or landmark can you see?',
      };
  }

  let result;
  try {
    const provider = override ?? (await selectProvider());
    result = await provider.respond(ctx, verdict.message);
  } catch {
    // A provider outage must never leave the visitor without the phone fallback.
    return { outcome: 'uncertain', reply: uncertainReply(ctx.publicId) };
  }

  const check = postFilter(ctx, result);
  if (!check.accepted) {
    return { outcome: 'uncertain', reply: uncertainReply(ctx.publicId) };
  }

  return { outcome: 'answered', reply: result.instruction.trim() };
}
