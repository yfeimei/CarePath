import { normalize } from '../catalog';
import type { AssistContext, AssistProvider, ProviderResult } from './types';

const NOT_CONFIDENT: ProviderResult = { confident: false, instruction: '', landmarkUsed: null };

/**
 * "the Information Desk" but "Elevator B". The approved steps are written in
 * proper English, so rather than guess, read the article back out of them.
 */
function withArticle(landmark: string, steps: string[]): string {
  const needle = normalize(landmark);
  const takesArticle = steps.some((step) => normalize(step).includes(`the ${needle}`));
  return takesArticle ? `the ${landmark}` : landmark;
}

/**
 * Deterministic recovery: find the approved landmark the visitor named, locate
 * the step that mentions it, and hand back the next step. No network, no key,
 * and structurally incapable of inventing a route — which is why it's the
 * default provider for the demo.
 */
export class RulesAssistProvider implements AssistProvider {
  readonly name = 'rules';

  async respond(ctx: AssistContext, message: string): Promise<ProviderResult> {
    const haystack = normalize(message);

    // Prefer the longest matching landmark: "Imaging check-in" over "Imaging".
    const matches = ctx.landmarks
      .filter((landmark) => {
        const needle = normalize(landmark);
        return needle.length > 2 && haystack.includes(needle);
      })
      .sort((a, b) => b.length - a.length);

    const landmark = matches[0];
    if (!landmark) return NOT_CONFIDENT;

    const stepIndex = ctx.steps.findIndex((step) => normalize(step).includes(normalize(landmark)));

    // Landmark is approved but appears in no step (e.g. it's the destination
    // marker itself) — treat the visitor as having arrived.
    // Phrased as a condition on what the visitor reported, never as a claim
    // about where they actually are.
    const named = withArticle(landmark, ctx.steps);

    if (stepIndex === -1) {
      return {
        confident: true,
        instruction: `If you can see ${named}, you have arrived at ${ctx.destination}. Check in there.`,
        landmarkUsed: landmark,
      };
    }

    const next = ctx.steps[stepIndex + 1];
    if (!next) {
      return {
        confident: true,
        instruction: `If you can see ${named}, you are at the last step of your route: ${ctx.steps[stepIndex]} That is ${ctx.destination}.`,
        landmarkUsed: landmark,
      };
    }

    return {
      confident: true,
      instruction: `If you can see ${named}, your next step is: ${next}`,
      landmarkUsed: landmark,
    };
  }
}
