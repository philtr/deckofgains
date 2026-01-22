# Repository Guidelines

## Theming
- Any new UI elements or components must explicitly support the **casino** (default), **plain**, and **rugged** themes. Ensure styles, classes, and assets are compatible with each theme and that new theme options are wired through `scripts/constants.js`, `scripts/theme.js`, and `styles.css`.
- Preserve legacy theme URL compatibility: `?theme=rugged` is preferred, but `?rugged=true` should still map to the rugged theme.

## State & URL Persistence
- Workout state and configuration are mirrored into the query string (see `scripts/persistence.js`); keep params backward-compatible when adding new fields.
- Configuration comes from `localStorage` (`deckOfGains:configuration`) only when URL parameters do not explicitly define configuration values.
- Auto-draw intervals are stored in seconds via `autoIntervalSeconds`; the legacy `autoInterval` (minutes) still needs to parse correctly.

## Development Workflow
- Follow a **test-driven development** (TDD) approach. Write or update failing tests before implementing fixes or features, then ensure the tests pass.
- Keep tests up to date with behavior changes and ensure they cover the new functionality.
- Running tests is not required for updating things that don't need to be tested: e.g. README updates, GitHub Actions updates, etc.
- When running the Playwright test suite, install the required browsers (for example with `npx playwright install --with-deps`) instead of skipping the tests.

## Additional Practices
- Maintain clear and concise documentation or comments when behavior might not be obvious.
- Prefer small, focused commits with descriptive messages.

## AI Contributors
- Direct AI agents must format commit messages using the [Conventional Commits](https://www.conventionalcommits.org/) standard.
- Direct AI agents must update the README whenever their changes impact user-facing behavior or instructions.
