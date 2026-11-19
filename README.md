# astro-loader-sveltia-cms

[Sveltia CMS](https://sveltiacms.app) for Astro 7: an admin UI at `/admin` and a
content loader that generates Zod schemas from your CMS fields.

## Quick Start

Register the integration in `astro.config.mjs`:

```js
import sveltia from "astro-loader-sveltia-cms";
import { defineConfig } from "astro/config";

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
import { sveltiaLoader } from "astro-loader-sveltia-cms/loader";
import { defineCollection } from "astro:content";

const posts = defineCollection({ loader: sveltiaLoader("posts") });

export const collections = { posts };
```

The loader supports folder collections only; locale-specific layouts and `root: true`
are unsupported. Astro needs a parser for the chosen file extension. Relations use
Astro collection keys and entry IDs, not custom `value_field` mappings.

Run Astro from the site root with the default `.astro` directory, or pass a CMS
collection object directly to `sveltiaLoader` instead of a name.

See the [example site](example/) and [image guide](docs/image-optimization.md).

## Development

Use Node.js 22.23.4 or newer and Vite+: `vp install`, `vp check`, `vp test`,
`vp pack`. See [code style](docs/code-style.md).

## Releasing

Before the first automated release, add a GitHub Actions Trusted Publisher in
the [npm package settings](https://www.npmjs.com/package/astro-loader-sveltia-cms/access).
Use owner `joknoll`, repository `astro-loader-sveltia-cms`, and workflow
`publish.yml`. Leave the environment blank and allow direct publishing.
Complete the first publish within two days of adding the publisher.

Commit the new version in `package.json` to `main`, then push its matching tag,
such as `v0.2.1`. The workflow runs the checks and both builds, then publishes the
packed library with provenance. A manual run from Actions builds and packages
the library for inspection.
