# Hermes Bluesky Mobile PWA

Mobile-first AT Protocol feed reader for Richard's Bluesky Following and Discover workflows.

## Local Development

```powershell
cd apps/mobile-pwa
npm install
npm run dev
```

The app calls public AT Protocol AppView endpoints:

```text
https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed
https://public.api.bsky.app/xrpc/app.bsky.graph.getFollows
https://public.api.bsky.app/xrpc/app.bsky.feed.getFeed
```

This slice does not require a Bluesky password, app password, OAuth client, or server-side secret.

Current feed behavior:

- Following: public preview built from accounts followed by `rswitz.bsky.social`.
- Discover: Bluesky's public Discover generator feed.
- Add to Hermes: saves the selected Bluesky post URL through the local Hermes API.

For Add to Hermes, open Hermes capture settings in the app and enter:

```text
Hermes API URL: http://127.0.0.1:3217
Hermes API key: HERMES_API_KEY from the repo .env file
```

On a physical phone, `127.0.0.1` means the phone itself. Because GitHub Pages is HTTPS, mobile capture needs an HTTPS URL for Hermes. This machine uses Tailscale Funnel for that stable URL.

From the Hermes workspace, keep both processes running:

```powershell
npm run dev:api
npm run dev:tunnel
```

Then use this URL in Hermes capture settings instead of `http://127.0.0.1:3217`:

```text
https://richard-t14s.tail9e9656.ts.net
```

## Free Hosting Recommendation

Recommended: Cloudflare Pages.

Why:

- Free static hosting with HTTPS.
- Good fit for Vite output in `dist/`.
- Stable production URL for a future AT Protocol OAuth redirect.
- Can later add edge functions if Hermes needs a hosted API bridge.

Build settings:

```text
Framework preset: Vite
Root directory: apps/mobile-pwa
Build command: npm run build
Build output directory: dist
Node version: 22
```

Good alternatives:

- Netlify: simple static hosting and deploy previews.
- Vercel: very smooth Vite hosting, especially if this later becomes a larger React app.
- GitHub Pages: fine for the current public-feed-only app, but less flexible for future OAuth/API work.

## OAuth Note

The current Following tab is a public approximation. A real authenticated Following timeline requires AT Protocol OAuth and a fixed HTTPS app URL for redirect/client metadata. Pick the hosting URL before implementing login.