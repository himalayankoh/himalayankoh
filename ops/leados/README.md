# HK LeadOS private research runtime

This is a companion to the existing WordPress-backed LeadOS module. It does not
replace Salman OS, n8n, WordPress, checkout or the retail backend.

## Current topology

The owner's Ubuntu WSL Docker host runs the pinned official SearXNG image and a
Caddy gateway from `compose.yml`. Only host loopback port 8890 is published.
Caddy accepts authenticated GET requests to `/search`; other requests return 401.
The SearXNG container has no public port. Keep `settings.yml`, `compose.env` and
authentication tokens in an owner-controlled private directory outside Git.
Use `settings.example.yml` as a configuration template, replacing its secret
privately. `LEADOS_SEARXNG_CONFIG`, `SEARXNG_IMAGE`, `CADDY_IMAGE` and
`LEADOS_RESEARCH_TOKEN` are the compose inputs.

For Docker-hosted n8n, join its existing container to the research network. It polls
the authenticated storefront `/api/leados/research-worker` endpoint, searches
the private gateway, then returns bounded titles, URLs and snippets. It cannot
write products, orders, customer records, company emails or qualification scores.
Claims expire after 120 seconds, retry at most twice and require their nonce when
completed. The UI exposes source failures and the worker heartbeat.

The PC/WSL host must remain online. A temporary WSL keepalive was used during
setup; this is not evidence of automatic restart after a Windows reboot. A
permanent host/service can be selected later without exposing SearXNG publicly.

### Signed-in Windows owner startup

`powershell -NoProfile -File ops/leados/install-research-startup.ps1
-RuntimeDirectory <existing private runtime directory>` installs and starts the
single **HK LeadOS Research Supervisor** task for the current Windows user.
The runtime directory must contain the existing `research-token.txt`. The task
runs at that user's sign-in with limited privileges, needs no saved password,
and does not change execution policy. It keeps WSL alive without the temporary
six-hour limit and checks/restarts the existing loopback bridge every 30 seconds.
It starts only the two existing named research containers; it does not recreate
them, change n8n workflows, alter Hermes or enable email. Unexpected listeners
on port 8891 are left untouched. Logs remain in the private runtime directory.

This is sign-in startup, not unattended startup before Windows login. The PC
must remain awake and the owner session must remain signed in. Inspect the task
and `research-supervisor.log` after a real reboot before claiming reboot recovery
tested. To stop supervision, stop/disable this one task; running private services
are not deleted. It can be restarted with `Start-ScheduledTask -TaskName
'HK LeadOS Research Supervisor'`.

The owner's authenticated n8n API currently belongs to a Windows process on
port 5678; the separate Docker instance on 5680 does not accept that credential.
Use `node ops/leados/windows-search-bridge.mjs --token-file <private token file>`
for this topology and pass `--windows-bridge` to workflow setup. This authenticated
bridge binds only Windows loopback 8891, uses WSL Python to reach the existing
loopback gateway and accepts bounded queries only. It has no arbitrary URL or
command input and no new credential. Start it in a hidden owner-managed process;
PC uptime and restart after reboot remain requirements, not proven availability.

## Workflows and secrets

`scripts/setup-leados-n8n.mjs --connection-env <private Salman OS env> --runtime
<private runtime directory>` reuses the existing n8n API connection and installs
HK-scoped inactive workflows and header credentials. `--update` updates only
these named workflows and refuses to overwrite an active workflow. The exported
JSON templates omit credential references and values.

Install the server-only `LEADOS_RESEARCH_WORKER_TOKEN` on the Worker before
activating **HK LeadOS 2 — Private Research Worker**. The paired n8n credential
must use that same private token. Expanded searches issue at most two queries;
company snippets remain inferred until their actual website is researched.
Expanded queries use an explicit one-item loop: the HTTP response returns to
the loop before the next query starts, and completed responses are combined
once. HTTP batching alone delays request starts without awaiting completion.

`LEADOS_N8N_TOKEN` and `LEADOS_EVENT_TOKEN` authenticate dispatch and event
transports. Their presence does not enable sending. **HK LeadOS 2 — Approved
Outreach (Disabled)** stays inactive with no SMTP credential and false sender
controls. Verified sender identity, postal address, working opt-out handling,
explicit owner-reviewed drafts and live mailbox/event validation are required
before enabling it. HTTP acceptance is not delivery evidence. Unknown SMTP
outcomes require owner review and never trigger an automatic resend.

## Website research and browser boundary

WordPress performs bounded safe-DNS HTTP research: robots check, same-origin
pages, no redirects, no cookies, at most four pages, size/time limits and pacing.
Only observed public role mailboxes become company-email evidence. Manual
contacts and confirmed company locations survive rediscovery.

Rendered browser research is **not configured as an unattended service** in this
release. JS-only pages explicitly report that limitation; they are not silently
treated as verified. Public company pages can be checked in the owner's browser.
The LeadOS evidence panel can save a staff-attested browser observation with a
first-party page URL, visible quote and optional published role mailbox. It
explicitly requires page/policy review, recalculates qualification and preserves
manual contacts; this is not represented as an automated crawler result.
Crawlee/Crawl4AI research and licensing decisions are in
`docs/LEADOS-2-RESEARCH.md`; a protected browser companion needs separate runtime
and network-isolation verification before its readiness can be asserted.

## Verification and rollback

The WordPress **Tools → LeadOS Health** page uses the existing administrator
session, capability check and nonce. Write checks are limited to the exact
`/staging` install and create labelled synthetic prospects only. They preserve
their test evidence, suppress those prospects and perform no provider send or
commerce writes. Production exposes read-only version/schema information.

Back up the active LeadOS PHP file and database before upgrading. Upload the
support file before the main plugin. Migration is additive and deactivation does
not remove tables. Roll back the two PHP files and the previous Worker version;
retain the new tables/columns and existing records. Do not restore an older
commerce database merely to roll back this module.
