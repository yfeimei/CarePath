import { z } from 'zod';
import rawCatalog from '../../data/routes.json';

/**
 * The route catalog is the source of truth. Speech recognition is only a
 * convenience for *choosing* one of these entries — it never produces a route.
 */

const RouteSchema = z.object({
  id: z.string().min(1),
  origin: z.string().min(1),
  destination: z.string().min(1),
  aliases: z.array(z.string().min(1)),
  steps: z.array(z.string().min(1)).min(1),
  landmarks: z.array(z.string().min(1)).min(1),
});

const CatalogSchema = z.object({
  version: z.string().min(1),
  routes: z.array(RouteSchema).min(1),
});

export type Route = z.infer<typeof RouteSchema>;

function loadCatalog() {
  const parsed = CatalogSchema.safeParse(rawCatalog);
  if (!parsed.success) {
    // Fail at load time, not in front of a visitor.
    throw new Error(`Invalid route catalog: ${parsed.error.message}`);
  }
  const ids = new Set<string>();
  for (const route of parsed.data.routes) {
    if (ids.has(route.id)) throw new Error(`Duplicate route id: ${route.id}`);
    ids.add(route.id);
  }
  return parsed.data;
}

const catalog = loadCatalog();

export const CATALOG_VERSION = catalog.version;
export const ROUTES: readonly Route[] = Object.freeze(catalog.routes);

export function getRoute(id: string): Route | null {
  return ROUTES.find((r) => r.id === id) ?? null;
}

/** Destinations for the receptionist's manual-selection dropdown. */
export function destinationOptions(): Array<{ id: string; origin: string; destination: string }> {
  return ROUTES.map((r) => ({ id: r.id, origin: r.origin, destination: r.destination })).sort((a, b) =>
    a.destination.localeCompare(b.destination),
  );
}

// --- Speech / text matching -------------------------------------------------

const FILLER = [
  'directions to',
  'directions for',
  'take me to',
  'i need to get to',
  'i need to go to',
  'how do i get to',
  'how do we get to',
  'where is the',
  'where is',
  'go to',
  'the ',
];

export function normalize(text: string): string {
  let out = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Strip leading conversational filler, repeatedly ("uh, directions to the lab").
  let changed = true;
  while (changed) {
    changed = false;
    for (const f of FILLER) {
      if (out.startsWith(f)) {
        out = out.slice(f.length).trim();
        changed = true;
      }
    }
  }
  return out;
}

function tokens(text: string): string[] {
  return normalize(text).split(' ').filter(Boolean);
}

export interface MatchCandidate {
  route: Route;
  score: number;
}

/**
 * Score a transcript against every approved destination. Deliberately returns a
 * ranked list rather than a single answer: the receptionist confirms the pick.
 */
export function matchDestination(transcript: string): MatchCandidate[] {
  const query = normalize(transcript);
  if (!query) return [];
  const queryTokens = new Set(tokens(transcript));

  const candidates = ROUTES.map((route) => {
    const phrases = [route.destination, ...route.aliases];
    let best = 0;

    for (const phrase of phrases) {
      const norm = normalize(phrase);
      if (!norm) continue;

      if (query === norm) {
        best = Math.max(best, 1);
        continue;
      }
      if (query.includes(norm)) {
        // Longer matched phrases are stronger evidence than incidental short ones.
        best = Math.max(best, 0.75 + Math.min(0.2, norm.length / 100));
        continue;
      }
      if (norm.includes(query)) {
        best = Math.max(best, 0.6 + Math.min(0.2, query.length / 100));
        continue;
      }

      const phraseTokens = tokens(phrase);
      if (phraseTokens.length === 0) continue;
      const overlap = phraseTokens.filter((t) => queryTokens.has(t)).length;
      if (overlap > 0) {
        const union = new Set([...phraseTokens, ...queryTokens]).size;
        best = Math.max(best, 0.55 * (overlap / union));
      }
    }

    return { route, score: best };
  });

  return candidates.filter((c) => c.score > 0).sort((a, b) => b.score - a.score);
}

/** Confidence floor below which the desk page shows "no confident match". */
export const MATCH_CONFIDENCE_THRESHOLD = 0.5;
