// Pure, zero-dependency token/credit telemetry. Tracks per-event token usage and
// computes USD cost from per-model rates, with breakdowns by phase and model.
//
// emptyStore()             → a fresh store { rates, events:[] }
// loadTelemetry(textOrObj) → a validated store (tolerant of missing fields)
// addEvent(store, event)   → a NEW store with the event appended (immutable)
// summarize(store)         → totals + per-phase + per-model + usd math
//
// Rates are USD per 1,000,000 tokens. We use the key "inn" for the input rate
// (instead of "in") because "in" reads as the reserved-word operator and is easy
// to misuse; "out" is the output rate.

export const DEFAULT_RATES = {
  "claude-opus": { inn: 15, out: 75 },
  "claude-sonnet": { inn: 3, out: 15 },
  "kimi-k2.6": { inn: 0.6, out: 2.5 },
  default: { inn: 1, out: 3 },
};

// A clean deep copy of any rate table so a store never shares mutable rate
// objects with another store (or the module-level DEFAULT_RATES constant).
function cloneRates(rates) {
  const out = {};
  for (const [model, r] of Object.entries(rates)) {
    out[model] = { inn: r && r.inn, out: r && r.out };
  }
  return out;
}

function cloneDefaultRates() {
  return cloneRates(DEFAULT_RATES);
}

export function emptyStore() {
  return { rates: cloneDefaultRates(), events: [] };
}

// Coerce one rate entry to a clean { inn, out } of finite non-negative numbers.
function normalizeRate(r) {
  const inn = num(r && r.inn);
  const out = num(r && r.out);
  return { inn, out };
}

// Coerce to a finite number; anything else (NaN, Infinity, undefined, strings) → 0.
function num(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export function loadTelemetry(textOrObj) {
  let obj = textOrObj;
  if (typeof textOrObj === "string") {
    obj = JSON.parse(textOrObj); // throws on bad JSON — intentional
  }
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    throw new TypeError("loadTelemetry: expected an object or JSON object string");
  }

  // Rates: start from defaults, overlay any valid provided rates (tolerant).
  const rates = cloneDefaultRates();
  if (obj.rates && typeof obj.rates === "object" && !Array.isArray(obj.rates)) {
    for (const [model, r] of Object.entries(obj.rates)) {
      if (r && typeof r === "object") rates[model] = normalizeRate(r);
    }
  }

  // Events: tolerate a missing/non-array events field by defaulting to [].
  const rawEvents = Array.isArray(obj.events) ? obj.events : [];
  const events = rawEvents.map((e) => normalizeEvent(e));

  return { rates, events };
}

// Normalize a single event: missing tokens → 0, missing model → "default".
function normalizeEvent(e) {
  const src = e && typeof e === "object" ? e : {};
  const ev = {
    model: typeof src.model === "string" && src.model ? src.model : "default",
    phase: typeof src.phase === "string" ? src.phase : "",
    tokensIn: num(src.tokensIn),
    tokensOut: num(src.tokensOut),
  };
  if (src.ts !== undefined) ev.ts = src.ts;
  if (src.note !== undefined) ev.note = src.note;
  return ev;
}

export function addEvent(store, { model, phase, tokensIn, tokensOut, ts, note } = {}) {
  const base = store && typeof store === "object" ? store : emptyStore();
  // Clone the rates so the returned store never shares a mutable rate table with
  // the input store — keeps the immutability promise in the docstring honest.
  const rates = base.rates && typeof base.rates === "object" ? cloneRates(base.rates) : cloneDefaultRates();
  const prior = Array.isArray(base.events) ? base.events : [];
  const event = normalizeEvent({ model, phase, tokensIn, tokensOut, ts, note });
  // Return a NEW store — never mutate the input (immutability).
  return { rates, events: [...prior, event] };
}

// USD cost of one event given the rate table. Falls back to rates.default.
function costOf(event, rates) {
  const rate = (rates && rates[event.model]) || (rates && rates.default) || DEFAULT_RATES.default;
  return (event.tokensIn / 1e6) * rate.inn + (event.tokensOut / 1e6) * rate.out;
}

export function summarize(store) {
  const rates = store && store.rates && typeof store.rates === "object" ? store.rates : cloneDefaultRates();
  const events = store && Array.isArray(store.events) ? store.events : [];

  let tokensIn = 0;
  let tokensOut = 0;
  let usd = 0;
  const byPhase = {};
  const byModel = {};

  for (const raw of events) {
    const e = normalizeEvent(raw);
    const cost = costOf(e, rates);
    tokensIn += e.tokensIn;
    tokensOut += e.tokensOut;
    usd += cost;
    bump(byPhase, e.phase, e, cost);
    bump(byModel, e.model, e, cost);
  }

  return { tokensIn, tokensOut, usd, count: events.length, byPhase, byModel };
}

// Accumulate one event's tokens + cost into a keyed bucket.
function bump(map, key, e, cost) {
  const b = map[key] || (map[key] = { tokensIn: 0, tokensOut: 0, usd: 0 });
  b.tokensIn += e.tokensIn;
  b.tokensOut += e.tokensOut;
  b.usd += cost;
}
