import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";
import { cdnAdapter } from "@vinext/cloudflare/cache/cdn-adapter";

export default defineConfig({
  plugins: [
    // Public page caching runs on Cloudflare's own edge cache, and nothing else.
    //
    // Rendered HTML for the catalogue, a shelf, a product and the blog is stored
    // by Workers Cache with a per-response `Cache-Control` policy and a
    // `Cache-Tag`, so a warm visitor never reaches the Worker at all and a
    // product edit purges exactly the pages it changed. The adapter stores
    // nothing itself (`set` is a no-op), which is the point.
    //
    // This used to be a KV data adapter, and that was the bug. Measured
    // 2026-09-29 on the preview deployment: every KV write answered "KV put()
    // limit exceeded for the day", so each render silently lost its cache entry —
    // `/products` took 899 ms and `/blog` 902 ms for every visitor, the ISR cache
    // reported MISS forever, and a product save failed outright with a 502 when
    // the purge path tried to write its tag marker. A free Workers KV namespace
    // allows a thousand writes a day, and a storefront that writes one entry per
    // render spends that in minutes. Workers Cache has no such budget.
    //
    // The cost of dropping it is that `next.revalidate` on a `fetch` no longer
    // survives a Worker restart (there is no durable data store). That is
    // deliberate: the product and blog reads are cached as *pages* a level up, so
    // the origin round trip they were meant to save happens once per page per
    // window instead of once per render.
    vinext({
      prerender: { routes: "*" },
      cache: {
        cdn: cdnAdapter(),
      },
    }),
    cloudflare({
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
});
