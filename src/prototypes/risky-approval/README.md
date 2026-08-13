# Risky approval classifier prototype

This throwaway logic prototype asks whether deterministic signals can classify a
candidate prompt as `low`, `high`, or `unknown` strongly enough for the `risky`
approval mode to suppress reviews safely. The pure classifier is isolated in
`risk-classifier.ts`; the terminal shell exposes every decision and aggregate.

Run it interactively:

```sh
npm run prototype:risky
```

Run the aggregate evaluation without a TTY:

```sh
npm run prototype:risky < /dev/null
```

The evidence set contains the frozen v11 safe transformations, all ambiguity
prompts, all v11 adversarial transformations, and the two independently confirmed
v10 meaning-changing transformations. Passing the retrospective thresholds does
not by itself establish readiness: the selected candidate produced no transformed
ambiguous outputs, and its structured response exposes no calibrated confidence.
