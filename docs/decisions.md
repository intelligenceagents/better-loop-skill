# Implementation decisions

## M1 draft contract package

Package version `0.1.0-draft.1` distributes unchanged schema version `0.1.0`. Source schemas remain authoritative; generation copies bytes without rewriting them. Structural TypeScript types are generated for ergonomics and do not replace validation.

The synchronous digest API uses SHA-256 over RFC 8785-compatible canonical UTF-8 JSON containing the validated candidate and exact consent. Policy `bl-sharing-0.1` is the only recognized policy. Optional purposes remain explicit, and the UI should initially set both to false. The digest is content identity, never proof of consent or privacy.

Validators return detached snapshots, reject non-JSON inputs, and expose safe error codes. They preserve the Python numerical tolerance and every semantic check. An additive `parseJson` helper rejects duplicate members before information is lost in ordinary JSON parsing.

Bundled, precompiled validators support Node and the browser without a runtime dependency installation or dynamic code generation. Python date-time validation now requires its optional dependency explicitly. This restores the declared schema format check; it does not change either schema.

M1 does not change the instruction-only skill. No model inference, benchmark runner, network upload, or privacy clearance is introduced. Subsequent milestones must implement and test those capabilities before changing capability claims.
