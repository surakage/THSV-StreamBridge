## What this changes

<!-- One or two sentences, in plain words. -->

## Why

<!-- The problem it fixes or what it makes possible. Link the issue if there is one. -->

## How it was tested

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `npm run test:browser` (if the wizard or overlays changed)
- [ ] Tried on a real setup (describe below)

## Checklist

- [ ] Add-on manifests and `module-package.json` match, and file hashes are refreshed
- [ ] Setup docs regenerated (`npm run docs:addons`) and Streamer.bot imports synced (`npm run imports:sync`) if needed
- [ ] No creator-specific names, links or secrets in shipped defaults
- [ ] CHANGELOG entry, if creators will notice the change
