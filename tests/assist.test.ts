import { describe, expect, it } from 'vitest';
import { assist, postFilter } from '@/lib/assist';
import { guardMessage } from '@/lib/assist/guard';
import { RulesAssistProvider } from '@/lib/assist/rules';
import type { AssistContext, AssistProvider, ProviderResult } from '@/lib/assist/types';
import { getRoute } from '@/lib/catalog';

const route = getRoute('lobby-imaging')!;

const ctx: AssistContext = {
  publicId: 'RP-4821',
  origin: route.origin,
  destination: route.destination,
  steps: route.steps,
  landmarks: route.landmarks,
};

function stub(result: ProviderResult): AssistProvider {
  return { name: 'stub', respond: async () => result };
}

const rules = new RulesAssistProvider();

describe('guard', () => {
  it('accepts a plain landmark report', () => {
    expect(guardMessage('I am near Elevator B').kind).toBe('ok');
  });

  it('treats emergencies as emergencies, not as medical questions', () => {
    for (const message of ['my husband has chest pain', 'someone collapsed near the elevator', 'I cannot breathe']) {
      expect(guardMessage(message).kind, message).toBe('emergency');
    }
  });

  it('refuses questions about people', () => {
    for (const message of [
      'what room is patient John Smith in',
      'is my mother out of surgery yet',
      'which bed 12 is my father in',
    ]) {
      const verdict = guardMessage(message, ctx);
      expect(verdict.kind, message).toBe('out_of_scope');
      if (verdict.kind === 'out_of_scope') expect(verdict.category).toBe('patient');
    }
  });

  it('refuses medical questions', () => {
    for (const message of ['should I take my medication before the scan', 'what does my diagnosis mean']) {
      const verdict = guardMessage(message);
      expect(verdict.kind, message).toBe('out_of_scope');
      if (verdict.kind === 'out_of_scope') expect(verdict.category).toBe('medical');
    }
  });

  it('refuses appointments, billing, and records', () => {
    for (const message of ['can I reschedule my appointment', 'how much is my bill for the elevator floor']) {
      const verdict = guardMessage(message);
      expect(verdict.kind, message).toBe('out_of_scope');
      if (verdict.kind === 'out_of_scope') expect(verdict.category).toBe('admin');
    }
  });

  it('refuses messages carrying contact details', () => {
    const verdict = guardMessage('near the elevator, call me on 555 010 0199');
    expect(verdict.kind).toBe('out_of_scope');
    if (verdict.kind === 'out_of_scope') expect(verdict.category).toBe('contact_details');
  });

  it('refuses unrelated chatter', () => {
    const verdict = guardMessage('who won the football last night');
    expect(verdict.kind).toBe('out_of_scope');
    if (verdict.kind === 'out_of_scope') expect(verdict.category).toBe('unrelated');
  });

  it('rejects empty and over-long input', () => {
    expect(guardMessage('   ').kind).toBe('empty');
    expect(guardMessage('elevator '.repeat(100)).kind).toBe('too_long');
  });

  it('accepts the most natural phrasings of a landmark report', () => {
    for (const message of [
      'I can see the blue mural',
      'I just got off Elevator B',
      'I am standing by the Information Desk',
      'there is a sign for Imaging',
      'which way now, I passed the mural',
    ]) {
      expect(guardMessage(message, ctx).kind, message).toBe('ok');
    }
  });
});

describe('guard vs. the route catalog', () => {
  // Real destinations are named things like "Surgery Check-In" and "Patient
  // Billing Office". A keyword filter must not refuse a visitor for naming the
  // place they were sent to — but must still refuse the same word off-route.
  const cases: Array<{ routeId: string; allowed: string; refusedElsewhere: string }> = [
    { routeId: 'lobby-preop', allowed: "I'm at the Surgery Check-In desk", refusedElsewhere: 'medical' },
    { routeId: 'lobby-billing', allowed: 'I can see the Patient Billing Office', refusedElsewhere: 'patient' },
    { routeId: 'lobby-medical-records', allowed: 'I am near the Medical Records door', refusedElsewhere: 'admin' },
    { routeId: 'lobby-ed-registration', allowed: 'I can see the red EMERGENCY sign', refusedElsewhere: 'emergency' },
  ];

  for (const testCase of cases) {
    const route = getRoute(testCase.routeId)!;
    const onRoute: AssistContext = { ...ctx, ...route };

    it(`allows "${testCase.allowed}" on the ${route.destination} route`, () => {
      expect(guardMessage(testCase.allowed, onRoute).kind).toBe('ok');
    });

    it(`still refuses it on an unrelated route`, () => {
      const verdict = guardMessage(testCase.allowed, ctx);
      expect(verdict.kind).not.toBe('ok');
    });
  }

  it('does not let an on-route word smuggle a real medical question through', () => {
    const preop: AssistContext = { ...ctx, ...getRoute('lobby-preop')! };
    // "surgery" is on this route, but neither message is a location report.
    expect(guardMessage('what time is my surgery scheduled', preop).kind).toBe('out_of_scope');
    expect(guardMessage('is my mother out of surgery', preop).kind).toBe('out_of_scope');
  });

  it('needs an adjacent approved word, not just a shared one', () => {
    // "patient" belongs to this route's own destination, which is exactly why a
    // word-level check alone would let a patient name through to the provider.
    const billing: AssistContext = { ...ctx, ...getRoute('lobby-billing')! };

    const named = guardMessage('what room is patient Jane Doe in', billing);
    expect(named.kind).toBe('out_of_scope');
    if (named.kind === 'out_of_scope') expect(named.category).toBe('patient');

    expect(guardMessage('I can see the Patient Billing Office', billing).kind).toBe('ok');
  });

  it('still treats an unambiguous emergency as one on the emergency route', () => {
    const ed: AssistContext = { ...ctx, ...getRoute('lobby-ed-registration')! };
    expect(guardMessage('someone collapsed by the walkway', ed).kind).toBe('emergency');
    expect(guardMessage('my husband has chest pain', ed).kind).toBe('emergency');
  });
});

