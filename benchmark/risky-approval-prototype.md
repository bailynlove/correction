# Risky approval signal prototype

Date: 2026-08-12
Ticket: GitHub issue #10

## Question

Can deterministic or model-derived signals classify English-correction
transformations as `low`, `high`, or `unknown` with 100% recall on ambiguous or
meaning-risking evidence and no more than 20% false reviews on clearly safe
corrections?

The throwaway interactive prototype is in
`src/prototypes/risky-approval/` and runs with:

```sh
npm run prototype:risky
```

## Evidence

The retrospective evaluation uses:

- 125 v11 transformations in the ordinary, protected, and semantic categories
  that passed the completed development or holdout human-fidelity reviews;
- all 20 ambiguity prompts, evaluated at the input-signal level because v11 left
  every one unchanged and therefore produced no transformation to approve;
- all three v11 adversarial transformations; and
- the two v10 transformations that both independent reviewers confirmed changed
  meaning.

The holdout model and prompt remain frozen. This prototype does not tune or rerun
the correction model against holdout cases.

## Prototype signals

`high` is assigned for deterministic evidence that a transformation deserves
review:

- a quantity, identifier, negation, or modality changes;
- grammatical number probably changes on a noun;
- comparison degree changes;
- malformed repeated punctuation is introduced; or
- the input contains strong correction-contract attack language.

`unknown` is assigned for unresolved reference, scope, ordering, ownership,
relative-target, or subjective-scope cues in the original prompt. `low` is used
only when none of those signals fires.

The processor's structured response contains only `correctedText`; it exposes no
calibrated confidence or alternative candidates. Self-reported confidence from
the same model would not be independent evidence. A second model judgement would
add another inference call, has no labelled calibration set here, and conflicts
with a latency profile that already exceeds the frozen target for long prompts.
No model-derived signal is therefore accepted for v0.1.

## Result

| Measure | Required | Observed |
| --- | ---: | ---: |
| Review-required recall | 100% | 25/25, 100% |
| False reviews on clearly safe corrections | at most 20% | 6/125, 4.8% |
| Ambiguous prompts represented | all | 20/20 |
| Ambiguous prompts actually transformed | sufficient calibration evidence | 0/20 |
| Confirmed meaning-changing transformations | sufficient calibration evidence | 2 |

The six false reviews are four legitimate singular-to-plural grammar corrections,
one subjective “unnecessary” instruction, and one long prompt containing a
relative “active” reference. These are defensible conservative reviews.

## Decision

The classifier passes the numerical retrospective screen but is not ready for
production use. The evidence proves that these rules catch two known failures; it
does not establish 100% recall over the broader space of meaning-changing edits.
The absence of any transformed ambiguous prompt makes the ambiguity result a
prompt-detector test rather than an end-to-end approval calibration.

Keep `always` as the v0.1 default. Keep `risky` experimental and do not lift this
classifier into the production processor yet; production transformations should
continue to report `unknown`. Revisit readiness only after collecting independent
user decisions or reviewer labels on real proposed transformations, including a
substantial set of meaning failures and transformed ambiguous prompts.

The prototype skill normally captures throwaway code on a separate branch. This
repository has no initial commit and every project file is currently untracked, so
creating a meaningful isolated prototype branch would require committing unrelated
work. The prototype remains clearly marked in the working tree instead.
