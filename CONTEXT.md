# Correction

Correction is the context responsible for mediating an outbound user prompt before an agent host receives it.

## Language

**Correction**:
The product that applies a configurable prompt pipeline before an agent host receives user input.
_Avoid_: Correction plugin, English corrector

**Prompt pipeline**:
The ordered sequence through which an outbound user prompt passes before reaching an agent host.
_Avoid_: I/O pipeline, plugin

**Processor**:
A configurable stage in the prompt pipeline that evaluates or transforms a prompt for one purpose, such as English correction or security checking.
_Avoid_: Plugin, generic function

**Host adapter**:
The boundary that connects the prompt pipeline to a particular agent host while preserving that host’s interaction lifecycle.
_Avoid_: Host plugin, wrapper

**Original prompt**:
The immutable user input received by the prompt pipeline before any processor runs.
_Avoid_: Raw prompt, source prompt

**Candidate prompt**:
The current version of a prompt as it moves sequentially through the prompt pipeline.
_Avoid_: Corrected prompt, output prompt

**Processor result**:
A non-interactive decision from one processor: pass, transform, block, or error, accompanied by structured metadata.
_Avoid_: Pipeline outcome, UI action

**Pipeline outcome**:
The host-neutral action produced after the prompt pipeline combines processor results with approval and failure policies.
_Avoid_: Processor result, model response

**Failure policy**:
The per-processor configuration that decides whether an error preserves the preceding candidate and continues the pipeline or stops it without sending a prompt.
_Avoid_: Processor fallback, error result

**Bypass**:
The user’s rejection of a proposed transformation, which restores the candidate from before that transformation without skipping later processors.
_Avoid_: Disable pipeline, ignore block

**Approval mode**:
The pipeline policy that decides whether a bypassable transformation is applied automatically or returned for user review.
_Avoid_: Processor mode, confirmation UI

**Review**:
The host-neutral interaction in which a user approves, edits, bypasses, or cancels a proposed prompt transformation.
_Avoid_: Block, model approval

**Block**:
A terminal, non-bypassable processor result that prevents the candidate prompt from reaching the agent host.
_Avoid_: Review, error

**Protected span**:
A syntactically identifiable part of a prompt that must remain byte-for-byte identical throughout the prompt pipeline.
_Avoid_: Semantic invariant, immutable prompt

**Semantic invariant**:
A value or meaning in a prompt that must be preserved even when the surrounding natural language is transformed.
_Avoid_: Protected span, preferred wording

**Pipeline attempt**:
One complete passage of a user-authored prompt through the prompt pipeline; editing a proposal begins a new attempt with the edited text as its original prompt.
_Avoid_: Review cycle, retry
