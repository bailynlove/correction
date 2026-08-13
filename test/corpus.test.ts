import assert from "node:assert/strict";
import test from "node:test";

import { curatedCorpus, generatedProtectedCorpus } from "../src/benchmark/corpus.js";
import { projectPrompt } from "../src/processors/english-correction/protected-spans.js";

test("curated corpus has the frozen category and split counts", () => {
  const corpus = curatedCorpus();
  const categories = Object.groupBy(corpus, (item) => item.category);

  assert.equal(corpus.length, 200);
  assert.equal(corpus.filter((item) => item.split === "development").length, 140);
  assert.equal(corpus.filter((item) => item.split === "holdout").length, 60);
  assert.deepEqual(
    Object.fromEntries(Object.entries(categories).map(([key, values]) => [key, values?.length])),
    { ordinary: 50, unchanged: 30, protected: 40, semantic: 35, ambiguous: 20, adversarial: 25 },
  );
});

test("every curated category contains short, medium, and long prompts", () => {
  const categories = Object.groupBy(curatedCorpus(), (item) => item.category);
  for (const [category, cases] of Object.entries(categories)) {
    const lengths = (cases ?? []).map((item) => item.input.split(/\s+/).length);
    assert.ok(lengths.some((length) => length <= 15), `${category} has no short prompt`);
    assert.ok(lengths.some((length) => length >= 20 && length < 80), `${category} has no medium prompt`);
    assert.ok(lengths.some((length) => length >= 80), `${category} has no long prompt`);
  }
});

test("generated protected-span corpus contains 1,000 lossless round trips", () => {
  const corpus = generatedProtectedCorpus();
  assert.equal(corpus.length, 1_000);

  for (const input of corpus) {
    const projection = projectPrompt(input);
    assert.notEqual(projection.projectedText, input);
    assert.equal(projection.restore(projection.projectedText), input);
  }
});
