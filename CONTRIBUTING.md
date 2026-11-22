# Contributing to gtm-icp-score

Thank you for your interest in contributing! This guide will help you get started.

## Getting Started

1. **Fork** the repository and clone your fork:
   ```bash
   git clone https://github.com/<your-username>/gtm-icp-score.git
   cd gtm-icp-score
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Run the tests** to make sure everything works:
   ```bash
   npm test
   ```

## Development Workflow

1. Create a feature branch from `main`:
   ```bash
   git checkout -b feat/my-feature
   ```

2. Make your changes. Follow the existing code style and conventions.

3. Add or update tests for any new functionality.

4. Run the test suite to verify nothing is broken:
   ```bash
   npm test
   ```

5. Commit your changes with a clear, descriptive message:
   ```bash
   git commit -m "feat: add new scoring rule type"
   ```

## Commit Message Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — A new feature
- `fix:` — A bug fix
- `docs:` — Documentation changes
- `test:` — Adding or updating tests
- `refactor:` — Code changes that neither fix a bug nor add a feature
- `chore:` — Maintenance tasks (dependencies, CI, tooling)

## Pull Requests

- Open PRs against the `main` branch.
- Provide a clear description of what the PR does and why.
- Reference any related issues (e.g., `Closes #12`).
- Ensure all CI checks pass before requesting a review.
- Keep PRs focused — one feature or fix per PR.

## Adding a New Rule Type

If you are adding a new scoring rule type:

1. Implement the rule evaluator in `src/engine.js`.
2. Add schema validation for the rule in `src/validator.js`.
3. Add comprehensive tests in `test/`.
4. Document the rule in `README.md` under **Scoring Rules Reference**.

## Reporting Issues

- Use the GitHub issue tracker.
- Include steps to reproduce, expected behavior, and actual behavior.
- Attach a minimal ICP profile YAML and sample account data if applicable.

## Code of Conduct

Be respectful and constructive. We are all here to build great tools together.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
