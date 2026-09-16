# Repository Guidelines

## Project Structure & Module Organization

This is a dependency-free Manifest V3 browser extension. `manifest.json` declares permissions, script order, and browser entry points. Feature scripts live in `content/`; `content/bridge.js` runs in the isolated world and relays messages to the main-world scripts. `background/service-worker.js` handles extension commands and player state. The interface is in `popup/` and `options/`, shared translations in `ui/i18n.js` and `_locales/{fr,en}/`, icons in `icons/`, and optional blocking rules in `rules/ads.json`. Keep `README.md` and `CHANGELOG.md` aligned with user-visible changes.

## Build, Test, and Development Commands

There is no package manager, bundler, or build step. Open `brave://extensions` or `chrome://extensions`, enable Developer mode, and load this repository as an unpacked extension. Reload it there after editing extension files, then refresh SoundCloud. Run `node --test tests/*.test.js` for Node tests, then `for file in content/*.js background/*.js popup/*.js options/*.js ui/*.js; do node --check "$file" || exit; done` for syntax checks.

## Coding Style & Naming Conventions

Follow the existing plain JavaScript style: four-space indentation in JS, two-space indentation in JSON, semicolons, `const`/`let`, and single-quoted JS strings. Use kebab-case filenames (`player-api.js`) and descriptive camelCase identifiers. Keep feature code in its existing module and preserve the script load order in `manifest.json`. Add user-facing strings to both locale catalogs when applicable. No formatter or linter is configured.

## Testing Guidelines

Node regression tests live in `tests/` as `*.test.js`; there is no coverage target. After those and the syntax check, manually verify changed features on `soundcloud.com`, including popup/options flows if affected. Check extension reload, console errors, persisted settings, and playback controls. Test in Chromium and Firefox when changing cross-browser APIs or manifest behavior; note any untested browser in the PR.

## Commit & Pull Request Guidelines

Recent commits use French, descriptive subjects, often prefixed with a release version (`0.10.0 : ...`); focused fixes may use a feature name (`Audio : ...`). Keep subjects specific to the behavior changed. PRs should explain the change, link relevant issues, list manual checks and browser versions, and include screenshots for visual changes. Update documentation and version notes when shipping a user-visible feature.

## Security & Configuration

Main-world content scripts can access the SoundCloud page but not `chrome.*`; route extension API access through `content/bridge.js`. Validate message origin and data when extending the bridge, and request only the permissions needed in `manifest.json`. Do not add remote telemetry or audio extraction behavior.
