import { NextResponse } from 'next/server';

/**
 * Which build is actually deployed.
 *
 * Exists because "the deployed Worker matches a commit" is otherwise unverifiable
 * from outside: the build marker is a local file, and the Worker has no filesystem.
 * The migration rule that produced this route is that a deployment must never be
 * ahead of git, which needs a way to ask a running deployment what it is.
 *
 * Reports the commit and build time only — no branch, no env, no secrets — and
 * `null` when the build was not stamped, so a locally built server answers honestly
 * instead of inventing a SHA. Cacheable for nothing: a cached answer is exactly the
 * thing this endpoint must not give.
 */
export const dynamic = 'force-dynamic';

// `NEXT_PUBLIC_*` on purpose: a Worker has no filesystem and no ambient build
// environment, so a plain `process.env.BUILD_SHA` read at runtime is undefined
// there. The public prefix is what makes the bundler inline the value at build
// time, which is the only moment the answer is known. A commit hash is not a
// secret, so inlining it costs nothing — and the private names are still accepted
// so a locally built server answers too.
export function GET() {
  return NextResponse.json(
    {
      sha: process.env.NEXT_PUBLIC_BUILD_SHA || process.env.BUILD_SHA || null,
      builtAt: process.env.NEXT_PUBLIC_BUILD_TIME || process.env.BUILD_TIME || null,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
