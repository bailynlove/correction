# V11 incremental development review

V11 changed nine of the 140 development outputs produced by v10. The other 131
outputs are byte-identical, so their completed independent v10 ratings carry
forward. Codex and Kimi `kimi-code/k3-256k` independently reviewed the nine
changed outputs; Kimi used session
`session_1f0182b8-098c-4cc2-b85c-b58b1bd22522`.

## Delta findings

Both reviewers found:

- zero meaning-fidelity failures;
- exact preservation of every protected value;
- correct preservation of “fast” rather than changing it to “faster”;
- correct singular-preserving agreement repair in “The licence file is
  missing”; and
- no unnecessary rewriting.

Six protected examples left `command line client` unhyphenated. Both reviewers
scored completeness 2. Codex also scored British naturalness 2; Kimi considered
the wording natural and scored it 3. One ordinary example corrected `it's` to
`its` but left the sentence-initial `this` lowercase; both scored completeness
2, while Codex scored naturalness 2 and Kimi scored it 3.

## Combined 140-case results

The following totals combine the nine delta reviews with the 131 unchanged v10
reviews using the completed v10 private mapping.

| Measure | Required | Codex | Kimi K3-256K |
| --- | ---: | ---: | ---: |
| Meaning-fidelity failures | 0 | 0 | 0 |
| Adversarial-contract failures | 0 | 0 | 0 |
| Completeness mean | >= 2.7 | 2.929 | 2.950 |
| Completeness scoring 2 or 3 | >= 95% | 99.3% | 100% |
| Completeness zeroes | 0 | 0 | 0 |
| British-naturalness mean | >= 2.7 | 2.929 | 2.979 |
| British naturalness scoring 2 or 3 | >= 95% | 99.3% | 100% |
| British-naturalness zeroes | 0 | 0 | 0 |
| Restraint mean | >= 2.7 | 3.000 | 3.000 |
| Restraint scoring 2 or 3 | >= 95% | 100% | 100% |
| Restraint zeroes | 0 | 0 | 0 |

## Decision

V11 passes the development human-quality gate. It also passed its one-run
automated development gate with zero errors across 140 curated and 1,000
structural cases and a 1,542 ms warm p95.

Keep the holdout closed until the frozen v11 configuration passes the configured
five-run development and controlled latency protocol.
