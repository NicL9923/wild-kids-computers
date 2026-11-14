# Wild Kids - Computers

A free, offline desktop app where children aged 3 to 12 learn to use a computer by playing and painting. Electron, TypeScript, React 19, Vite, Tailwind CSS v4, and npm on Node. No Bun, no Rust, no Effect library.

## Repo index

| Path | What it holds |
| --- | --- |
| [docs/spec.md](docs/spec.md) | What the app does, the hard rules, and the definition of done for an activity |
| [docs/architecture.md](docs/architecture.md) | How the code is organized. Read it before adding an activity, tool, effect, string, or asset. |
| [docs/research.md](docs/research.md) | The evidence behind the design rules |
| [docs/decisions.md](docs/decisions.md) | Choices the spec left open, and why each went the way it did |
| `electron/` | Main process and preload |
| `src/core/` | Paint engine, activity kit, storage, strings. No React, no Electron. |
| `src/features/` | One directory per area of the app |
| `assets/` | Fonts, emoji, voice clips, art. Every file has a license entry. |
| `e2e/` | Playwright tests against the Electron app |
| `tools/` | Build, check, and generation scripts |
| `.github/agents/review-agent.md` | The pre-merge review prompt |

## Hard rules

The spec lists eight hard rules. These are the ones a code change breaks most easily.

1. **No network.** Do not add a dependency that makes a network request at runtime. Do not add an HTTP client, analytics, crash reporting, or an updater. `npm run check` fails on a denied package.
2. **Original work only.** Copy no code, art, sound, text, or names from GCompris or Tux Paint. Do not open their source or assets while working here.
3. **Every asset has a license entry.** Add the `LICENSES.json` entry in the same change as the file. Allowed licenses are MIT, Apache-2.0, CC0-1.0, CC-BY-4.0, and OFL-1.1.
4. **No manipulative design.** No stars, points, badges, streaks, leaderboards, countdown clocks, or prompts to keep playing. No character nags or shows disappointment.
5. **Every instruction is spoken.** No activity for ages 3 to 5 requires reading. Each instruction has a replay control.
6. **One learning goal per activity.** Remove animation and sound that do not serve the goal or give feedback on the child's action.
7. **Click before drag.** Every drag uses `useCarry`, which also supports click to pick up and click to place. Double-click and right-click appear only in the activities that teach them.
8. **The renderer has no Node access.** Context isolation and the sandbox stay on. The renderer reaches the system only through `PlatformBridge`.

When two requirements compete, the youngest band wins.

## Conventions

- TypeScript `strict`. No `any` and no non-null assertion without a comment that says why it is safe.
- Module files are camelCase. Component files are PascalCase `.tsx`. Feature and activity directories are kebab-case.
- `src/core/` imports nothing from React, Electron, or `src/` outside `src/core/`. A lint rule enforces this.
- Add items by file convention, never by editing a central list. See "Discovery instead of central lists" in the architecture file.
- Every user-facing string goes through `defineStrings`. No string literals in JSX.
- Sizes, colors, and durations come from tokens in `src/styles/tokens.css`. The smallest target size is the token `--wk-target-min`.
- Activities use `kit.scope` for timers, listeners, and sound. Never the global timer functions.
- Pin exact dependency versions. Verify the current version with `npm view` before adding one.
- Pin GitHub Actions by commit SHA.

## Image comparison method

The paint engine is a software rasterizer over typed arrays with no browser, GPU, or system font involved. Paint tests run in Node and compare each result with a golden PNG exactly. The same pixels come out on a developer machine and in CI. `npm run paint:goldens` rewrites goldens. Look at every changed golden before you commit it.

End-to-end screenshots are for human and agent review. No test compares them.

## Commands

See "Quality gates" in the architecture file for the full list. Run the checks for the areas you touched before you commit.

Electron tests need a display. On a machine without one, run them under `xvfb-run -a`.

## Project workflow

- Before creating a PR, run an independent review of the full branch diff with GPT-6.1 Sol (`gpt-6.1-sol`) at high reasoning effort, following the repo's review-agent guidance if it has one, and address the findings first. Skip this only for super small changes (typo- or few-line-level).
- Always call out in the PR description:
  - What the review agent found and how each finding was addressed, or why it was not.
  - Any product or high-level engineering decisions made in the branch, and whether each was made by "human" or "agent".
- Always web-search for the latest information when doing any sort of research — package versions, docs, tooling, APIs, industry practices, etc. Never rely on model training knowledge for facts about the outside world that may have changed.
