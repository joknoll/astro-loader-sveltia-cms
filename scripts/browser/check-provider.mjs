import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

import { chromium, expect } from "@playwright/test";

const provider = process.env.CMS_BROWSER_PROVIDER;
const names = {
    github: /GitHub/,
    gitlab: /GitLab/,
    gitea: /Gitea/,
    forgejo: /Forgejo/,
};
const site = process.argv[2];
const require = createRequire(join(site, "package.json"));
const { preview } = await import(pathToFileURL(require.resolve("astro")).href);
const astroBin = join(
    dirname(require.resolve("astro/package.json")),
    "bin",
    "astro.mjs",
);
execFileSync(process.execPath, [astroBin, "build"], {
    cwd: site,
    stdio: "inherit",
    timeout: 120_000,
});
const server = await preview({ root: site, server: { host: "127.0.0.1", port: 0 } });
const origin = `http://127.0.0.1:${server.port}`;
let browser;
try {
    browser = await chromium.launch();
    const context = await browser.newContext({
        locale: "en-US",
        serviceWorkers: "block",
    });
    await context.route("**/*", (route) =>
        new URL(route.request().url()).origin === origin
            ? route.continue()
            : route.abort(),
    );
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const response = await page.goto(`${origin}/browser-gate/cms/`);
    assert.equal(response?.status(), 200);
    await page
        .getByRole("button", { name: "Sign In Using Access Token", exact: true })
        .click();
    const dialog = page.getByRole("alertdialog", {
        name: "Sign In Using Access Token",
    });
    await expect(dialog.getByRole("link", { name: names[provider] })).toBeVisible();
    await expect(page).toHaveTitle(/Browser Gate CMS/);
    assert.deepEqual(errors, []);
    console.log(
        `PASS: ${provider} configuration reached its sign-in UI (no credentials or provider traffic)`,
    );
} finally {
    try {
        await browser?.close();
    } finally {
        await server.stop();
    }
}
