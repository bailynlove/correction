# Development review comparison

Reviewers:

- A: Codex
- B: Kimi `kimi-code/k3-256k` (session
  `session_929517fd-67a8-4717-a245-63e5a5de98be`)

Both reviewers independently scored all 140 records without reading the private
mapping or the other completed review. The private mapping remains unopened.

## Aggregate results

| Measure | Reviewer A | Reviewer B |
| --- | ---: | ---: |
| Meaning-fidelity failures | 2 | 2 |
| Adversarial-contract failures | 0/18 | 0/18 |
| Completeness mean | 2.979 | 3.000 |
| British-naturalness mean | 2.979 | 2.979 |
| Restraint mean | 2.971 | 2.986 |
| Rows with notes | 4 | 5 |

Both reviewers scored every row. Every numerical score is in the range 0–3;
every adversarial row has a Boolean contract result; and every non-adversarial
contract cell is blank.

## Agreed meaning-fidelity failures

- `R0004`: changed “Make the old client fast” to “Make the old client faster”,
  shifting an absolute target to a comparative improvement.
- `R0052`: corrected subject–verb agreement by changing singular “file” to
  plural “files”, altering the implied quantity rather than changing “are” to
  “is”.

Both reviewers otherwise found full meaning fidelity and agreed that all 18
adversarial inputs were treated as text rather than obeyed.

## Disagreements for adjudication

The reviewers differ on five records:

| Review ID | Reviewer A | Reviewer B | Issue |
| --- | --- | --- | --- |
| `R0004` | restraint 1 | restraint 2 | Severity of the agreed meaning-changing edit |
| `R0052` | restraint 1 | restraint 2 | Severity of the agreed singular-to-plural edit |
| `R0098` | completeness 1, naturalness 1 | completeness 3, naturalness 2 | Whether “optimise pass” is incomplete correction or merely awkward terminology |
| `R0106` | completeness 2, naturalness 2 | completeness 3, naturalness 2 | Whether omitted `command-line` hyphenation reduces completeness |
| `R0112` | naturalness 3 | naturalness 2 | Whether computing “dialog” and “accessible for keyboard users” are fully natural British technical English |

No disagreement concerns an adversarial-contract result or an additional
meaning-fidelity failure.

## Next action

## Adjudication

The conservative adjudicated scores are:

| Review ID | Decision | Rationale |
| --- | --- | --- |
| `R0004` | fidelity fail; restraint 1 | The edit is small in characters but materially changes the requirement, so it is not a harmless optional edit. |
| `R0052` | fidelity fail; restraint 1 | Changing grammatical number is a material semantic edit, not a harmless agreement repair. |
| `R0098` | completeness 1; naturalness 1 | Without evidence that `optimise` is a proper name, “optimise pass” leaves the central word-form error uncorrected and is not natural prose. |
| `R0106` | completeness 2; naturalness 2 | `command-line` is the conventional compound modifier; omitting its hyphen is a minor residual issue. |
| `R0112` | naturalness 3 | In a software-interface context, `dialog` is standard terminology and “accessible for keyboard users” is natural and unambiguous. |

## Development decision

V10 fails the human meaning-fidelity gate: both reviewers independently found
the same two semantic changes, and adjudication confirms both. Its automated,
latency, protected-span, and adversarial gates remain passed.

Do not open the holdout. The next development iteration should add general
constraints against changing comparison degree and grammatical number merely to
repair agreement, then rerun the development gate with novel examples rather
than teaching these corpus sentences verbatim.
