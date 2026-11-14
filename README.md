# Wild Kids - Computers

A free, offline desktop app where children aged 3 to 12 learn to use a computer by playing and painting. It is a current take on the idea behind GCompris and Tux Paint.

The app has no accounts, ads, purchases, telemetry, or network requests.

## Status

Milestone 1 is in development. Nothing is released yet.

## Read more

[AGENTS.md](AGENTS.md) indexes the repository: the spec, the architecture, the research behind the design rules, and where each part of the code lives.

## Develop

Use Node 24.22.2. The version is pinned in `.node-version`, and npm refuses to install on any other version.

```sh
npm ci              # install exact dependency versions
npm run dev         # Vite and Electron together, with hot reload for the renderer
npm run lint        # Oxlint with type-aware rules
npm run typecheck   # type check every project
npm test            # unit tests with coverage
npm run e2e         # build, then Playwright against Electron (prefix with xvfb-run -a without a display)
npm run dist        # unsigned installer for this operating system, written to release/
```

[AGENTS.md](AGENTS.md) lists every command.

## License

MIT. See [LICENSE](LICENSE).
