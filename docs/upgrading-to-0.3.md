# Upgrading to 0.3.0

This release still uses Sveltia CMS 0.269.2 and requires Astro 7. Sveltia 5 is a separate [migration](sveltia-5-migration.md).

## Entry IDs and relations

The loader now uses the file path relative to the collection folder, without the extension. Page bundle IDs omit the shared index filename. IDs retain their spelling rather than using Astro's slugification or a front matter `slug` override. Check routes, `getEntry()` calls, and links that use entry IDs. Redirect changed public URLs if necessary.

Relations resolve the stored CMS slug when the Astro collection key matches the CMS collection name. Omit `value_field` or use `{{slug}}`. A relation that stores another field needs a custom mapping with a native or custom Astro loader.

## Images and dates

Image fields return `ImageMetadata` for imported assets or `string` for public and remote URLs. Blank optional images are absent. Use Astro's `<Image>` for metadata and render URL strings separately. The [image guide](image-optimization.md) has an example.

Offset-free ISO DateTime values are interpreted as UTC. Check pages that relied on the build machine's timezone or used non-ISO date strings.

## Collection layouts

A regular folder collection now reads direct children only. Use the supported nested or page-bundle configuration where appropriate. Filtered collections, special collection-level `index_file` entries, localized layouts, and unsupported path or format settings fail explicitly with `sveltiaLoader`. The CMS admin can still be paired with native Astro loaders for those layouts.

JSON and YAML entries keep their inline body in `entry.data`. A separate Markdown body is available through `entry.body` and `render()`, including when the CMS renames the body field. See the [compatibility matrix](compatibility.md) for supported layouts and native-loader examples.
