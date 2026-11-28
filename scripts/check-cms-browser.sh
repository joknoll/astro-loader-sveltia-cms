#!/usr/bin/env bash
set -euo pipefail

root=$(cd -- "$(dirname -- "$0")/.." && pwd)
project=$root
archive=
candidate=
install_browser=false
engine=${CMS_BROWSER_ENGINE:-chromium}
provider=${CMS_BROWSER_PROVIDER:-}
usage() {
    printf 'Usage: bash %s [--archive package.tgz | --candidate] [--install-browser]\n' "$0" >&2
    exit 2
}
while [[ $# -gt 0 ]]; do
    case "$1" in
        --archive)
            [[ $# -ge 2 ]] || usage
            archive=$(realpath "$2")
            shift ;;
        --candidate) candidate=${CMS_BROWSER_CANDIDATE:-5.0.3} ;;
        --install-browser) install_browser=true ;;
        *) usage ;;
    esac
    shift
done
[[ -z $archive || -z $candidate ]] || usage
[[ -z $candidate || $candidate =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || usage
case "$engine" in chromium|firefox|webkit) ;; *) usage ;; esac
case "$provider" in ""|github|gitlab|gitea|forgejo) ;; *) usage ;; esac
[[ -z $provider || $engine == chromium ]] || usage

scratch=$(mktemp -d "${TMPDIR:-/tmp}/sveltia-browser.XXXXXX")
cleanup() {
    if [[ ${CMS_BROWSER_KEEP_TMP:-0} == 1 ]]; then
        printf 'Kept browser workspace: %s\n' "$scratch" >&2
    else
        rm -rf -- "$scratch"
    fi
}
trap cleanup EXIT
export ASTRO_TELEMETRY_DISABLED=1

if [[ -n $candidate ]]; then
    # Resolve the candidate against a copy of the workspace lock, not the checkout.
    project=$scratch/candidate
    mkdir -p "$project/example"
    cp -R "$root"/{package.json,pnpm-lock.yaml,pnpm-workspace.yaml,src,tsconfig.json,vite.config.ts} "$project"
    cp "$root/example/package.json" "$project/example"
    (
        cd "$project"
        node --input-type=commonjs - "$candidate" <<'JS'
const { writeFileSync } = require("node:fs");
const manifest = require("./package.json");
manifest.dependencies["@sveltia/cms"] = process.argv[2];
writeFileSync("package.json", JSON.stringify(manifest, null, 4) + "\n");
JS
        vp install --no-frozen-lockfile --prefer-offline
        vp run build
        vp pm pack --out "$scratch/candidate.tgz"
    )
    archive=$scratch/candidate.tgz
elif [[ ( -z $archive && ! -f $project/dist/admin.astro ) || ! -d $project/node_modules/@sveltia/cms ]]; then
    printf '%s\n' 'Run vp install --frozen-lockfile and vp run build first.' >&2
    exit 1
fi

version=$(node --input-type=commonjs -p 'require(process.argv[1]).version' "$project/node_modules/@sveltia/cms/package.json")
if [[ -n $candidate && $version != "$candidate" ]]; then
    printf 'Expected Sveltia %s, got %s\n' "$candidate" "$version" >&2
    exit 1
fi
lane=${candidate:+candidate}
printf 'Sveltia browser gate (%s): %s, %s, %s\n' "${lane:-locked workspace}" "$version" "$engine" "${provider:-test-repo}"

site=$scratch/site
package=$site/node_modules/astro-loader-sveltia-cms
mkdir -p "$package" "$site/content/posts" "$site/content/bundles"
cp -R "$root/scripts/browser/site/." "$site"
if [[ -n $archive ]]; then
    tar -xzf "$archive" --strip-components=1 -C "$package"
else
    cp -R "$project"/{dist,package.json} "$package"
fi
# Keep the integration inside the Astro root; Astro resolves scripts in the injected
# component relative to that root. Dependencies still come from the selected workspace.
ln -s "$project/node_modules" "$package/node_modules"
ln -s "$project/node_modules/astro" "$site/node_modules/astro"
printf '{"type":"module"}\n' > "$site/package.json"

browser_tools=$scratch/tools
npm install --prefix "$browser_tools" --no-save --no-package-lock --prefer-offline --ignore-scripts @playwright/test@1.65.0
if "$install_browser"; then
    "$browser_tools/node_modules/.bin/playwright" install --with-deps "$engine"
fi
check=check.mjs
if [[ -n $provider ]]; then
    check=check-provider.mjs
fi
cp "$root/scripts/browser/$check" "$browser_tools"
node "$browser_tools/$check" "$site"
