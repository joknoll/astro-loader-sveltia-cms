# Content images

Use an `image` widget for fields such as `cover`. Let the loader generate the
schema: setting `schema` in `defineCollection` bypasses its generated types.

For local images, use a path relative to the content file (for example,
`../../assets/image.webp`) or a configured Vite alias (for example,
`@/assets/image.webp`). Don't use project-root paths.

The loader marks local paths for Astro's asset pipeline and generates
`ImageMetadata` types, so you can render a local cover with
`<Image src={post.data.cover} alt={post.data.title} />` from `astro:assets`.
Guard optional fields before rendering.
