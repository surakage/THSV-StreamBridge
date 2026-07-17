# Asset and third-party notices

## Bloom companion artwork

The archived Bloom companion sprite source images were generated with OpenAI's built-in image-generation service and then materially edited, chroma-keyed, cleaned, registered, composited, and normalized for THSV StreamBridge. The generated and edited assets are preserved under `archive/future-add-ons/bloom-companion/` and are not shipped by the Stage 2 core release.

OpenAI's applicable terms state that, as between the user and OpenAI and to the extent permitted by applicable law, the user owns Output, while also warning that Output may not be unique. See [OpenAI Terms of Use](https://openai.com/policies/terms-of-use/) and [OpenAI Service Terms](https://openai.com/policies/service-terms/).

To the extent the THSV StreamBridge owner holds copyright or other licensable rights in these generated and edited assets, those rights are licensed to recipients under the repository's MIT License. This notice does not promise that AI-generated material is copyrightable in every jurisdiction, unique, exclusive, or free of third-party claims. Downstream users remain responsible for reviewing the assets and their intended branding or commercial use.

Bloom and SlothBloom project names may function as source identifiers. The MIT License grants rights in the shipped software and licensable assets; it does not grant trademark rights or imply endorsement of a fork or derivative project.

## Production npm dependencies

The public archive does not bundle `node_modules`; the installer retrieves exact lockfile-resolved production dependencies from npm. Version `1.0.1` uses:

| Package | Version | License | Project |
|---|---:|---|---|
| `ws` | `8.21.1` | MIT | <https://github.com/websockets/ws> |
| `zod` | `4.4.3` | MIT | <https://zod.dev> |

Their complete license texts are installed within their respective package directories by npm. This file is a convenience notice and does not replace those license texts.
