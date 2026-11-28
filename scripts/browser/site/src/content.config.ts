import { sveltiaLoader } from "astro-loader-sveltia-cms/loader";
import { defineCollection } from "astro:content";

export const collections = {
    posts: defineCollection({ loader: sveltiaLoader("posts") }),
    bundles: defineCollection({ loader: sveltiaLoader("bundles") }),
};
