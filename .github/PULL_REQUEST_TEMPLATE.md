## What does this PR do?

<!-- One or two sentences. What changes, and why. -->

## Related issue

<!-- e.g. Closes #123. Write "none" if there is no issue. -->

## AI disclosure (required)

Fredy accepts AI assisted contributions, but they have to be declared. An
undeclared AI PR will be closed. Tick **exactly one** box:

- [ ] `ai:none` - I wrote this myself. No AI generated code, text or commit messages.
- [ ] `ai:assisted` - AI helped with parts of it (autocomplete, refactoring, tests, docs). I reviewed and understand every line.
- [ ] `ai:generated` - AI produced most or all of this PR. I reviewed it, but it is largely machine written.

If you ticked `ai:assisted` or `ai:generated`, the three answers below are
mandatory. Keep them on the same line as the label.

**Which AI:** <!-- tool and model, e.g. "Claude Code, Opus 4.6" or "GitHub Copilot, GPT-5" -->

**How much:** <!-- which parts, roughly how much of the diff, e.g. "the provider parser and its tests, ~80% of the diff; README wording is mine" -->

**Why:** <!-- e.g. "unfamiliar with the puppeteer API", "boilerplate for the 19th provider", "faster test scaffolding" -->

## Checklist

- [ ] `yarn test:offline` passes (or `yarn test` if the change touches a live provider)
- [ ] `yarn lint` and `yarn format:check` pass
- [ ] The change is useful for everybody, not a custom tweak for my own setup
- [ ] I have read and answered the AI disclosure above honestly
