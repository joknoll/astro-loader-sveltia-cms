import sveltia from "astro-loader-sveltia-cms";
import { defineConfig } from "astro/config";

const title = { name: "title", label: "Title", widget: "string" };

export default defineConfig({
    base: "/browser-gate",
    trailingSlash: "always",
    integrations: [
        sveltia({
            route: "/cms",
            title: "Browser Gate CMS",
            config: {
                backend: { name: "test-repo" },
                media_folder: "public/media",
                public_folder: "/media",
                output: { yaml: { quote: "double" } },
                collections: [
                    {
                        name: "posts",
                        label: "Posts",
                        label_singular: "Post",
                        folder: "content/posts",
                        extension: "json",
                        create: true,
                        fields: [
                            title,
                            { name: "body", label: "Body", widget: "text" },
                        ],
                    },
                    {
                        name: "bundles",
                        label: "Bundles",
                        label_singular: "Bundle",
                        folder: "content/bundles",
                        path: "{{slug}}/index",
                        media_folder: "",
                        public_folder: "",
                        create: true,
                        fields: [
                            title,
                            { name: "cover", label: "Cover", widget: "image" },
                            { name: "body", label: "Body", widget: "markdown" },
                        ],
                    },
                ],
            },
        }),
    ],
});
