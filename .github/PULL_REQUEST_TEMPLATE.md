# Pull Request

Thanks for contributing to **Kaiwu (开悟)** — the WPS AI writing add-in.

Please fill in the sections below. CI will run automatically on every push and PR.

## Summary

<!-- One paragraph: what does this PR do, and why? -->

## Type of change

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to change)
- [ ] Documentation / docs only
- [ ] Chore / tooling (CI, deps, build, lint config)
- [ ] Refactor (no functional change)

## How was this tested?

<!-- Describe the tests you ran. For AI / security / API behavior changes, mention which test files were added or modified. -->

- [ ] `npm run lint` — passes locally
- [ ] `npm run format:check` — passes locally
- [ ] `npm run test:serial` — passes locally (deterministic)
- [ ] `npm test` — passes locally
- [ ] I added tests for new behavior (if applicable)

## Checklist

- [ ] My code follows the existing project style (ES5 var/function, no ES6 imports)
- [ ] I have read `docs/security-contract-innerhtml.md` and only used
      `KwSecurity.sanitizeHtml`, `KwMarkdown.render`, or `KwUtils.escapeHtml/escapeAttr`
      for HTML output
- [ ] No new `console.*` calls — I used `KwLogger.debug/info/warn/error('Module', msg)` instead
- [ ] No new dependencies introduced (or rationale added below)
- [ ] `.env` and `taskpane/env.js` were NOT committed
- [ ] `CHANGELOG.md` `[Unreleased]` section was updated (for user-visible changes)

## Linked issues

<!-- Use Fixes #123 or Closes #123 to auto-close issues. -->

## Screenshots (if applicable)

<!-- Drag images here or paste them inline. Especially important for UI changes. -->

## Additional context

<!-- Anything else reviewers should know: trade-offs, follow-up TODOs, perf notes. -->
