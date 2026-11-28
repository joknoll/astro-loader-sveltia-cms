# Releases

Weekly dependency changes are proposed as pull requests. That workflow cannot bump the package version, merge the PR, create a release tag, or publish. Major migrations, including Sveltia 5, belong in a separate reviewed change.

A maintainer releases by updating the package version in a reviewed change and pushing a matching `vX.Y.Z` tag on the default branch's history. The publish workflow validates the tag and version, builds one tarball, and checks it in isolated Astro consumers and the browser gate. It records a SHA-512 digest and retains the tarball and checksum in the workflow run for 90 days. The publish job downloads that artifact rather than rebuilding it.

A publish command can fail after npm has accepted its upload. The workflow compares both npm's recorded integrity and the downloaded tarball to the local archive. If the registry serves different bytes, the workflow fails rather than trying to replace the existing release. A failed publish job can be rerun without building another artifact. Re-run failed jobs, not all jobs, to reuse the artifact from the same run.

Dispatching **Publish to npm** without the publish flag only builds and verifies. No credentials from GitHub or an npm account are needed by the isolated consumers or the CMS browser gate.
