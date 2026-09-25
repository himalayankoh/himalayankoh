# Permanent Coding Workflow Rules

This workflow is permanently enforced for ALL coding projects.

---

## 1. Repository Is the Source of Truth
- Every project must have one clearly identified active GitHub repository.
- Before doing coding work, always verify:
  - Local project path
  - Current Git repository
  - `git remote -v`
  - Active `origin`
  - Current branch
  - `git status`
- Never accidentally push changes to an old repository, fork, duplicate, backup repository, or previous organization.
- If multiple remotes exist, treat `origin` as the active repository unless explicitly instructed otherwise.

---

## 2. Himalayan Koh Permanent Repository
For Himalayan Koh specifically:
- **Active GitHub repository**: `https://github.com/himalayankoh/himalayankoh.git`
- **Permanent local working directory**: `C:\Users\basco\Downloads\hk\himalayan-koh`
- **Old repository**: `https://github.com/8002salman-ai/himalayan-koh.git` remains as `old-origin` for history/reference only.
- **NEVER** push normal development work to `old-origin`.
- All new Himalayan Koh code must ultimately be committed and pushed to `himalayankoh/himalayankoh`.

---

## 3. Never Create Duplicate Projects
- Do NOT create unnecessary project copies such as:
  - `himalayan-koh-new`
  - `himalayan-koh-final`
  - `himalayan-koh-fixed`
  - `project-v2`
  - temporary replacement repositories
  - fresh Next.js projects replacing the existing repository
- Always work inside the existing repository.
- Temporary files may be created only when technically necessary and must never replace the main working project.

---

## 4. Before Every Coding Task
Before changing code:
1. Inspect current branch
2. Run `git status`
3. Fetch latest remote information
4. Inspect relevant existing implementation
5. Understand dependencies
6. Identify whether requested feature already partially exists
7. Avoid rewriting working systems unnecessarily
- Never blindly replace code that is already working.

---

## 5. Branch Safety
- Do not make experimental changes directly on `main`.
- For meaningful development work, use or continue an appropriate feature/fix branch:
  - `fix/...`
  - `feat/...`
  - `integration/...`
  - `chore/...`
- If already working on a valid development branch, continue there instead of unnecessarily creating another branch.
- Do not create dozens of unnecessary branches.

---

## 6. Commit Completed Work
When a coding task is completed and verified:
1. Review `git diff`
2. Confirm no secrets or accidental files are included
3. Stage only relevant files
4. Create a meaningful Git commit
5. Push the branch to the ACTIVE `origin`
- Do not leave important completed work only on the local machine.
- Core cycle: **Local coding → Test → Commit → Push to active GitHub repo**.

---

## 7. Do Not Push Broken Code
Before committing/pushing, run relevant available checks:
- TypeScript / typecheck
- Lint
- Unit tests
- Integration tests
- Build
- Security checks
- Smoke tests / browser verification
- For Himalayan Koh specifically:
  - `npm run typecheck`
  - `npm run lint`
  - `npm test`
  - `npm run build`
- Do not unnecessarily run destructive setup/reset/database commands.
- If a check fails because of your changes, fix it before treating the task as complete.
- If failure is unrelated/pre-existing, report it clearly.

---

## 8. Never Commit Secrets
Never commit:
- `.env`, `.env.local`, `.env.*`
- API keys, GitHub tokens, Personal Access Tokens
- Stripe secret keys
- Database passwords
- WordPress application passwords
- SSH private keys
- Cloudflare secrets / API tokens
- Supabase service keys
- Any other credentials or sensitive customer data
- If a secret appears inside source code, remove it immediately and use environment variables. Inspect `git diff` for accidental credentials before committing.

---

## 9. Production / Main Protection
- Do NOT automatically merge or push unverified development directly into `main`.
- Normal workflow: `feature/fix branch` → test → commit → push → verify → prepare merge into `main`.
- Only merge into `main` when the work is stable and appropriate for production.
- Never force-push `main`.

---

## 10. Deployment Rule
- A successful local change is not automatically a successful deployment.
- After deployment, where possible verify:
  - Site loads cleanly (HTTP 200)
  - Critical routes work
  - Browser console has no serious errors
  - APIs respond as expected
  - Authentication/login works where relevant
  - Important forms function
  - Checkout and order flows remain unbroken
  - Mobile and desktop layouts remain usable
- For staging environments, verify staging before recommending production release.

---

