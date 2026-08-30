export interface AssistContext {
  publicId: string;
  origin: string;
  destination: string;
  steps: string[];
  landmarks: string[];
}

/** What a provider returns before post-filtering. */
export interface ProviderResult {
  confident: boolean;
  /** One recovery instruction. Empty when not confident. */
  instruction: string;
  /** Which approved landmark the provider believed the visitor is at. */
  landmarkUsed: string | null;
}

export interface AssistProvider {
  readonly name: string;
  respond(ctx: AssistContext, message: string): Promise<ProviderResult>;
}

export type AssistOutcome = 'answered' | 'uncertain' | 'refused' | 'emergency';

export interface AssistResponse {
  outcome: AssistOutcome;
  reply: string;
}

/** The exact fallback the design specifies, parameterised by CarePath ID. */
export function uncertainReply(publicId: string): string {
  return `I'm not certain where you are. Please call the front desk and give them your CarePath ID: ${publicId}.`;
}
