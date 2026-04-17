/**
 * Core systems-thinking concepts distilled from
 * Donella H. Meadows — "Thinking in Systems: A Primer" (2008).
 *
 * Kept intentionally short: each block is a quick-read reminder the user can
 * pull up while working in the Lab. Phrasing paraphrases Meadows rather than
 * quoting verbatim so no excerpt exceeds fair-use length.
 */

export type SystemsConcept = {
  id: string;
  title: string;
  summary: string;
  body: string[];
  tags: string[];
};

export const SYSTEMS_CONCEPTS: SystemsConcept[] = [
  {
    id: "system",
    title: "What is a system?",
    summary:
      "An interconnected set of elements organized so the whole achieves something.",
    body: [
      "A system is more than the sum of its parts. It is a set of elements connected in ways that produce a consistent pattern of behaviour over time, in service of some function or purpose.",
      "Three things make a system: elements (visible parts), interconnections (relationships and rules that tie them together) and a purpose or goal (often unstated, inferred from behaviour).",
      "Elements are usually the easiest to notice, but interconnections and purpose are what truly drive system behaviour — change them and you change the system most.",
    ],
    tags: ["system", "definition", "elements", "interconnections", "purpose", "whole"],
  },
  {
    id: "stocks",
    title: "Stocks",
    summary:
      "Accumulations — the memory of the system. Everything you can count, measure or weigh at a moment in time.",
    body: [
      "A stock is the foundation of any system: water in a bathtub, money in a bank, trees in a forest, trust in a team, books on a shelf.",
      "Stocks change only through flows — they are altered over time, not instantly. That is why systems have inertia and why change usually takes longer than we expect.",
      "Stocks act as buffers, delays and shock absorbers. They let inflows and outflows run at different rates without immediate breakdown.",
    ],
    tags: ["stock", "accumulation", "level", "state", "buffer", "memory"],
  },
  {
    id: "flows",
    title: "Flows",
    summary:
      "Rates of change. Inflows add to a stock, outflows take away from it.",
    body: [
      "A flow is the activity that changes a stock: water flowing in and draining out, births and deaths, hiring and firing, earning and spending.",
      "If total inflow exceeds total outflow, the stock rises. If outflow exceeds inflow, the stock falls. When they are equal the stock sits in dynamic equilibrium.",
      "You can often stabilise a runaway stock far more easily by reducing the inflow than by boosting the outflow — and vice versa.",
    ],
    tags: ["flow", "rate", "inflow", "outflow", "change", "dynamic equilibrium"],
  },
  {
    id: "feedback",
    title: "Feedback loops",
    summary:
      "A chain of causal connections that ties a stock back to its own flows.",
    body: [
      "A feedback loop forms when a stock's level influences the flows that change it. Feedback is the reason systems can regulate themselves — or spiral out of control.",
      "There are two basic kinds: balancing loops that stabilise, and reinforcing loops that amplify. Most interesting behaviour comes from their interaction.",
      "To understand behaviour, trace which loop is dominant at each moment and what could flip dominance between them.",
    ],
    tags: ["feedback", "loop", "causal", "circular"],
  },
  {
    id: "balancing",
    title: "Balancing (stabilising) feedback",
    summary:
      "Goal-seeking loops that push a stock toward a target or away from a threat.",
    body: [
      "A balancing loop keeps things steady: a thermostat heating a room, a body sweating to cool down, a company hiring to meet demand.",
      "Balancing loops need something to compare against — a goal, setpoint or reference level. They act whenever the stock drifts from that reference.",
      "They also have delays. Ignore the delay and the system overshoots; build in an anticipatory action and it tracks the goal more smoothly.",
    ],
    tags: ["balancing", "negative feedback", "stabilising", "goal", "setpoint", "thermostat"],
  },
  {
    id: "reinforcing",
    title: "Reinforcing (amplifying) feedback",
    summary:
      "Self-multiplying loops: the more you have, the more you get.",
    body: [
      "Reinforcing loops produce exponential growth or exponential collapse. Examples: compound interest, a viral infection, a rumour spreading, erosion cutting a gully deeper.",
      "Left unopposed, reinforcing loops always hit a limit — a resource runs out, a balancing loop catches up, or the system breaks.",
      "Look for places where success breeds success or failure breeds failure. That is where small interventions produce the biggest results, in both directions.",
    ],
    tags: ["reinforcing", "positive feedback", "exponential", "growth", "collapse", "amplifying"],
  },
  {
    id: "delays",
    title: "Delays",
    summary:
      "Time lags between cause and effect that cause oscillation and overshoot.",
    body: [
      "Every real system has delays: perception delays (seeing a change), decision delays (choosing what to do), action delays (doing it), and stock-adjustment delays (the physical time to change a stock).",
      "Delays in a balancing loop almost guarantee oscillation. Longer delays usually mean larger, slower swings.",
      "You cannot make a delay disappear, but you can often act on the trend rather than the current level to compensate for it.",
    ],
    tags: ["delay", "lag", "oscillation", "overshoot"],
  },
  {
    id: "dynamic-equilibrium",
    title: "Dynamic equilibrium",
    summary:
      "A stock that stays constant because inflows and outflows are matched.",
    body: [
      "Dynamic equilibrium is not stasis. Water still flows into and out of the tub; new employees still arrive and leave; calories still consumed and burned. The level just does not change.",
      "This is the 'working state' of most healthy systems. If one rate shifts, the stock rises or falls until a new equilibrium is found.",
    ],
    tags: ["equilibrium", "steady state", "balance"],
  },
  {
    id: "resilience",
    title: "Resilience",
    summary:
      "The ability of a system to bounce back after disturbance.",
    body: [
      "Resilience is not strength or constancy — it is elasticity: the capacity to absorb shocks and keep functioning.",
      "Resilience comes from having many balancing loops working at different scales, and from redundancy and meta-feedback (loops that repair loops).",
      "Systems optimised purely for efficiency usually lose resilience. You pay for robustness with a little slack.",
    ],
    tags: ["resilience", "robustness", "recovery", "elasticity"],
  },
  {
    id: "self-organization",
    title: "Self-organisation",
    summary:
      "The capacity of a system to change its own structure.",
    body: [
      "Self-organisation lets a system learn, diversify, specialise and evolve. It is what makes living systems fundamentally different from machines.",
      "It is often messy and unpredictable, which is why managers reflexively suppress it — then wonder why the system loses resilience, innovation and adaptability.",
    ],
    tags: ["self-organisation", "adaptation", "evolution", "learning"],
  },
  {
    id: "hierarchy",
    title: "Hierarchy",
    summary:
      "Systems nested inside larger systems, each with partial autonomy.",
    body: [
      "Complex systems almost always organise themselves into hierarchies: cells in organs in bodies, employees in teams in companies.",
      "A healthy hierarchy serves its subsystems first; pathologies appear when higher levels override lower ones too aggressively or when subsystems ignore the larger whole.",
    ],
    tags: ["hierarchy", "nested", "subsystem", "holon"],
  },
  {
    id: "bounded-rationality",
    title: "Bounded rationality",
    summary:
      "People make the best decisions they can with the information they actually have.",
    body: [
      "Every actor in a system sees only a slice of reality — their local piece, filtered through imperfect information and delayed feedback.",
      "If a system behaves badly, it is rarely because people are irrational. It is usually because the information reaching them is distorted, delayed or too narrow.",
      "Fix the information flows before you blame the actors.",
    ],
    tags: ["bounded rationality", "information", "decisions", "agents"],
  },
  {
    id: "leverage-points",
    title: "Leverage points",
    summary:
      "Places where a small shift can produce a large change in system behaviour.",
    body: [
      "Meadows' leverage points, from weakest to strongest, include: numbers (parameters), buffer sizes, stock-and-flow structure, delays, balancing loops, reinforcing loops, information flows, rules, self-organisation, goals, paradigms, and the power to transcend paradigms.",
      "Counter-intuitively, the levers people reach for first — tweaking numbers — are usually the weakest. Changing the goal of the system, or the mindset that generates the goal, is almost always more powerful.",
    ],
    tags: ["leverage", "intervention", "12 leverage points", "paradigm"],
  },
  {
    id: "traps",
    title: "System traps (archetypes)",
    summary:
      "Recurring structures that produce recognisable pathological behaviour.",
    body: [
      "Common traps: policy resistance, tragedy of the commons, drift to low performance, escalation, success to the successful, shifting the burden to an intervenor, rule beating, and seeking the wrong goal.",
      "Each trap has a matching way out — usually by changing the rules, goals or information flows rather than by working harder within the existing structure.",
    ],
    tags: ["archetype", "trap", "tragedy of the commons", "policy resistance", "escalation"],
  },
  {
    id: "paradigms",
    title: "Paradigms and mental models",
    summary:
      "The shared beliefs out of which the system arises — the deepest leverage point.",
    body: [
      "A paradigm is the set of assumptions a society takes for granted: 'growth is good', 'nature is a resource', 'more consumption equals more wellbeing'.",
      "Changing a paradigm changes everything downstream — goals, rules, structure, flows and parameters.",
      "The highest leverage of all is the capacity to stay unattached to any paradigm, to hold them lightly, and to choose which one fits the situation.",
    ],
    tags: ["paradigm", "mindset", "mental model", "worldview"],
  },
  {
    id: "dancing",
    title: "Dancing with systems",
    summary:
      "Practical guidelines for working with complex systems instead of against them.",
    body: [
      "Get the beat of the system before you try to change it — watch how it behaves, how it fails, how it surprises.",
      "Honour, respect and distribute information. Use language with care. Pay attention to what is important, not just what is quantifiable.",
      "Expand time horizons, expand the boundary of caring, and stay humble — no one ever has the full picture of a complex system.",
    ],
    tags: ["dancing", "practice", "guidelines", "humility"],
  },
];

export type ConceptSearchHit = {
  concept: SystemsConcept;
  score: number;
};

/**
 * Lightweight fuzzy-ish search over title / summary / tags / body.
 * Returns the most relevant hits ranked by a small heuristic score.
 */
export function searchConcepts(query: string, limit = 4): ConceptSearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const tokens = q.split(/\s+/).filter(Boolean);
  const hits: ConceptSearchHit[] = [];
  for (const concept of SYSTEMS_CONCEPTS) {
    const title = concept.title.toLowerCase();
    const summary = concept.summary.toLowerCase();
    const tags = concept.tags.join(" ").toLowerCase();
    const body = concept.body.join(" ").toLowerCase();
    let score = 0;
    for (const token of tokens) {
      if (!token) continue;
      if (title.includes(token)) score += 8;
      if (tags.includes(token)) score += 6;
      if (summary.includes(token)) score += 4;
      if (body.includes(token)) score += 2;
      if (title.startsWith(token)) score += 4;
    }
    if (score > 0) hits.push({ concept, score });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}
