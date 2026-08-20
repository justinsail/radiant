---
name: har-derived-api-client
description: Turn a website's hidden API into a reusable plain-HTTP client — drive the browser once, capture the XHR/fetch calls, then rebuild and verify a script.
---

# Website → reusable API client

Some sites have no public API, but the page itself calls internal JSON endpoints
(XHR / fetch). Instead of driving the browser every time (slow and brittle), use
the browser **once** to discover those endpoints, then rebuild the one you need
as a plain HTTP request you can call forever from a script, CLI, or cron.

## When to use
The user wants to pull data from, or repeat an action on, a website that has no
official API — search results, a feed, prices, a list, a submit. Requires the
**computer** toggle on (browser control) and a vision-capable model.

## Procedure

1. **Operate.** `browser_navigate` to the site, then use `browser_click` /
   `browser_type` / `browser_key` to perform the exact action once (run the
   search, load the page, submit the form). Do the real thing — the goal is to
   make the site fire its internal request.

2. **Capture + derive.** Call **`browser_network`** (optionally with a `filter`
   substring) to list the XHR/fetch JSON calls the page just made. Find the one
   whose **response sample** contains the data the user wants. Note its method,
   URL (and query params), request body, and which headers it carries.

3. **Build.** Write a small, self-contained client into the workspace (prefer
   Python `requests`, or `curl`) that recreates *just that request*:
   - Keep only the headers the endpoint actually needs — usually `accept`,
     `content-type`, and any auth/token header. Drop browser noise.
   - **Never hard-code secrets.** Any header shown as `[present — sensitive]`
     (cookies, `authorization`, CSRF/API tokens) is required but must be read
     from an environment variable or a local, git-ignored file — not pasted into
     the script.
   - Parse the JSON response into exactly the fields the user asked for.

4. **Verify.** Run the client and confirm its response matches what the site
   returned in step 2. Only call it done once it reproduces the data headlessly.

5. **Reuse.** The result is one verified HTTP client the user (or an agent,
   cron job, or CLI) can call directly — no browser needed.

## Watch out for
- **This is capture-and-replay, not a bypass.** Do not attempt to defeat
  authentication, CAPTCHAs, rate limits, or bot detection. If the endpoint is
  gated that way, stop and tell the user.
- **Captured requests can contain live cookies and tokens.** Keep them out of
  shared code, logs, and commits; use env vars. Treat the capture as secret.
- **Endpoints and tokens change.** If the client starts failing (401/403 or a
  changed shape), re-capture from the live site.
- Respect the site's Terms of Service and robots restrictions; only automate
  what the user is authorized to access.
