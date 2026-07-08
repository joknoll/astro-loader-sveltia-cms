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
        backend: {
          name: "github",
          repo: "my-org/my-site",
          branch: "main",
        },
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

const posts = defineCollection({
  loader: sveltiaLoader("posts"),
});

export const collections = { posts };
```

## Development

```bash
vp install
vp check
vp test
vp pack
```

See the `example` directory for a complete Astro setup.
