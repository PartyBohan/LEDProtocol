# PartyKeys Protocol documentation

Live site: https://protocol.partykeys.ai/

`index.html` and `developers.html` are intentionally identical entry points.
The site is static and uses the existing GitHub → Vercel production integration.

## Verified lighting integration

See [the published rules](https://protocol.partykeys.ai/#verified-lighting) and
[the full guide](skills/partykeys-protocol/references/verified-web-midi.md).
The reusable Skill, dependency-free modules and tests live in
`skills/partykeys-protocol/`. The profile was user-confirmed in PartyKeys
ChordCut; it is not a blanket certification of all devices or firmware.

Run offline checks with Node 18 or later:

```sh
node --test skills/partykeys-protocol/scripts/lighting.test.mjs skills/partykeys-protocol/scripts/routing.test.mjs tests/site.test.mjs
```

Optional browser checks require Playwright and installed Chrome. Serve the repository
locally, then run `node tests/browser-smoke.mjs`. Set `SITE_URL` to the server URL
(default `http://127.0.0.1:8769`), or to the published site for release verification.
`PLAYWRIGHT_MODULE` may point to an existing Playwright installation.
The walkthrough uses isolated browser contexts, not the user's browser data.

When changing the bundled Skill, regenerate the download from `skills/`:

```sh
zip -X -r ../downloads/partykeys-protocol.zip partykeys-protocol
```

Only ship the intended Skill files. Never include private repositories,
credentials, local environment files or build caches. Preserve existing
input, audio and host-owned connections in target projects.
