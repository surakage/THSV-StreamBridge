# Asset and third-party notices

## Bloom companion artwork

The archived Bloom companion sprite source images were generated with OpenAI's built-in image-generation service and then materially edited, chroma-keyed, cleaned, registered, composited, and normalized for THSV StreamBridge. The generated and edited assets are preserved under `archive/future-add-ons/bloom-companion/` and are not shipped by the Stage 2 core release.

OpenAI's applicable terms state that, as between the user and OpenAI and to the extent permitted by applicable law, the user owns Output, while also warning that Output may not be unique. See [OpenAI Terms of Use](https://openai.com/policies/terms-of-use/) and [OpenAI Service Terms](https://openai.com/policies/service-terms/).

To the extent the THSV StreamBridge owner holds copyright or other licensable rights in these generated and edited assets, those rights are licensed to recipients under the repository's MIT License. This notice does not promise that AI-generated material is copyrightable in every jurisdiction, unique, exclusive, or free of third-party claims. Downstream users remain responsible for reviewing the assets and their intended branding or commercial use.

Bloom and SlothBloom project names may function as source identifiers. The MIT License grants rights in the shipped software and licensable assets; it does not grant trademark rights or imply endorsement of a fork or derivative project.

## Bundled runtime and production npm dependencies

The portable Windows archive bundles the official 64-bit Node.js 22 runtime and exact lockfile-resolved production dependencies so installation does not run npm or download executable code. The release builder verifies the Node archive against Node.js's published SHA-256 list before copying `node.exe` and its license. The current release uses these direct production dependencies plus their lockfile-resolved transitive dependencies:

| Package | Version | License | Project |
|---|---:|---|---|
| `fflate` | `0.8.3` | MIT | <https://github.com/101arrowz/fflate> |
| `sigstore` | `5.0.0` | Apache-2.0 | <https://github.com/sigstore/sigstore-js> |
| `snappyjs` | `0.7.0` | MIT | <https://github.com/zhipeng-jia/snappyjs> |
| `ws` | `8.21.1` | MIT | <https://github.com/websockets/ws> |
| `zod` | `4.4.3` | MIT | <https://zod.dev> |

Their complete license texts remain in their bundled package directories. The Node.js license is included as `runtime/NODE-LICENSE.txt`. This file is a convenience notice and does not replace those license texts.

## Optional Village Fun Commands content providers

Village Fun Commands can request public content from Cat Facts (`catfact.ninja`), JokeAPI (`v2.jokeapi.dev`), Random Useless Facts (`uselessfacts.jsph.pl`), Numbers API (`numbersapi.com`), and the opt-in Chuck Norris Jokes API (`api.chucknorris.io`). These services are not bundled, operated, endorsed, or guaranteed by THSV StreamBridge. Their availability, content, and terms can change independently.

The helper sends only a fixed provider choice and, for Numbers API, an optional integer. It does not send viewer identity, usernames, free-form chat text, or chat history. Each command has a local fallback library so creators can turn external providers off completely. JokeAPI is requested with its safe-mode and all documented blacklist flags, but creators should still use Chat Guard and review whether third-party humor is appropriate for their audience.
