# Google OAuth callback redirect handling

The production trace on October 10, 2026 showed a fresh Google callback returning
307 to `/admin/settings?google=connected`, followed by an internal request to that
destination returning 502 under the same Cloudflare request ID. The response-stage
binding followed the redirect with the original invocation props, redeeming the
authorization code again. The browser therefore received `invalid_grant` after a
successful initial exchange.

An authenticated production probe also verified that the transaction's S256
challenge matches its verifier, state and callback origin. Existing Search Console
and AdSense API reads succeeded. The failure was in response transport.

`preserveCdnStageRedirects()` applies a narrow build transform to the installed
Cloudflare CDN adapter: response-stage `binding.fetch` uses `redirect: "manual"`.
This returns the original status, Location and Set-Cookie headers to the browser.
The transform refuses an unexpected adapter implementation so dependency updates
require review before deployment. The installed package is not edited on disk.

The regression suite executes the installed adapter in workerd through Miniflare.
With disposable application-stage fixtures it reproduces a second exchange and
502, verifies that the fix produces one exchange and 307 with the cookie, and
checks that POST bodies survive the binding. No live Google code, credential or
production data is used in these tests.

After deployment, verify a new connection from Settings in one browser, observe
the success redirect, then test both Search Console and AdSense. Never reload a
callback or revoke the working connection as a diagnostic step.

Reference: [Cloudflare Request redirect behavior](https://developers.cloudflare.com/workers/runtime-apis/request/).
