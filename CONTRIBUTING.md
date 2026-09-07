# Contributing to InstaAnalytic

Thank you for your interest in contributing! This guide covers everything you need.

## Before You Start

- Check [open issues](https://github.com/GktuOktay/InstaAnalytic/issues) to avoid duplicate work.
- For large changes (new feature, refactor), open an issue first to discuss the approach.
- For small fixes (typo, one-liner bug), just open a PR.

## Development Setup

```bash
git clone https://github.com/GktuOktay/InstaAnalytic.git
cd InstaAnalytic
cp .env.example .env
docker compose up -d
```

Backend API auto-reloads on file changes. Frontend HMR works via Vite.

## Project Structure

```
backend/app/
  models/    → SQLAlchemy ORM models
  routers/   → FastAPI route handlers
  services/  → Instagram client (instagrapi / Playwright)
  tasks/     → Celery background tasks
  schemas/   → Pydantic request/response models

frontend/src/
  api/       → Axios API clients (typed)
  i18n/      → TR/EN translation strings
  pages/     → Top-level route components
  components/→ Shared UI components
```

## Commit Convention

This project follows [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add CSV export for user pool
fix: correct pagination offset in followers sync
docs: update quick-start setup instructions
chore: bump fastapi to 0.111
refactor: extract rate-limit logic into shared util
test: add unit tests for ghost filter query
```

## Pull Request Checklist

- [ ] Branch name: `feat/...`, `fix/...`, `docs/...`, or `chore/...`
- [ ] Commit messages follow Conventional Commits
- [ ] New UI strings added to both `frontend/src/i18n/tr.ts` and `en.ts`
- [ ] No `.env` or secrets committed
- [ ] `docker compose up -d` still builds successfully
- [ ] PR description explains **what** changed and **why**

## Reporting Bugs

Use the [Bug Report](https://github.com/GktuOktay/InstaAnalytic/issues/new?template=bug_report.md) template. Include:
- Steps to reproduce
- Expected vs. actual behavior
- Docker / OS version
- Relevant logs from `docker compose logs`

## Suggesting Features

Use the [Feature Request](https://github.com/GktuOktay/InstaAnalytic/issues/new?template=feature_request.md) template. Explain the problem you're solving, not just the solution.

## Code Style

- **Python**: PEP 8, type hints required for all public functions, async/await throughout.
- **TypeScript**: strict mode, no `any`, Tailwind for styling.
- Keep functions small and single-purpose.
- No commented-out code — delete it.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
