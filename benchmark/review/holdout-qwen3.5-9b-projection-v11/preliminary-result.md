# V11 holdout result

Date: 2026-08-12

The holdout was opened once under the configuration pinned in
`benchmark/qwen3.5-9b-v11-freeze.md`. An initial sandboxed invocation could not
connect to the local MLX endpoint and produced only immediate `fetch failed`
records. It made no model requests and its files were overwritten by the valid
run after endpoint health was verified. This infrastructure attempt is not a
holdout observation.

## Automated result

The valid result is in
`benchmark/results/holdout-qwen3.5-9b-projection-v11-5run/`:

- 300/300 curated requests completed without processor errors;
- 1,000/1,000 generated protected-span cases completed without errors;
- zero unchanged-case violations;
- every one of the 60 curated cases produced a byte-identical output on all five
  repeats;
- 180/300 outputs exactly matched a configured reference;
- warm p50 was 656.271 ms; and
- warm p95 was 2,963.126 ms.

The correctness hard gate passes, but the two-second p95 latency gate fails. The
failure is sharply associated with input length: all 215 requests below 200
characters stayed under two seconds (p95 1,105.306 ms), while all 75 requests of
600 characters or more exceeded two seconds (p95 3,351.702 ms). This is a real
holdout result and must not be addressed by tuning the frozen candidate against
these cases.

## Human review

Reviewer A (Codex) independently completed all 60 blinded rows without reading
the private mapping. It found zero meaning-fidelity failures and zero
adversarial-contract failures. Its means were 2.750 for completeness, 2.750 for
British naturalness, and 2.967 for restraint.

The most notable non-semantic defect is `R0021`, where the candidate introduced
a duplicated comma after a protected number. Eleven long protected cases omit
the conventional hyphen in the compound modifier “command-line”; two other rows
retain a US spelling or an awkward singular “API”.

Reviewer B, Kimi `kimi-code/k3-256k`, independently completed all 60 rows after
the user explicitly approved sending only the blinded reviewer-B CSV contents to
the external service. It found zero meaning-fidelity failures and zero
adversarial-contract failures. Its means were 2.767 for completeness, 2.950 for
British naturalness, and 2.983 for restraint.

Conservative adjudication passes every human threshold. The complete comparison
and adjudication are in `review-comparison.md`. The private mapping remained
closed throughout both reviews and was not needed afterward.

## Decision status

The candidate passes holdout correctness, repeatability, protected-span,
adversarial-safety, and human-quality gates, but fails the frozen p95 latency
requirement. The frozen v11 candidate therefore cannot be declared a full
holdout pass. No prompt or processor tuning was performed after the holdout was
opened.
