import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

import { chromium, expect, firefox, webkit } from "@playwright/test";

const site = process.argv[2];
const require = createRequire(join(site, "package.json"));
const { preview } = await import(pathToFileURL(require.resolve("astro")).href);
const astroBin = join(
    dirname(require.resolve("astro/package.json")),
    "bin",
    "astro.mjs",
);
const base = "/browser-gate/";

const postTitle = "Browser Post";
const createdBody = "Created via CMS: café.";
const updatedBody = "Updated via CMS: crème brûlée.";
const originalPath = "content/posts/browser-post.json";
const renamedPath = "content/posts/moved-post.json";
const bundleTitle = "Browser Bundle";
const bundleBody = "Bundle body saved by Sveltia.";
const bundlePath = "content/bundles/browser-bundle/index.md";
const coverName = "bundle-cover.png";
const coverPath = `content/bundles/browser-bundle/${coverName}`;
// A generated 16×10 solid-color PNG, not dependent on example content.
const cover = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAABAAAAAKCAIAAAAy3EnLAAAAFElEQVR4nGPgijpBEmIY1TA0NQAABye7gdZHnMkAAAAASUVORK5CYII=",
    "base64",
);

function build() {
    const result = spawnSync(process.execPath, [astroBin, "build"], {
        cwd: site,
        encoding: "utf8",
        timeout: 120_000,
    });
    if (result.error || result.status !== 0) {
        console.error(result.stdout, result.stderr);
        throw (
            result.error ??
            new Error(`Astro build failed: ${result.signal ?? result.status}`)
        );
    }
}

async function readTestRepo(page) {
    // Read the real test backend's origin-private filesystem. Never write to it here.
    return page.evaluate(async () => {
        const storage = await navigator.storage.getDirectory();
        const repo = await storage.getDirectoryHandle("sveltia-cms-test");
        const files = {};
        async function walk(directory, prefix) {
            for await (const [name, handle] of directory.entries()) {
                const path = prefix + name;
                if (handle.kind === "directory") {
                    await walk(handle, `${path}/`);
                } else {
                    const file = await handle.getFile();
                    files[path] = [...new Uint8Array(await file.arrayBuffer())];
                }
            }
        }
        await walk(repo, "");
        return files;
    });
}

async function preserveFixture(name, bytes) {
    const directory = process.env.CMS_BROWSER_FIXTURE_DIR;
    if (directory) {
        await mkdir(directory, { recursive: true });
        await writeFile(join(directory, name), bytes);
    }
}

const mirroredPaths = new Set();
async function mirrorTestRepo(page, expectedPaths) {
    const files = await readTestRepo(page);
    const byPath = (a, b) => a.localeCompare(b);
    assert.deepEqual(
        Object.keys(files).sort(byPath),
        [...expectedPaths].sort(byPath),
        "test repo paths",
    );
    for (const path of mirroredPaths) {
        if (!Object.hasOwn(files, path)) {
            await rm(join(site, path));
            mirroredPaths.delete(path);
        }
    }
    const bytes = new Map();
    for (const path of expectedPaths) {
        const target = join(site, path);
        const content = Buffer.from(files[path]);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, content);
        assert.deepEqual(await readFile(target), content, `mirrored ${path}`);
        bytes.set(path, content);
        mirroredPaths.add(path);
    }
    return bytes;
}

