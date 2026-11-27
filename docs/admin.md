# Admin page

The integration adds a prerendered admin page at `/admin`. The `route` option
changes that path. The title is the first specified value from `title`,
`config.app_title`, and `Sveltia CMS`. This value is used in the initial HTML
and as Sveltia's app title after initialization. Sveltia may prefix the tab
with the current view or entry title.

## Public component

`astro-loader-sveltia-cms/admin.astro` is a public Astro component with no props
or slots. It renders a complete HTML document, sets `noindex`, and starts
Sveltia with the integration's CMS configuration. It is intended for a
standalone page, not for use inside a layout or as an embeddable CMS widget.

The component requires `astro-loader-sveltia-cms` to be registered in the site's
Astro config. The integration supplies the config and title at build time and
still injects its own route. For example, a separate page at
`src/pages/editor.astro` can render the same admin screen as the injected route:

```astro
---
import Admin from "astro-loader-sveltia-cms/admin.astro";

export const prerender = true;
---

<Admin />
```

The wrapper declares its own `prerender` because route exports on imported
components do not apply to the wrapper page. The integration's `route` option
alone suffices when only the URL of the injected page needs to change.
