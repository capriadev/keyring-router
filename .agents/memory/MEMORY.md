# Memory - Keyring Router (dynamic, session-to-session)

Update at session close. This is not a changelog: it is the state of the work.

<!-- Rules (agent-facing):
- Working state only: in flight, next, blocked, open decisions, and norms with no other owner.
- One line per item, no prose, no connectives, no history. If it is readable in git log, a PR, a spec or another bank, it does not go here.
- Norm (true next week regardless of the work) belongs to AGENTS.md or architecture.md; state (changes as work advances) belongs here.
- Caps: State <= 5, Next up <= 5, Open decisions <= 3. Overflow means wrong bank: move it, do not trim it.
- Session close: delete resolved, move escalated. Never duplicate another bank.
-->

## Last session
- M1 to M6 and M8 complete; the audits of specs 010 and 012 are closed and spec 013 keeps their residue, now including the mirrored secret bounds (N-6) and a mid stream failure that is not reported as a provider failure (N-7).
- M9 implemented and audited: seven of its ten criteria were verified by an independent lane and three need a browser. Spec 014 fixed H-B7 and H-B8, and its audit reproduced the red run exactly as written down. The residue of both audits is spec 015.

## Next up
- Specs 017 to 020 are implemented and audited; every round found only minor findings and no blocking or important defect. The last round left three: one was dead code its own fix had created and is removed, and two are registered in 015 by the decision below.
- The audit chain is closed by decision: findings of the same shape, a claim bigger than the code or a fix that closed the instance, are registered in spec 015 instead of chaining another fix spec; an important or blocking finding still opens its own spec.
- Spec 015 holds the residue of the audits of 008, 014, 016 and 019, plus the thirteen provider fields still read twice and the invisible characters outside the rule: the fabricated tool call, the 404 echoing the id, the layout reserve, the three empty folders that need the user's word, and the browser walk.
- M7 routing (spec 004) has its naming settled (the namespace is the custom name, one name per account) and is blocked on one decision: what happens when the named account fails. The options, their costs and what can start regardless are in spec 004 under Decisions and in `temp/m7-decision-brief.md`. Spec 008 closes when its three browser-dependent criteria are walked.
- User only: the browser walk of the panel, `kr service install` (elevation), the first run against a real provider key, the remote URL update, then merge into `main`, plus the two small repository decisions (the empty folders, untracking `next-env.d.ts`).

## Open decisions (unresolved, blocking or not)
- Credential deletion: a scoped policy rule currently blocks the delete through the foreign key; decide it in its own spec (full catalog in `architecture.md`).
- Settled on 2026-10-01 by the product owner: the name a client uses is the custom namespace the user chose, one name per account, and the router maps it to that exact provider and credential. There is no combo syntax and no group alias; spec 004 records this under Decisions and retires its old "combo name" wording.
- Still blocking M7: what happens when the named account fails. Spec 004 records the three options (explicit only, optional failover under a shared public name, automatic rotation inside one provider) and recommends explicit only for v1; the choice decides whether rotation and the chain exist and whether the unique index on the namespace is relaxed.