## 11. Preserve Architecture
- Do not replace existing architecture simply because another technology seems easier. Understand the current system first.
- For Himalayan Koh current direction is:
  - Next.js frontend/storefront
  - Cloudflare Workers deployment
  - WordPress / WooCommerce retail backend
  - WordPress as retail source of truth
  - Isolated Wholesale / B2B module
  - Stripe payments
  - Existing shipping / packing integrations
  - No return to Supabase for retail runtime unless explicitly requested
- Historical Supabase files may remain for archive/history but must not quietly become runtime dependencies.

---

## 12. Existing Code First
- Before creating a new component, API route, database abstraction, hook, utility, or service:
  - Search the existing codebase first.
  - Reuse or extend existing code where reasonable.
- Avoid duplicate API clients, auth systems, checkout logic, product loaders, environment variables, or parallel implementations. Prefer one clear implementation.

---

## 13. Avoid Overengineering
- Do not rebuild large sections of the application for a small request.
- Make the smallest clean change that solves the real problem.
- Keep code understandable, dependencies minimal, architecture consistent, loading times reasonable, and complexity low.

---

## 14. Security
- Treat all coding tasks as production-quality unless explicitly marked as experiments.
- Verify: no exposed secrets, no unsafe admin routes, proper authentication and authorization, no IDOR, no injection vulnerabilities, secure endpoints, no leaked server environment variables, no unsafe client credentials.
- Never weaken security to make a feature work.

---

## 15. UI / UX Coding
- When changing frontend design, preserve working functionality first.
- Verify across desktop, mobile, and tablet:
  - Spacing, typography, responsive layout
  - Loading, empty, and error states
  - Buttons, navigation, and forms
  - Accessibility basics and visual consistency
- Do not sacrifice usability or loading performance for visual flair.

---

## 16. Performance
- Avoid unnecessary API requests, repeated database calls, oversized client bundles, oversized images, blocking scripts, duplicate fetching, unnecessary React client components, or unnecessary dependencies.
- Prefer server-side work where appropriate and cache safely.

---

## 17. Existing User Data
- Never delete or reset real user, customer, order, product, or database data unless explicitly authorized.
- Be especially protective of WooCommerce orders, products, inventory, customers, wholesale dealers, quotes, payment records, and WordPress content.
- Default to non-destructive operations.

---

## 18. Git Commands That Require Extreme Caution
- Never use casually:
  - `git reset --hard`
  - `git clean -fd`
  - `git push --force`
  - `git push --force-with-lease`
  - Branch deletion
  - History rewriting
- Do not use unless there is an explicit, justified need. Never destroy uncommitted work.

---

## 19. If Local Work Is Ahead of GitHub
- If the local repository contains commits that have not been pushed, do not ignore them.
- Report:
  - Branch name
  - Number of commits ahead
  - Uncommitted files
  - Safety assessment
  - Recommended push/merge action
- Never accidentally overwrite local work by pulling or resetting.

---

## 20. If Remote Has New Work
- If GitHub has changes that local does not: fetch and inspect first.
- Do not blindly merge.
- Check for conflicts, duplicate implementations, old architecture, overlapping fixes, or reverted features. Integrate intentionally.

---

## 21. Task Completion Definition
A coding task is complete only after:
- Requested feature/fix is implemented
- Relevant code reviewed
- Tests and checks passed
- Build works cleanly
- No regressions observed
- Git diff reviewed
- Commit created
- Branch pushed to active GitHub `origin`
- Deployment verified (if deployment was part of the task)

---

## 22. End-of-Task Report Format
After substantial coding work, provide this factual report:
```text
PROJECT:
REPOSITORY:
LOCAL PATH:
BRANCH:
CHANGES:
TESTS:
BUILD:
COMMIT:
PUSH STATUS:
DEPLOYMENT:
BLOCKERS:
NEXT ACTION:
```

---

## 23. Important Default Behaviour
- Do not ask routine Git questions repeatedly.
- For normal safe development: inspect → code → test → commit → push to the active development branch without requiring repeated approval.
- Stop and confirm only before genuinely destructive actions or major irreversible architecture changes.

---

## 24. Permanent Himalayan Koh Rule
- For Himalayan Koh, every completed development task must ultimately exist in:
  `himalayankoh/himalayankoh` on GitHub
  not only on the local machine and not only in `8002salman-ai/himalayan-koh`.
- `old-origin` is reference/history only.
- Protect existing work, preserve Git history, test properly, and keep the local repository and active GitHub repository synchronized.
