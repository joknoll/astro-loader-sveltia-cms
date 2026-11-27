---
name: sveltia-astro-upgrade
description: Propose and verify dependency upgrades or migrations for astro-loader-sveltia-cms, Sveltia CMS, Astro, or the workspace Vite toolchain. Use when comparing versions, reviewing dependency PRs, or staging an upstream migration.
---

# Sveltia and Astro upgrades

The deliverable is a reviewable PR proposal. Never merge, tag, publish, or weaken the required checks. Leave release versioning and approval to the maintainer.

1. Record the current commit, Node and package manager versions, the resolved versions in `pnpm-lock.yaml`, the Astro peer range, and the candidate versions. Check [Sveltia's documentation inventory](https://sveltiacms.app/llms.txt), [Astro content collections](https://docs.astro.build/en/guides/content-collections/), and both projects' release and migration notes. Read [the support matrix](../../../docs/compatibility.md) before broadening a claim.
2. Start with a frozen install and a passing baseline. Isolate app/editor changes from Astro and Vite changes. For a combined upgrade, run baseline, candidate Sveltia on baseline Astro, candidate Astro on baseline Sveltia, then both candidates. Pin exact versions in the compatibility runs; a manifest range is not evidence of the resolved version.
3. Run the same commands as `.github/workflows/ci.yml`: `vp install --frozen-lockfile`, `vp check`, `vp test --run`, `vp run build`, and `vp run --filter example build`. Pack with `vp pm pack --out "$artifact"` to an absolute path outside the checkout. Run `bash scripts/check-packed-consumer.sh "$artifact"` for the isolated Astro peer-floor and current workspace lanes. Include a plain npm lane and the latest compatible Astro if those are not covered by the default matrix.
4. Run the Chromium CMS round trip with the exact packed artifact, following the setup in `.github/workflows/ci.yml`. Repeat it with the candidate version as appropriate. Preserve representative files written by old and candidate versions side by side; never reserialize old fixtures to make a check pass. Capture the saved bytes and assert collection IDs/counts, runtime data, generated types, rendered content, and assets. Compare warm with clean builds for config migrations. Do not rely on a green build as evidence that the editor can start or save.
5. Review manifest, lockfile, config, and fixture changes. Flag incompatible options, changed IDs, output types/storage, editor migrations, and release impact. Keep dependency-only updates separate from user-facing migrations when possible. Document unsupported layouts and unverified states honestly, including credentials, backends, browsers, or adapters outside the gates.
6. Propose the PR with an exact version/results table. State which lanes and configs each result covers, which commands failed or were skipped, and what the maintainer should verify before approving. A successful check is not authorization to merge, create a release tag, or publish to npm.
