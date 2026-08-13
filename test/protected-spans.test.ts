import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { projectPrompt } from "../src/processors/english-correction/protected-spans.js";

describe("prompt projection", () => {
  it("round-trips supported technical syntax", () => {
    const input = [
      "Please inspect `src/app.ts` and https://example.com/docs.",
      "Run --verbose /review @codex with ./fixtures/a.json.",
      "```ts\nconst answer = 42\n```",
      "$ npm test -- --runInBand",
      '{"mode":"safe","count":2}',
    ].join("\n");
    const projection = projectPrompt(input);

    assert.match(projection.projectedText, /ZXQ_CODE_\d{4}_QXZ/);
    assert.match(projection.projectedText, /ZXQ_URL_\d{4}_QXZ/);
    assert.match(projection.projectedText, /ZXQ_PATH_\d{4}_QXZ/);
    assert.equal(projection.restore(projection.projectedText), input);
  });

  it("masks typed semantic and sensitive-looking spans", () => {
    const input = [
      "My number is +44 7700 900123 and my email is me@example.com.",
      "Keep sha256.deadbeef, API_TOKEN, TaskID, v3.2.1, 250ms, and 10.0.0.8 unchanged.",
    ].join("\n");
    const projection = projectPrompt(input);

    for (const kind of ["PHONE", "EMAIL", "IDENTIFIER", "VERSION", "NUMBER", "IP"]) {
      assert.match(projection.projectedText, new RegExp(`ZXQ_${kind}_\\d{4}_QXZ`));
    }
    assert.doesNotMatch(projection.projectedText, /7700|example\.com|deadbeef|API_TOKEN|TaskID|3\.2\.1|250ms|10\.0\.0\.8/);
    assert.equal(projection.restore(projection.projectedText), input);
  });

  it("leaves ordinary natural-language text visible", () => {
    const projection = projectPrompt("please make this sentence easier to read");
    assert.equal(projection.projectedText, "please make this sentence easier to read");
    assert.equal(projection.restore("Please make this sentence easier to read."), "Please make this sentence easier to read.");
  });

  it("masks an inline shell command without hiding the surrounding prose", () => {
    const input = "please inspect $ npm run build -- --verbose before continuing";
    const projection = projectPrompt(input);
    assert.equal(
      projection.projectedText,
      "please inspect ZXQ_COMMAND_0000_QXZ before continuing",
    );
    assert.equal(projection.restore(projection.projectedText), input);
  });

  it("masks a lowercase member referenced in enum context", () => {
    const input = "please add pending to the state enum";
    const projection = projectPrompt(input);
    assert.equal(
      projection.projectedText,
      "please add ZXQ_IDENTIFIER_0000_QXZ to the state enum",
    );
    assert.equal(projection.restore(projection.projectedText), input);
  });

  it("rejects a missing mask", () => {
    const projection = projectPrompt("Open `src/app.ts`.");
    assert.throws(() => projection.restore("Open the file."), /changed or duplicated/);
  });

  it("rejects duplicated and reordered masks", () => {
    const projection = projectPrompt("Send 5 results to me@example.com.");
    const masks = projection.projectedText.match(/ZXQ_[A-Z]+_\d{4}_QXZ/g) ?? [];
    assert.equal(masks.length, 2);
    assert.throws(() => projection.restore(`${projection.projectedText} ${masks[0]}`), /changed or duplicated/);
    assert.throws(() => projection.restore(`${masks[1]} then ${masks[0]}`), /changed or duplicated/);
  });
});
