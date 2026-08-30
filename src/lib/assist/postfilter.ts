import { normalize } from '../catalog';
import type { AssistContext, ProviderResult } from './types';

/**
 * Last line of defence. A provider result is only shown to the visitor if it is
 * traceable back to this pass's approved route. Anything else is discarded in
 * favour of the "call the front desk" fallback.
 *
 * The threat model is inventing *places* — a floor, elevator, or department
 * that doesn't exist — not unusual phrasing. So the check is: any word that
 * names a location must already appear in this pass's approved text.
 */

const LOCATION_CLAIMS =
  /\b(i can see you|i see you|your (current |live )?location|you are currently at|gps|tracking you|i know where you are|based on your (position|location)|according to your location)\b/i;

/**
 * Words that name a place or a spatial index. If one of these appears in a
 * reply but not in the approved route, the model has introduced somewhere the
 * catalog never approved.
 */
const PLACE_WORDS = new RegExp(
  '\\b(' +
    [
      'floor',
      'level',
      'basement',
      'mezzanine',
      'elevator',
      'elevators',
      'lift',
      'lifts',
      'escalator',
      'stair',
      'stairs',
      'staircase',
      'stairwell',
      'wing',
      'tower',
      'annex',
      'pavilion',
      'building',
      'block',
      'corridor',
      'hallway',
      'hall',
      'lobby',
      'atrium',
      'entrance',
      'exit',
      'door',
      'doors',
      'doorway',
      'gate',
      'desk',
      'reception',
      'counter',
      'window',
      'kiosk',
      'room',
      'suite',
      'ward',
      'clinic',
      'department',
      'centre',
      'center',
      'unit',
      'office',
      'bridge',
      'tunnel',
      'walkway',
      'skybridge',
      'ramp',
      'courtyard',
      'parking',
      'garage',
      'cafeteria',
      'canteen',
      'chapel',
      'pharmacy',
      'imaging',
      'radiology',
      'laboratory',
      'lab',
      'cardiology',
      'oncology',
      'pediatrics',
      'ophthalmology',
      'admissions',
      'billing',
      'emergency',
      'surgery',
      'mri',
      'north',
      'south',
      'east',
      'west',
    ].join('|') +
    ')\\b',
  'gi',
);

/** Colours and ordinals are how landmarks get faked: "the red sign", "the third door". */
const QUALIFIER_WORDS =
  /\b(red|orange|yellow|green|blue|purple|pink|brown|black|white|grey|gray|gold|silver|first|second|third|fourth|fifth|sixth|1st|2nd|3rd|4th|5th|6th)\b/gi;

export interface PostFilterResult {
  accepted: boolean;
  reason?: string;
}

export function postFilter(ctx: AssistContext, result: ProviderResult): PostFilterResult {
  if (!result.confident) return { accepted: false, reason: 'provider_not_confident' };

  const instruction = result.instruction.trim();
  if (!instruction) return { accepted: false, reason: 'empty_instruction' };
  if (instruction.length > 400) return { accepted: false, reason: 'too_long' };

  // Must never claim to know the visitor's live location.
  if (LOCATION_CLAIMS.test(instruction)) return { accepted: false, reason: 'location_claim' };

  // The landmark it keyed off must be one of ours.
  if (result.landmarkUsed) {
    const approved = ctx.landmarks.some((l) => normalize(l) === normalize(result.landmarkUsed!));
    if (!approved) return { accepted: false, reason: 'unapproved_landmark' };
  }

  const vocabulary = buildVocabulary(ctx);
  const normalized = normalize(instruction);

  const offRoute = [
    ...collect(normalized, PLACE_WORDS),
    ...collect(normalized, QUALIFIER_WORDS),
    // Bare numbers: floor numbers, room numbers, elevator letters-as-digits.
    ...(normalized.match(/\b\d+\b/g) ?? []),
  ].filter((word) => !vocabulary.has(word.toLowerCase()));

  if (offRoute.length > 0) {
    return { accepted: false, reason: `off_route_terms:${[...new Set(offRoute)].slice(0, 5).join(',')}` };
  }

  // A reply that names no approved landmark at all isn't grounded in the route.
  const mentionsSomething = ctx.landmarks.some((l) => normalized.includes(normalize(l))) ||
    ctx.steps.some((s) => overlapsSubstantially(normalized, normalize(s))) ||
    normalized.includes(normalize(ctx.destination));

  if (!mentionsSomething) return { accepted: false, reason: 'ungrounded' };

  return { accepted: true };
}

function collect(text: string, pattern: RegExp): string[] {
  pattern.lastIndex = 0;
  return text.match(pattern) ?? [];
}

function buildVocabulary(ctx: AssistContext): Set<string> {
  const source = [ctx.destination, ctx.origin, ...ctx.steps, ...ctx.landmarks].join(' ');
  const words = normalize(source).split(' ').filter(Boolean);
  // Index hyphenated tokens under their parts too ("check-in" -> "check", "in").
  const set = new Set(words);
  for (const word of words) {
    if (word.includes('-')) word.split('-').forEach((p) => p && set.add(p));
  }
  return set;
}

/** True if most of an approved step's distinctive words appear in the reply. */
function overlapsSubstantially(reply: string, step: string): boolean {
  const stepWords = step.split(' ').filter((w) => w.length > 3);
  if (stepWords.length === 0) return false;
  const hits = stepWords.filter((w) => reply.includes(w)).length;
  return hits / stepWords.length >= 0.6;
}
