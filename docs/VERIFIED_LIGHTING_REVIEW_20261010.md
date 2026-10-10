# Verified lighting documentation review — 2026-10-10

## Scope and evidence

- Site: https://protocol.partykeys.ai/
- Repository: https://github.com/PartyBohan/LEDProtocol
- Baseline: `cda96ff2d886be6caa5078d663f2243c6d751b82`; the fetched live home page matched the baseline file before changes.
- Profile: `fruit-webmidi-palette71-v1`, based on the user's confirmation of the PartyKeys ChordCut hardware chain.
- This iteration publishes documentation and a reusable Skill. It does not change ChordCut or establish new physical-device test results.

## Delivered and reviewed

- Added a clearly labeled verified-lighting section, full guide, downloadable Skill, dependency-free modules and test sources.
- Separated the verified palette71 speaker-relay profile from direct RGB and PopuPiano references; retained historical examples with explicit scope warnings.
- Updated both AI copy templates with initialization, small-packet pacing, route discovery, shared-connection safety and hardware-verification boundaries.
- Preserved ordinary MIDI input and scoring guidance. Optional speaker audio routing mutes only web piano after reliable speaker-online evidence, never SFX/BGM.
- Published identical `index.html` and `developers.html` entry points. The ZIP exactly matches the 11 bundled Skill files.
- New guidance is complete in English and Chinese. Other existing site languages fall back to English for the new section instead of retaining stale Chinese content.

## New and returning reader walkthrough

An isolated Chrome context starts in English, switches to Chinese, navigates to the verified rules, copies the Skill prompt and full integration template, reloads with the selected language retained, switches to another language and downloads the ZIP. Optional font and syntax-highlighting CDNs are blocked to check degraded-resource usability. No user browser storage is read or reset.

Checked viewport sizes: 393×852, 852×393, 820×1180, 1440×900 and 320×568. All five passed without document-width overflow or JavaScript errors. Phone-portrait and desktop screenshots were also inspected visually.

The review found and fixed an existing duplicate `claude-md` ID that could copy a heading instead of the template, and existing narrow-screen overflow from protocol tables and SDK tabs. Wide tables now scroll within their own regions; SDK tabs wrap on small screens.

## Automated results

- 25 lighting/routing tests passed.
- 6 documentation/package tests passed.
- 5 isolated browser viewport walkthroughs passed.
- `git diff --check` passed.

## Boundaries and follow-up

No new phone, keyboard, speaker or firmware was physically tested in this documentation iteration. An API write is not a physical LED acknowledgment. Each downstream integration must verify real lamps, rapid chord changes, pause/stop, reconnect and current-target restoration on its intended hardware. Broader language translation is optional future work, not claimed here.
