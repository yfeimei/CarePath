import { normalize } from '../catalog';
import type { AssistContext } from './types';

/**
 * Pre-filter for the lost-help endpoint.
 *
 * This runs BEFORE any provider is consulted, so out-of-scope text never leaves
 * the server. It is intentionally blunt: over-refusing costs a visitor one
 * phone call, under-refusing sends medical text to a third party.
 *
 * The one place it is *not* blunt is where the filters collide with the route
 * catalog. Real hospital destinations are called things like "Surgery Check-In",
 * "Patient Billing Office", and "Medical Records" — a naive keyword filter
 * refuses a visitor for naming the very place they were sent to. So a category
 * match is ignored when every word of the matched phrase already appears in
 * *this pass's* approved route text. See `matchIsOnRoute`.
 */

export const MAX_MESSAGE_LENGTH = 280;

export type GuardVerdict =
  | { kind: 'ok'; message: string }
  | { kind: 'emergency' }
  | { kind: 'too_long' }
  | { kind: 'empty' }
  | { kind: 'out_of_scope'; category: OutOfScopeCategory };

export type OutOfScopeCategory = 'patient' | 'medical' | 'admin' | 'contact_details' | 'unrelated';

/** Never the name of a place. Always an emergency, whatever the route says. */
const HARD_EMERGENCY =
  /\b(911|999|112|chest pain|can'?t breathe|cannot breathe|not breathing|bleeding|blood everywhere|unconscious|passed out|collapsed|collapsing|stroke|heart attack|cardiac arrest|choking|seizure|overdose|suicid\w*|dying|code blue)\b/i;

/**
 * "Emergency" is ambiguous: it is also a department, a sign, and an entrance.
 * Treated as an emergency unless this pass's own route uses the word.
 */
const SOFT_EMERGENCY = /\b(emergency|emergencies)\b/i;

/** Relationship words never appear in a landmark, so these are never excused. */
const RELATIONS =
  /\b(my|our|his|her|their)\s+(mother|mom|mum|father|dad|wife|husband|spouse|partner|son|daughter|child|kid|baby|brother|sister|grandmother|grandma|grandfather|grandpa|aunt|uncle|friend|doctor|surgeon|nurse)\b/i;

const PATIENT =
  /\b(patient|room number|room \d+|bed \d+|ward \d+|mrn|medical record number|date of birth|d\.?o\.?b\.?|social security|ssn|next of kin|discharged?|admitted|visiting hours|is (he|she|they) (ok|okay|alright|out of surgery))\b/i;

const MEDICAL =
  /\b(diagnos\w*|symptom\w*|medicat\w*|prescription\w*|dosage|doses|surgery|operation|biops\w+|blood pressure|test results?|lab results?|scan results?|nause\w+|dizz\w+|fever|infection|cancer|tumou?rs?|pregnan\w*|allerg\w+|insulin|chemo\w*|antibiotics?|should i take|is it safe to|side effects?)\b/i;

const ADMIN =
  /\b(appointments?|reschedul\w+|cancel my|bills?|billing|invoices?|copay|co-pay|deductible|insurance|claims?|refunds?|medical records?|my chart|referrals?|prior authorization)\b/i;

/** Phone numbers, emails, long digit runs. Never a landmark; never excused. */
const CONTACT_DETAILS = /(\+?\d[\d\s().-]{8,}\d)|([\w.+-]+@[\w-]+\.[a-z]{2,})|\b\d{5,}\b/i;

/**
 * Something spatial in the message. Deliberately excludes bare "at" and "by",
 * which match almost any sentence ("my surgery is at 3pm").
 */
const WAYFINDING_HINT =
  /\b(near|nearby|next to|beside|in front of|behind|across from|opposite|outside|inside|left|right|straight|forward|back|floors?|levels?|elevators?|lifts?|escalators?|stair\w*|halls?|hallways?|corridors?|doors?|doorways?|gates?|desks?|counters?|windows?|kiosks?|rooms?|signs?|walls?|paint\w*|pictures?|murals?|lobby|atrium|entrances?|exits?|wings?|ramps?|shops?|areas?|reception|waiting|corner|end of|line|arrow|maps?|see|seeing|saw|looking|look|lost|where|which way|turn\w*|walk\w*|went|came|got off|get off|passed|past|standing|stuck|i'?m at|i am at)\b/i;

export function guardMessage(raw: string, ctx?: AssistContext): GuardVerdict {
  const message = raw.trim().replace(/\s+/g, ' ');

  if (!message) return { kind: 'empty' };
  if (message.length > MAX_MESSAGE_LENGTH) return { kind: 'too_long' };

  const normalized = normalize(message);
  const vocabulary = routeVocabulary(ctx);

  // Emergencies outrank everything, so that "chest pain" is handled as an
  // emergency rather than filed away as a medical question.
  if (HARD_EMERGENCY.test(message)) return { kind: 'emergency' };
  const soft = SOFT_EMERGENCY.exec(message);
  if (soft && !matchIsOnRoute(message, soft[0], vocabulary)) return { kind: 'emergency' };

  if (RELATIONS.test(message)) return { kind: 'out_of_scope', category: 'patient' };

  const categories: Array<[RegExp, OutOfScopeCategory]> = [
    [PATIENT, 'patient'],
    [MEDICAL, 'medical'],
    [ADMIN, 'admin'],
  ];
  for (const [pattern, category] of categories) {
    const hit = pattern.exec(message);
    if (hit && !matchIsOnRoute(message, hit[0], vocabulary)) return { kind: 'out_of_scope', category };
  }

  if (CONTACT_DETAILS.test(message)) return { kind: 'out_of_scope', category: 'contact_details' };

  // Nothing spatial and no approved landmark named — not a wayfinding question.
  const namesLandmark = (ctx?.landmarks ?? []).some((l) => normalized.includes(normalize(l)));
  if (!namesLandmark && !WAYFINDING_HINT.test(message)) {
    return { kind: 'out_of_scope', category: 'unrelated' };
  }

  return { kind: 'ok', message };
}

/** Every word of this pass's approved route text. Empty when there's no context. */
function routeVocabulary(ctx?: AssistContext): Set<string> {
  if (!ctx) return new Set();
  const source = [ctx.destination, ctx.origin, ...ctx.landmarks].join(' ');
  return new Set(normalize(source).split(' ').filter(Boolean));
}

/**
 * True when the flagged phrase reads as part of a place name on *this* route,
 * rather than as a medical or admin question that happens to share a word.
 *
 * Two conditions, and the second is what makes this safe: every word of the
 * match must be in the route's vocabulary, AND the match must sit next to
 * another approved word in the message. So "Patient Billing Office" is a place,
 * while "patient Jane Doe" is not — even though both are on the billing route.
 */
function matchIsOnRoute(message: string, matched: string, vocabulary: Set<string>): boolean {
  if (vocabulary.size === 0) return false;

  const words = normalize(matched).split(' ').filter(Boolean);
  if (words.length === 0 || !words.every((word) => vocabulary.has(word))) return false;

  const messageWords = normalize(message).split(' ').filter(Boolean);
  const start = indexOfSequence(messageWords, words);
  if (start === -1) return false; // normalization disagreed — refuse, don't guess

  const before = messageWords[start - 1];
  const after = messageWords[start + words.length];
  return (before !== undefined && vocabulary.has(before)) || (after !== undefined && vocabulary.has(after));
}

function indexOfSequence(haystack: string[], needle: string[]): number {
  for (let i = 0; i + needle.length <= haystack.length; i++) {
    if (needle.every((word, offset) => haystack[i + offset] === word)) return i;
  }
  return -1;
}

export function refusalFor(category: OutOfScopeCategory): string {
  switch (category) {
    case 'patient':
      return "I can only help with directions along your CarePath. I can't look up any information about a person. Please ask the front desk.";
    case 'medical':
      return "I can only help with directions along your CarePath. I can't give any medical information or advice. Please speak to hospital staff.";
    case 'admin':
      return "I can only help with directions along your CarePath. For appointments, billing, or records, please call the front desk.";
    case 'contact_details':
      return "Please don't enter names, phone numbers, or any personal details. Just tell me a sign or landmark you can see.";
    case 'unrelated':
      return "I can only help you find your way along your CarePath. Tell me a sign, door, or landmark you can see right now.";
  }
}

export const EMERGENCY_RESPONSE =
  'If this is a medical emergency, call 911 now, or go to the nearest staff member or the Emergency Department entrance. I cannot help with emergencies.';
