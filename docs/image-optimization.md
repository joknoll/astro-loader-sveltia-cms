# Content images

The CMS `image` widget can save both files and URLs. When the loader generates the collection schema, a single image is typed as `ImageMetadata | string`; an optional image can also be `undefined`. Multiple images return an array of those non-blank image values.

| Stored value                                                                               | Astro entry                                                                                   |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| A file relative to the entry, such as `cover.webp`, or a configured Vite alias             | `ImageMetadata` when Astro successfully imports it. A missing import is an Astro build error. |
| An existing project-root source file, such as `/src/assets/cover.webp`                     | `ImageMetadata` when Astro successfully imports it.                                           |
| A public URL such as `/images/cover.webp` or a path to an existing file inside `publicDir` | A public URL string. Astro does not verify or optimize public URL strings.                    |
| Remote URL                                                                                 | The original URL string. The loader does not fetch it.                                        |
| Null or blank optional image                                                               | `undefined`. Blank values are removed from a multiple image list.                             |

A page bundle's entry-relative image stays next to the Markdown file. The Chromium browser gate saves both files with Sveltia and checks that Astro serves the optimized image.

```astro
---
import { Image } from "astro:assets";

const { cover, title } = Astro.props.post.data;
---
{
    typeof cover === "string" ? (
        <img src={cover} alt={title} />
    ) : (
        cover && <Image src={cover} alt={title} />
    )
}
```

An explicit `defineCollection` schema overrides the generated schema and types. It must accept the transformed input shape for any fields it keeps.
