# Helm — Usage Walkthrough

A real-feeling run-through of building a new SaaS with Helm, from an empty folder to ship.
The example user is a **non-coder**. The SaaS idea: **"InvoiceSnap" — dead-simple invoicing for freelance photographers.**

> Convention below: **You:** = what you type to Claude · **Claude:** = what Claude says back · `gray code` = commands that actually run.

---

> **You only ever do two things:** (1) run the one setup command below, and (2) **confirm moving between phases.** Claude runs every other command and manages context + memory for you.

## 0. Set up a new project folder

In your terminal (PowerShell on Windows):

```powershell
# 1. Make a fresh folder for your SaaS
mkdir InvoiceSnap
cd InvoiceSnap

# 2. One command — installs Helm into this folder (skills, CLAUDE.md, .helm/ memory)
npx helm init
git init
```

That's it. `npx helm init` drops in the brain, the phase skills, and creates the `.helm/`
memory folder. Now open this folder in **Claude Code** (or your AI agent of choice) — from
here on, Claude runs the commands; you just chat and confirm.

---

## 1. First message — Helm wakes up

**You:**
> hey, i want to build a SaaS. where do we start?

**Claude:** *(reads `CLAUDE.md`, sees it's a Helm project, invokes `helm-bootstrap`, runs `node bin/helm.js status`)*

> You're on phase **Validate** (not started). 💡
> Before we build anything, Helm wants to make sure the idea is worth building — a quick market + cost check that ends in a clear **go / pivot / kill**.
>
> Quick setup first: how should I talk to you — are you a coder, or should I keep it plain-English and handle the technical stuff?

**You:**
> plain english please, i can't really read code

**Claude:** *(sets `comms: non-technical` in `.helm/helm.config.json`)*
> Got it — I'll keep it jargon-free and run the technical checks for you. 👍
> So, in one line: what's the idea?

---

## 2. Phase 0 — Validate

**You:**
> invoicing app for freelance photographers. they hate making invoices in word.

**Claude:** *(invokes `helm-validate`, opens `.helm/VALIDATION.md`)*
> Love it. Let me pin down who exactly, then test demand + cost. One at a time.
>
> Who's the *uncomfortably specific* first user? e.g. "solo wedding/event photographers in the US who send 5–20 invoices a month."

**You:**
> yeah exactly that, wedding photographers, solo, a few invoices a month

**Claude:**
> 
> Here's my read so far 👇
> - **Hypothesis (willingness to pay):** they'd pay ~$9/mo to skip Word invoices.
> - **Market (bottom-up):** ~150k solo wedding photographers in the US → even 1% = 1,500 users = ~$13k/mo. Healthy for a solo SaaS.
> - **Competitors:** HoneyBook, Wave (free), Bonsai — but they're heavy/general. Your wedge = *stupidly simple + photographer-specific*.
> - **Cost:** an MVP runs basically free→$25/mo on managed hosting.
>
> My **go/pivot/kill** line was: *"go only if there's a clear simplicity wedge vs Wave (free)."* I think there is. I'd say **GO**, but the risk is Wave being free — we'll need a sharp reason to pay.
>
> Want me to record **GO**?

**You:**
> yes go

**Claude:** *(writes the GO decision + rationale into `.helm/VALIDATION.md` and `.helm/DECISIONS.md`)*
> Recorded ✅. Moving to the PRD.
> 
> ```
> npx helm advance
> ```
> You're now on phase **PRD**. 📋

---

## 3. Phase 1 — PRD

**Claude:** *(invokes `helm-prd`, opens `.helm/PRD.md`)*
> The PRD is the blueprint everything else follows. I need two numbers to pick the right tech: **how many users** do you expect in year one, and **what's your monthly budget**?

**You:**
> maybe 500 users first year. budget like 30 bucks a month max

**Claude:**
> Perfect — that points to a cheap managed stack. Here are 3 options 👇
>
> | Option | Stack | Cost | Why |
> |---|---|---|---|
> | **A — MVP-cheap** ✅ (recommended) | Next.js + Supabase (DB+auth) + Vercel | ~$0–25/mo | Fastest, scales fine to 500 users, almost no ops |
> | B — Production-heavy | Next.js + Postgres on AWS | ~$80+/mo | Overkill for 500 users, more to manage |
> | C — No-code-ish | Bubble | ~$32/mo | Fast but hard to customize / own |
>
> I recommend **A** — fits your budget, and we own the code. Good?

**You:**
> go with A

**Claude:**
> 
> Locking the scope. **In:** create invoice, client list, PDF export, email send, paid/unpaid status.
> **Non-goals (NOT building now):** multi-currency, teams, expense tracking, accounting integrations.
> Each feature gets a checkable "done" so we can prove it works without you reading code.
>
> Does that scope sound right, or trim/add anything?

**You:**
> drop email send for now, too much. keep the rest

**Claude:** *(updates `.helm/PRD.md` — moves "email send" to non-goals, logs it in `.helm/ISSUES.md` as deferred)*
> Done — email moved to "later" so it doesn't slow the first version. PRD approved?

**You:**
> approved

**Claude:**
> ```
> npx helm advance
> ```
> On to the **Mockup**. 🎨

---

## 4. Phase 2 — Mockup → reusable template

**Claude:** *(invokes `helm-mockup`)*
> Let's see it before we build it. I'll make a clickable mockup with fake data so you can "finish the product in your head." Which do you prefer — I build it right here in Claude (fastest), or you'd rather use Stitch/Lovable?

**You:**
> just do it here

**Claude:** *(builds a clickable mockup with mock invoices)*
> Here's InvoiceSnap with 3 sample invoices — try clicking "New Invoice" and "Mark Paid." Does this match what's in your head?

**You:**
> yeah! but make the "paid" tag green not blue

**Claude:** *(adjusts)*
> Fixed — green "Paid" tag. Confirm this mockup is right?

**You:**
> confirmed

**Claude:**
> Now I'll turn it into a **reusable template** — shared buttons, cards, colors — so every future screen looks identical and we never rebuild pieces. *(builds the component template)*
> Here's the same screen rebuilt from reusable parts. Does it still match the mockup?

**You:**
> looks the same, good

**Claude:** *(writes `.helm/DESIGN.md` — colors, fonts, spacing, the green "Paid" rule, tone)*
> Design identity locked in `.helm/DESIGN.md` ✅ — every screen will follow it automatically.
> ```
> npx helm advance
> ```
> Next: **Setup**. 🧱

---

## 5. Phase 3 — Setup

**Claude:** *(invokes `helm-setup`)*
> Three quick setup choices — I'll handle them and just confirm with you:
> 1. **Framework:** I'll use a light spec-driven flow for a project this size.
> 2. **Code map (Serena):** lets me navigate your code without re-reading everything → saves you money. I'll install it.
> 3. **Model roles:** plan with a smart model, build with a cheap-but-strong one (Kimi), review with the smart one. Cheapest + safe. OK?

**You:**
> sounds good, do it

**Claude:** *(sets the slots in `.helm/helm.config.json`, records choices in `.helm/DECISIONS.md`)*
> Engine configured ✅.
> ```
> npx helm advance
> ```
> Time to **build**. 🔁

---

## 6. Phase 4 — Build loop

**Claude:** *(invokes `helm-build`)*
> I build in small slices so nothing breaks silently. First slice: **create + list invoices**. I'll plan it, build it, then review it for safety (secrets, data, login) before showing you. Go?

**You:**
> go

**Claude:** *(plan → build → review per slice; after each: runs tests + the 3 killer checks, commits)*
> ✅ Slice 1 done — you can create and see invoices. Tests pass, no security flags.
> Next slice: **PDF export + paid/unpaid status**. Building…
>
> *(later)* ✅ Slice 2 done. Quick heads-up 🟡: I kept my working context under 40% — when it got close I saved a handoff note so the next session picks up clean.

**You:**
> wait, can clients have a phone number field too?

**Claude:** *(Change-Request protocol kicks in)*
> Small change, and it touches the data model — so **spec-first**: I'll add "client phone" to the PRD, then build it. Confirming before I touch code… done. Field added, tested. 👍

*(... a session later, you come back ...)*

**You:**
> ok i'm back, where were we?

**Claude:** *(new session → `helm-bootstrap` → `helm status` reads `.helm/`)*
> Welcome back. You're on **Build**, 2 of 3 slices done. Next: the client list screen. Want me to continue?

**You:**
> yes finish it

**Claude:** *(finishes slices)*
> ✅ All build slices done and green.
> ```
> npx helm advance
> ```
> Last step: **Ship**. 🚢

---

## 7. Phase 5 — Ship

**Claude:** *(invokes `helm-ship`, opens `.helm/SHIP.md`)*
> Production checklist time. The **3 loud gates** first:
> - 🔑 Secrets — ✅ no keys in code, all in env vars
> - 🗑️ Data-loss — ✅ deletes ask for confirmation, DB backups on
> - 🔓 Auth — ✅ every invoice is locked to its owner
>
> Plus: full tests green ✅, I walked the golden path (create → PDF → mark paid) ✅. One nudge 🟡: no error logging yet — fine for launch, worth adding soon (logged it in `.helm/ISSUES.md`).
>
> Ready to mark it **SHIPPED**?

**You:**
> ship it 🚀

**Claude:** *(records SHIPPED in `.helm/SHIP.md` + `.helm/DECISIONS.md`)*
> 🎉 InvoiceSnap is production-ready. `helm advance` marks the journey complete.

---

## Commands (Claude runs these — you don't have to)

```powershell
npx helm status     # where am I? what's next?
npx helm advance    # finish this phase, move to the next (Claude asks you to confirm first)
npx helm snapshot   # back up Helm's core before a risky change
npx helm rollback   # undo to the last snapshot
```

You never need to type these — Claude runs them automatically. The only moment Claude
pauses for you is to confirm a phase move.

## What lived in `.helm/` by the end

| File | What it held |
|------|--------------|
| `state.json` | current phase + progress (so any session knows where you are) |
| `VALIDATION.md` | the go/pivot/kill decision |
| `PRD.md` | the blueprint (scope, tech choice, non-goals, acceptance criteria) |
| `DESIGN.md` | colors/fonts/components — the locked visual identity |
| `DECISIONS.md` | every choice + why |
| `ISSUES.md` | deferred work (email send, error logging) so nothing's forgotten |
| `handoff.md` | the "where we left off" note between sessions |
| `SHIP.md` | the production checklist result |

That's the whole journey: **idea → validate → PRD → mockup → setup → build → ship**, with Helm remembering everything and keeping you on rails the whole way. ⛵
