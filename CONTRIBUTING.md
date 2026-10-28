# Contributing to THSV StreamBridge

Thanks for helping. Bug fixes, documentation, new add-ons and translations are all welcome.

## Before you start

- For anything bigger than a small fix, open an issue first so we can agree on the approach.
- Security problems go through [SECURITY.md](SECURITY.md), not public issues.
- Be kind: see the [Code of Conduct](CODE_OF_CONDUCT.md).

## Set up a development checkout

You need Windows, Node.js 22 and Git. See [docs/setup.md](docs/setup.md) for running a source checkout next to Streamer.bot.

```powershell
npm ci
npm run build
```

## Before you open a pull request

Run the same checks CI runs:

```powershell
npm run typecheck
npm run lint
npm test
npm run test:browser
```

If you changed an add-on:

- keep `module-package.json` equal to the add-on's runtime manifest, then refresh its file hashes with `npx tsx tools/refresh-addon-integrity.ts <add-on folder>`;
- regenerate its setup page with `npm run docs:addons`; and
- if you changed a Streamer.bot C# source, regenerate the imports with `npm run imports:sync`.

Shipped defaults must stay neutral: no creator names, community names, links or time zones (`tests/unit/shareable-defaults.test.ts` checks this).

## Writing style for docs and wizard text

StreamBridge is for streamers, not developers. Write short, plain sentences, use the exact button and menu names the creator sees, and put steps in the order they are done.

## Building an add-on

Start with [Add-on development](docs/add-on-development.md) and [Add-on capabilities](docs/add-on-capabilities.md). Add-ons run with only the permissions they declare, and can only run Streamer.bot actions the creator approves.

## License

By contributing, you agree that your contribution is licensed under the [MIT License](LICENSE).
