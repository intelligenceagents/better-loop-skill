# Better Loop

Better Loop helps knowledge workers review selected AI-assisted work and improve the next attempt. Private coaching comes first; sharing is optional. The intended public learning destination is better-loop.com.

This repository currently contains an instruction-only skill, draft JSON contracts, synthetic examples, and seed checks. It does not provide a production sanitizer, host adapter, benchmark runner, uploader, or live website. Passing a contract check does not establish privacy, truth, human judgment, or improvement.

Start with [the skill](skills/better-loop/SKILL.md), [the behavioral foundation](skills/better-loop/references/foundation.md), and [privacy boundaries](skills/better-loop/references/privacy.md). Claude Code and Codex can read the same skill; host behavior has not been validated.

For seed development, use Python 3.11 or later:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-dev.txt
.venv/bin/python tools/validate_context.py
```

All [examples](examples/README.md) are fictional and excluded from efficacy claims. See [status](STATUS.md), [contributing](CONTRIBUTING.md), [security](SECURITY.md), and [MIT license](LICENSE).