build();
const server = await preview({ root: site, server: { host: "127.0.0.1", port: 0 } });
const origin = `http://127.0.0.1:${server.port}`;
let browser;
let admin;
const browserWarnings = [];
const engine = process.env.CMS_BROWSER_ENGINE ?? "chromium";
let stage = `launch ${engine} (run with --install-browser if dependencies are missing)`;
try {
    browser = await { chromium, firefox, webkit }[engine].launch();
    const context = await browser.newContext({
        locale: "en-US",
        serviceWorkers: "block",
    });
    context.setDefaultTimeout(15_000);
    const pageErrors = [];
    const configRequests = [];
    context.on("request", (request) => {
        if (/\/config\.(?:ya?ml|json)$/.test(new URL(request.url()).pathname)) {
            configRequests.push(request.url());
        }
    });
    // The version checker and external asset sources cannot affect the test.
    await context.route("**/*", (route) =>
        new URL(route.request().url()).origin === origin
            ? route.continue()
            : route.abort(),
    );
    admin = await context.newPage();
    const rendered = await context.newPage();
    for (const page of [admin, rendered]) {
        page.on("pageerror", (error) => pageErrors.push(error.message));
        page.on("console", (message) => {
            if (["error", "warning"].includes(message.type())) {
                browserWarnings.push(message.text());
            }
        });
    }

    const editor = admin.getByRole("group", { name: "Content Editor" });
    const title = editor.getByRole("textbox", { name: "Title", exact: true });
    const body = editor.getByRole("textbox", { name: "Body", exact: true });
    const postRow = admin.getByRole("row", { name: postTitle, exact: true });
    const newEntry = admin.getByRole("button", {
        name: "Create New Entry",
        exact: true,
    });
    const save = async () => {
        await editor.getByRole("button", { name: "Save", exact: true }).click();
        await expect(editor).toBeHidden({ timeout: 15_000 });
    };
    const openSite = async () => {
        const response = await rendered.goto(origin + base);
        assert.equal(response?.status(), 200);
    };
    const renderPost = async (id, text) => {
        build();
        await openSite();
        const posts = rendered.getByRole("region", { name: "Posts", exact: true });
        const article = posts.locator(`article[data-id="${id}"]`);
        await expect(posts.locator("article")).toHaveCount(1);
        await expect(article.getByRole("heading")).toHaveText(postTitle);
        await expect(article.locator("p")).toHaveText(text);
    };

    stage = "open injected CMS route and sign in to test-repo";
    const response = await admin.goto(`${origin}${base}cms/`);
    assert.equal(response?.status(), 200);
    await expect(admin).toHaveTitle(/Browser Gate CMS/);
    await admin.getByRole("button", { name: "Work with Test Repository" }).click();
    await expect(admin.getByRole("button", { name: "Show Account Menu" })).toBeVisible({
        timeout: 15_000,
    });
    await expect(admin).toHaveTitle(/Browser Gate CMS/);
    assert.deepEqual(await readTestRepo(admin), {});

    stage = "create and render a JSON entry";
    await newEntry.first().click(); // Header and empty state both offer the same action.
    await title.fill(postTitle);
    await body.fill(createdBody);
    await save();
    const created = await mirrorTestRepo(admin, [originalPath]);
    assert.deepEqual(JSON.parse(created.get(originalPath).toString("utf8")), {
        title: postTitle,
        body: createdBody,
    });
    await preserveFixture("browser-post.json", created.get(originalPath));
    await renderPost("browser-post", createdBody);
    console.log("PASS: create JSON in CMS, export OPFS bytes, render in Astro");

    stage = "reload the CMS, reopen, update, and render the saved entry";
    await admin.reload();
    await postRow.click();
    await expect(title).toHaveValue(postTitle);
    await expect(body).toHaveValue(createdBody);
    await body.fill(updatedBody);
    await save();
    const updated = (await mirrorTestRepo(admin, [originalPath])).get(originalPath);
    assert.deepEqual(JSON.parse(updated.toString("utf8")), {
        title: postTitle,
        body: updatedBody,
    });
    await renderPost("browser-post", updatedBody);
    console.log("PASS: read after CMS reload, update, and render new body");

    stage = "rename the entry slug, remove the old file, and render the new ID";
    await postRow.click();
    const slugPanel = editor.getByRole("radio", { name: "Slug", exact: true });
    if (!(await slugPanel.isChecked())) {
        await slugPanel.click();
    }
    await editor.getByRole("button", { name: "Edit Slug", exact: true }).click();
    await editor.getByRole("textbox", { name: "Slug", exact: true }).fill("moved-post");
    await editor.getByRole("button", { name: "Done", exact: true }).click();
    await save();
    const renamed = (await mirrorTestRepo(admin, [renamedPath])).get(renamedPath);
    assert.deepEqual(renamed, updated, "renaming only changes the path");
    await renderPost("moved-post", updatedBody);
    console.log("PASS: rename in CMS, replace old path, render only the new Astro ID");

    stage = "delete the entry in CMS and rebuild the same Astro site";
    await postRow.getByRole("checkbox").click();
    await admin
        .getByRole("button", { name: "Delete Selected Entry", exact: true })
        .click();
    await admin.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(postRow).toBeHidden({ timeout: 15_000 });
    await mirrorTestRepo(admin, []);
    build();
    await openSite();
    await expect(rendered.locator("article")).toHaveCount(0);
    console.log("PASS: delete in CMS, export removal, rebuild with no stale entry");

    stage = "upload a page-bundle image, save, and render in Astro";
    await admin.getByRole("treeitem", { name: /^Bundles\b/ }).click();
    await admin.getByRole("main", { name: /Bundles/ }).waitFor();
    await newEntry.first().click();
    await title.fill(bundleTitle);
    await body.fill(bundleBody);
    await editor.getByRole("button", { name: "Browse", exact: true }).click();
    const [chooser] = await Promise.all([
        admin.waitForEvent("filechooser"),
        admin.getByRole("button", { name: "Upload", exact: true }).click(),
    ]);
    await chooser.setFiles({ name: coverName, mimeType: "image/png", buffer: cover });
    await expect(
        admin.getByRole("option", { name: coverName, exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await admin.getByRole("button", { name: "Insert", exact: true }).click();
    await expect(
        editor.getByRole("textbox", { name: "Cover", exact: true }),
    ).toHaveText(coverName);
    await save();
    const bundle = await mirrorTestRepo(admin, [bundlePath, coverPath]);
    assert.deepEqual(bundle.get(coverPath), cover, "uploaded bytes in the page bundle");
    assert.match(
        bundle.get(bundlePath).toString("utf8"),
        /^cover: "bundle-cover\.png"$/m,
    );
    await preserveFixture("browser-bundle.md", bundle.get(bundlePath));
    await preserveFixture(coverName, bundle.get(coverPath));
    build();
    await openSite();
    const article = rendered.locator('article[data-id="browser-bundle"]');
    await expect(article.getByRole("heading")).toHaveText(bundleTitle);
    await expect(article.locator("p")).toHaveText(bundleBody);
    const image = article.getByRole("img", { name: "Uploaded bundle cover" });
    await expect(image).toHaveAttribute("src", /^\/browser-gate\/_astro\//);
    await expect.poll(() => image.evaluate((element) => element.naturalWidth)).toBe(8);
    console.log(
        "PASS: bundle upload bytes and relative path, Markdown body, optimized image served",
    );

    assert.deepEqual(pageErrors, [], "uncaught browser errors");
    assert.deepEqual(
        configRequests,
        [],
        "CMS must use the injected config, not a config file",
    );
} catch (error) {
    console.error(`Browser gate failed: ${stage}`);
    if (browserWarnings.length) {
        console.error(browserWarnings.join("\n"));
    }
    if (admin) {
        console.error(
            await admin
                .locator("body")
                .ariaSnapshot()
                .catch(() => "No CMS snapshot"),
        );
    }
    throw error;
} finally {
    try {
        await browser?.close();
    } finally {
        await server.stop();
    }
}
