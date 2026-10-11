# astro-loader-sveltia-cms

Sveltia CMS integration for Astro 7.
This serves the [Sveltia CMS](https://sveltiacms.app) admin UI and provides a
content loader for Astro content collections, including automatic Zod schema generation.

## Quick Start

Register the integration in `astro.config.mjs`:

```js
import { defineConfig } from "astro/config";
import sveltia from "astro-loader-sveltia-cms";

export default defineConfig({
    integrations: [
        sveltia({
            config: {
                backend: { name: "github", repo: "my-org/my-site", branch: "main" },
                media_folder: "public/images",
                collections: [
                    {
                        name: "posts",
                        folder: "src/content/posts",
                        fields: [
                            { name: "title", widget: "string" },
                            { name: "date", widget: "datetime" },
                            { name: "draft", widget: "boolean", required: false },
                            { name: "body", widget: "markdown" },
                        ],
                    },
                ],
            },
        }),
    ],
});
```

Use the content loader in `src/content.config.ts`:

```ts
import { defineCollection } from "astro:content";
import { sveltiaLoader } from "astro-loader-sveltia-cms/loader";

const posts = defineCollection({ loader: sveltiaLoader("posts") });

export const collections = { posts };
```

## Loader support and limitations

- Collections must have a non-empty `folder` and a `fields` array. File-backed collections and `{{locale}}` folder placeholders are rejected.
- When `extension` is omitted, the loader uses `yml` for YAML, `json` for JSON, `toml` for TOML, `txt` for raw files, and `md` otherwise. Astro must have an entry parser registered for the selected extension; inferring an extension does not add a parser.
- Name-based lookup currently reads `.astro/integrations/astro-loader-sveltia-cms/config.json` relative to the working directory. Run Astro from the site root with its default generated-files directory, or pass a collection object directly to the loader.
- Relations are converted to Astro references assuming the stored value matches the target entry ID and the CMS collection name matches the Astro collection key. Custom `value_field` mappings are not resolved.
- Top-level list/key-value storage (`root: true`) and locale-specific data layouts are not supported.

## Development

```bash
vp install
vp check
vp test
vp pack
```

Use `vp run format` to format code and `vp run format:check` to verify formatting.
See [Code style](docs/code-style.md) for the formatter profile and unsupported rules.

See the `example` directory for a complete Astro setup.