describe('rules provider', () => {
  it('gives the next approved step after a named landmark', async () => {
    const result = await rules.respond(ctx, 'I am near the blue mural');
    expect(result.confident).toBe(true);
    expect(result.landmarkUsed).toBe('Blue mural');
    expect(result.instruction).toContain('Take Elevator B to Floor 2.');
  });

  it('takes the article from the approved step wording', async () => {
    // "the Information Desk" — the step says "past the Information Desk".
    const desk = await rules.respond(ctx, 'I can see the information desk');
    expect(desk.instruction).toContain('the Information Desk');

    // "Elevator B" — the step says "Take Elevator B", with no article.
    const elevator = await rules.respond(ctx, 'I just got out of Elevator B');
    expect(elevator.instruction).toContain('see Elevator B');
    expect(elevator.instruction).not.toContain('the Elevator B');
  });

  it('conditions on what the visitor reported instead of asserting their location', async () => {
    const result = await rules.respond(ctx, 'I am near the blue mural');
    expect(result.instruction).toMatch(/^If you can see /);
  });

  it('prefers the more specific of two overlapping landmarks', async () => {
    const result = await rules.respond(ctx, 'I can see the Imaging check-in desk');
    expect(result.landmarkUsed).toBe('Imaging check-in');
  });

  it('is not confident about a landmark that is not on this route', async () => {
    const result = await rules.respond(ctx, 'I am standing by the gift shop');
    expect(result.confident).toBe(false);
  });
});

describe('post-filter', () => {
  it('accepts an instruction quoted from the approved steps', () => {
    expect(
      postFilter(ctx, {
        confident: true,
        instruction: 'If you can see the Blue mural, your next step is: Take Elevator B to Floor 2.',
        landmarkUsed: 'Blue mural',
      }).accepted,
    ).toBe(true);
  });

  it('rejects an invented place', () => {
    const check = postFilter(ctx, {
      confident: true,
      instruction: 'Take Elevator D to Floor 7 and turn at the red sign.',
      landmarkUsed: 'Blue mural',
    });
    expect(check.accepted).toBe(false);
    expect(check.reason).toMatch(/off_route_terms/);
  });

  it('rejects a claim to know the visitor location', () => {
    const check = postFilter(ctx, {
      confident: true,
      instruction: 'I can see you are at the Information Desk. Turn left at the blue mural.',
      landmarkUsed: 'Information Desk',
    });
    expect(check.accepted).toBe(false);
    expect(check.reason).toBe('location_claim');
  });

  it('rejects a landmark that is not on this pass', () => {
    const check = postFilter(ctx, {
      confident: true,
      instruction: 'Turn left at the blue mural.',
      landmarkUsed: 'Gift shop',
    });
    expect(check.accepted).toBe(false);
    expect(check.reason).toBe('unapproved_landmark');
  });

  it('rejects an answer grounded in nothing', () => {
    const check = postFilter(ctx, {
      confident: true,
      instruction: 'Just keep going straight and you will get there.',
      landmarkUsed: null,
    });
    expect(check.accepted).toBe(false);
    expect(check.reason).toBe('ungrounded');
  });
});

describe('assist pipeline', () => {
  it('answers a good landmark report', async () => {
    const answer = await assist(ctx, 'I am near Elevator B', rules);
    expect(answer.outcome).toBe('answered');
    expect(answer.reply).toContain('Imaging check-in is on your right.');
  });

  it('falls back to the front desk for an unknown landmark', async () => {
    const answer = await assist(ctx, 'I am next to a vending machine', rules);
    expect(answer.outcome).toBe('uncertain');
    expect(answer.reply).toBe(
      "I'm not certain where you are. Please call the front desk and give them your CarePath ID: RP-4821.",
    );
  });

  it('never reaches the provider for an out-of-scope question', async () => {
    let called = false;
    const spy: AssistProvider = {
      name: 'spy',
      respond: async () => {
        called = true;
        return { confident: false, instruction: '', landmarkUsed: null };
      },
    };
    const answer = await assist(ctx, 'what room is my mother in', spy);
    expect(called).toBe(false);
    expect(answer.outcome).toBe('refused');
  });

  it('discards an invented route even when the provider is confident', async () => {
    const answer = await assist(
      ctx,
      'I am near Elevator B',
      stub({ confident: true, instruction: 'Take the skybridge to Tower C, Floor 9.', landmarkUsed: 'Elevator B' }),
    );
    expect(answer.outcome).toBe('uncertain');
    expect(answer.reply).toContain('RP-4821');
  });

  it('still gives the phone fallback when the provider throws', async () => {
    const broken: AssistProvider = {
      name: 'broken',
      respond: async () => {
        throw new Error('upstream down');
      },
    };
    const answer = await assist(ctx, 'I am near Elevator B', broken);
    expect(answer.outcome).toBe('uncertain');
    expect(answer.reply).toContain('RP-4821');
  });

  it('directs an emergency to 911 and staff', async () => {
    const answer = await assist(ctx, 'my husband has chest pain', rules);
    expect(answer.outcome).toBe('emergency');
    expect(answer.reply).toContain('911');
  });
});
