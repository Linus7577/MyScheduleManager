# CLAUDE.md — My Schedule Manager

The full product spec is in `SPEC.md`. Read the relevant sections before each task.

## Working rules

**Phases**
- Build one phase at a time (`SPEC.md` §13).
- When a phase meets its Definition of Done, give a short report and **stop**. Wait for "next phase".

**Decisions**
- If the spec is ambiguous, contradictory, or impossible on the $0 free tiers (`SPEC.md` §2), ask before coding.
- Verify library APIs, free-tier limits and AI model names against current official docs. Don't rely on memory.

**Code and config**
- Game constants go only in `src/config/game.config.ts`. Finance defaults go only in `src/config/finance.config.ts`.
- All "today" logic uses the owner's timezone (default `Asia/Taipei`), never UTC.
- Every UI string goes through i18n (English + 繁體中文).
- Every table has RLS. Secrets are never `NEXT_PUBLIC_`.

**Docs**
- Update `docs/ARCHITECTURE.md`, `docs/GLOSSARY.md` and `docs/CHANGELOG.md` at the end of every phase.
- The owner learns the system from these docs, so keep them plain-language and big-picture.

**Before marking a phase done:** typecheck, lint and tests must pass. Test mobile (≈390×844) and desktop.

## Owner
- Single user. Learning production engineering.
- Wants to understand components and data flow, not every line of code.
- Prefers short, structured reports.
