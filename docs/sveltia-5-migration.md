# Sveltia CMS 5 migration

The workspace baseline remains Sveltia CMS **0.269.2**. **5.0.3** is a staged
candidate, not a change to the default dependency. Sveltia skipped versions
1 through 4. The [5.0 release notes](https://github.com/sveltia/sveltia-cms/releases/tag/v5.0.0)
and [upstream migration guide](https://sveltiacms.app/docs/migration/earlier-versions)
list the removed settings. In 5, those settings prevent the CMS from loading.

| Removed setting                                       | Replacement                                                                           |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Backend `automatic_deployments`                       | `skip_ci` with the opposite boolean                                                   |
| i18n `save_all_locales`                               | `initial_locales: all` for the old `false`; omit `initial_locales` for the old `true` |
| i18n `omit_default_locale_from_filename`              | `omit_default_locale_from_file_path`                                                  |
| i18n `multiple_folders_i18n_root`                     | `multiple_root_folders`; the file layout does not change                              |
| `{{fields._slug}}` and `{{fields._slug \| localize}}` | `slug: { editable: true }` and `slug: { editable: true, i18n: true }`, respectively   |
| Collection `slug_length`                              | `maxlength` under the global `slug` options                                           |
| Collection `yaml_quote: true`                         | `quote: double` under the global `output.yaml` options                                |

Moving `slug_length` and `yaml_quote` to global settings can affect other
collections. The i18n replacements configure the CMS editor; they do not add
localized layout support to `sveltiaLoader`. See the
[compatibility matrix](compatibility.md) for loader-supported storage.

Sveltia 5 still exports `CmsConfig` and the named `init({ config })` function
from `@sveltia/cms`. Its npm module does not initialize automatically. The
integration keeps explicit initialization with the injected config and
`load_config_file: false`. The browser gate checks that neither lane requests a
separate config file.

## Browser gate

Linux CI uses an Ubuntu runner with Node **22.23.4**, `npm`, and Vite+ (`vp`,
with pnpm **12.21.0** from the workspace). No Git provider token, OAuth app,
media key, or configured remote repository is needed.

```sh
vp install --frozen-lockfile
vp run build
vp pm pack --out "$RUNNER_TEMP/astro-loader-sveltia-cms.tgz"
bash scripts/check-cms-browser.sh --archive "$RUNNER_TEMP/astro-loader-sveltia-cms.tgz" --install-browser
```

`--install-browser` runs `playwright install --with-deps chromium` from the
pinned `@playwright/test@1.65.0` installed in a temporary npm prefix. The
installer needs public registry/browser downloads and may use `sudo` for
Ubuntu system packages. For local runs with the matching Chromium and libraries
already installed, omit `--install-browser`. With no `--archive`, the locked
lane uses the workspace's built `dist/` instead of extracting a tarball. It
uses the frozen workspace's Sveltia and Astro dependencies in both cases.

The candidate checks out no new code and changes no tracked manifest or lockfile.
It copies the workspace metadata and source, sets the exact candidate in the
temporary manifest, installs, builds, and packs it before running the same
browser gate. `CMS_BROWSER_CANDIDATE` can select another exact version for an
explicit trial.

```sh
bash scripts/check-cms-browser.sh --candidate --install-browser
```

`CMS_BROWSER_KEEP_TMP=1` retains the temporary workspace for diagnosis.
`CMS_BROWSER_FIXTURE_DIR` optionally records the initial JSON save and the final
Markdown bundle and image as exact bytes. The two versioned captures in
`fixtures/` were identical in this probe; both are replayed by the packed
consumer check. Browser requests outside the loopback preview origin are blocked.

## Verified coverage

Both **0.269.2** and **5.0.3** passed with Astro **7.4.13**, Node **22.23.4**,
and headless Chromium:

- The built admin route loads under a non-root base path and the real `test-repo`
  backend opens without credentials.
- An entry with an inferred JSON format is created, read after a CMS reload,
  updated, renamed through the Slug panel, and deleted in the editor. The old
  paths disappear from the test repository. Astro renders the saved text and
  new ID, then drops the deleted entry on a rebuild of the same site.
- The editor uploads a PNG into a `{{slug}}/index` Markdown page bundle. The
  backend stores the original image bytes next to the Markdown and writes a
  relative image reference, quoted by the migrated `output.yaml.quote` setting.
  Astro renders the Markdown body and Chromium loads
  the resized image from the build's asset path.

`test-repo` saves to Chromium's origin-private filesystem (OPFS), not the host
checkout. The check reads the saved bytes from OPFS without reserializing and
copies them into the disposable Astro site before each build. It does not
simulate a Git commit or delete, use a mocked CMS backend, or verify live Git
provider authentication or Git writes, editorial workflow, localization, or
every widget and format. The candidate result is evidence for these paths only,
not a release or a change to the default version.

The separate [compatibility workflow](../.github/workflows/compatibility.yml) probes
Playwright Firefox and WebKit. Firefox passed the baseline round trip on Ubuntu.
WebKit needs a disposable persistent profile for origin-private file storage;
the probe is not required for release. The scheduled
Chromium provider probes check the token sign-in UI for GitHub, GitLab, Gitea,
and Forgejo with network access blocked; they never enter a token, authenticate,
or issue a Git write. Live provider compatibility requires a separately
authorized disposable repository.
