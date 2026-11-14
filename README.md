# Wild Kids - Computers

A free, offline desktop app where children aged 3 to 12 learn to use a computer by playing and painting. It is a current take on the idea behind GCompris and Tux Paint.

The app has no accounts, ads, purchases, telemetry, or network requests.

## Status

Milestone 1 is in development. Nothing is released yet.

## For grown-ups

### The parent corner and the parent gate

The parent corner holds profiles, sound, text, session length, kiosk lock, and the skills each child has practiced. Open it with the padlock button in the bottom right corner of the meadow. The parent gate asks you to type three numbers that it shows as words, such as "four seven two". You can set a PIN of 4 to 8 digits in the parent corner to use instead. The app stores only a salted hash of the PIN.

### Forgot the parent PIN?

1. Close the app. With kiosk lock on, the close asks for the gate, so close it from the operating system instead: Force Quit on macOS, Task Manager on Windows, or your desktop's system monitor on Linux.
2. Open the app's data folder:
   - Linux: `~/.config/Wild Kids - Computers/data`
   - macOS: `~/Library/Application Support/Wild Kids - Computers/data`
   - Windows: `%APPDATA%\Wild Kids - Computers\data`
3. Delete the file `app.json`. Leave everything else.
4. Start the app. It keeps every profile, setting, and picture. It asks you to check the sound and choose kiosk lock again, and the gate goes back to the three numbers.

`app.json` holds only the PIN hash, kiosk lock, whether setup is done, and the last child who played. The gate's "Forgot the PIN?" link shows the same steps.

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
