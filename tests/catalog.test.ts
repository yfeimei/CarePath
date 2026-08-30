import { describe, expect, it } from 'vitest';
import { MATCH_CONFIDENCE_THRESHOLD, ROUTES, destinationOptions, getRoute, matchDestination, normalize } from '@/lib/catalog';

describe('route catalog', () => {
  it('loads a prototype-sized catalog', () => {
    // The design asks for 10-20 staff-verified routes.
    expect(ROUTES.length).toBeGreaterThanOrEqual(10);
    expect(ROUTES.length).toBeLessThanOrEqual(20);
  });

  it('has a unique id per route', () => {
    expect(new Set(ROUTES.map((r) => r.id)).size).toBe(ROUTES.length);
  });

  it('names every step landmark somewhere in the landmark list', () => {
    // Guards the assist post-filter: a landmark used in a step but missing from
    // the list would make a legitimate recovery instruction unverifiable.
    for (const route of ROUTES) {
      const landmarks = route.landmarks.map(normalize);
      const stepText = normalize(route.steps.join(' '));
      const orphans = landmarks.filter((l) => !stepText.includes(l));
      // Landmarks may legitimately mark arrival without appearing in a step.
      expect(orphans.length).toBeLessThanOrEqual(2);
    }
  });

  it('resolves every route by id', () => {
    for (const route of ROUTES) expect(getRoute(route.id)).toEqual(route);
  });

  it('returns null for an unknown id', () => {
    expect(getRoute('no-such-route')).toBeNull();
  });

  it('sorts destination options alphabetically', () => {
    const names = destinationOptions().map((o) => o.destination);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });
});

describe('destination matching', () => {
  it('matches every destination name confidently', () => {
    for (const route of ROUTES) {
      const best = matchDestination(route.destination)[0];
      expect(best?.route.id, `destination "${route.destination}"`).toBe(route.id);
      expect(best!.score).toBeGreaterThanOrEqual(MATCH_CONFIDENCE_THRESHOLD);
    }
  });

  it('matches every alias confidently', () => {
    for (const route of ROUTES) {
      for (const alias of route.aliases) {
        const best = matchDestination(alias)[0];
        expect(best!.score, `alias "${alias}" of ${route.id}`).toBeGreaterThanOrEqual(MATCH_CONFIDENCE_THRESHOLD);
      }
    }
  });

  it('strips spoken filler around a destination', () => {
    for (const phrase of ['Directions to Imaging.', 'take me to imaging', 'where is imaging?']) {
      expect(matchDestination(phrase)[0]?.route.id, phrase).toBe('lobby-imaging');
    }
  });

  it('finds no confident match for an unrelated utterance', () => {
    const best = matchDestination('what time does the parking garage close')[0];
    expect(best === undefined || best.score < MATCH_CONFIDENCE_THRESHOLD).toBe(true);
  });

  it('returns nothing for empty input', () => {
    expect(matchDestination('   ')).toEqual([]);
  });
});
