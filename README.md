# Compare

An offline side-by-side compare for XML, JSON and text (2–5 files) in a single HTML file. Open `Compare.html` in Chrome or Edge.

## Features

- VS Code-style panes. Base is red, file 2 green, file 3 orange, 4 purple, 5 blue. The 3rd pane can be switched to the remaining files and closed.
- XML ignores attribute order; JSON ignores key order (and optionally array order). Options to ignore whitespace, case and named fields (for example timestamps).
- Each change shows its exact path (`/config/sftp/port`, `$.payment.mode`). Next/previous change with F7. Only-changes view.
- Drop files or paste text. Save a Markdown report. Recent compares are remembered on this computer.
- Light, dark and auto themes.

## Security (for IT review)

- **No network access.** The file carries a Content-Security-Policy (`default-src 'none'`) that makes the browser block every network request. There are no CDNs, fonts, analytics or update checks.
- **No installation, no server, no third-party code.** Plain HTML, CSS and JavaScript, all inside the file, readable in any text editor.
- **No AI**, and no data is sent anywhere.
- Files you compare are read in the browser and never leave the computer.
- **The code contains no company or client data.**

## Building from source

The HTML file is generated from `src/` with Python 3 (no packages needed):

```
python3 build.py
```

This repository has no GitHub Actions workflows, so pushing doesn't run any builds.
