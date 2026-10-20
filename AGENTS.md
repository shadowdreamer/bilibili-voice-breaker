# Project guidance

This repository is a local Chrome Manifest V3 extension for Bilibili UP 主 volume whitelisting.

- Follow Chrome Manifest V3 guidance and verify browser API changes against official Chrome / Edge documentation. Development skill references are not vendored in this open-source repository.
- Use WXT, strict TypeScript, and native DOM/CSS for the current small popup. Keep permissions restricted to the functionality actually used.
- Unknown uploaders and failed lookups must stay at the configured quiet volume. Never retain the previous video's whitelist allowance during navigation or accept a stale lookup response.
- Treat uploader names and persisted settings as untrusted data. Use text nodes, validate IDs and volume bounds, and keep API destinations fixed.
- Do not unmute videos or start playback. Pausing control must release listeners and restore the volume captured before control, exactly once.
- Keep persistent business state in `chrome.storage.local`; the background write queue is only an ephemeral serialization mechanism.
- Run `npm run check` after logic changes. For changes affecting navigation, volume, or popup interactions, build and run `npm run test:e2e` using Playwright Chromium or a supported `CHROMIUM_PATH`.
- Browser tests use mocked Bilibili pages and API responses. Do not present them as real-site acceptance. Track live checks in `docs/manual-testing.md`.
- Keep README and privacy notes consistent with actual behavior. The product performs volume policy, not loudness normalization or voice separation.
