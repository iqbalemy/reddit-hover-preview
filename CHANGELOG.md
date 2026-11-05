# Changelog

All notable changes to this project are documented in this file.

## [1.4] - 2026-11-05

### Changed
- **Removed the "Show content" button.** Hovering a post now always shows its text body, top comment, and the top comment's upvote count — no click required, and no media shown yet.
- **The content area is now a single looping carousel** for posts with images: slide 0 is the text/top comment (what you see on hover), and clicking the right arrow steps through slide 1, slide 2, …, the last image, and then back to the text slide again. The left arrow steps the same sequence in reverse. Posts with no images show no arrows at all.
- Image bytes still only start downloading once the cursor enters the popup (not on hover-start), so clicking into the carousel is fast without fetching images for posts the user only glanced past.

## [1.3] - 2026-11-05

### Changed
- **"Show content" now only gates image media.** The post's full text body and top comment (with its upvote count) load automatically a moment after hovering and are always shown — they no longer require a click.
- Image URLs are fetched at the same time as the text/comment (one request, on hover), but the image *bytes* are prefetched in the background (first image at high priority, the rest at low priority) while the user is still just hovering. Clicking "Show content" now only reveals the already-loaded carousel — no network wait on click.
- Note: this reintroduces an automatic fetch on hover (to get the text/comment), the same request the earlier "hover never fetches" design in 1.2 was built to avoid. That trade-off was requested explicitly — text/comment are now always-on, and only the image reveal stays gated behind an explicit click.

## [1.2] - 2026-11-05

### Added
- Image carousel: posts with multiple images (galleries) can now be browsed image-by-image inside the preview, with prev/next controls and position dots.
- Top comment now shows its upvote count alongside the author and body.
- Quick stats (post score and comment count) now show in the preview immediately on hover, read straight from the feed page.

### Changed
- **Hovering a post no longer fetches anything.** The preview now renders instantly from data the feed page already has in the DOM (title, subreddit/author, score, comment count, and a thumbnail if one is already rendered). This avoids hovering being indistinguishable from a real pageview against the post owner's view/interaction counters.
- A new **"Show content"** button loads the rest (full self-text body, full image gallery, top comment with its upvotes) only when clicked. Clicking is an explicit, deliberate action — the same as opening the post — so it is the only thing in the extension that still fetches the post.
- Previously loaded content for a post is cached and reused on repeat hovers, so clicking "Show content" again for the same post doesn't re-fetch.

## [1.1] - 2026-11-04

### Fixed
- Hover preview now works across the whole post row in both **card view** and **compact view**, not just when hovering the title text. New Reddit renders posts as `<shreddit-post>` web components, and hovering the card background previously missed detection due to shadow DOM event retargeting; the extension now also reads the post's `permalink` attribute as a fallback.
- Preview fetches no longer fail with CSP errors, 403s, or JSON parse errors on `www.reddit.com`:
  - Moved the network request into a background service worker, since the host page's Content-Security-Policy blocked content-script fetches.
  - Requests now include the user's existing Reddit session cookie (sent only to reddit.com, never a third party) instead of an anonymous request, which Reddit was rejecting.
  - Responses are now checked by sniffing the actual body instead of trusting the `content-type` header, since Reddit's block/interstitial page could be served with a JSON-ish header.

### Changed
- Expanded the extension's manifest description and README with more descriptive, keyword-relevant copy for Chrome Web Store and GitHub search visibility.
- Added `host_permissions` and a background service worker (`background.js`) to `manifest.json` to support the fetch fix above.

### Security / Privacy
- Updated `PRIVACY_POLICY.md` to disclose that preview requests now include the user's existing reddit.com session cookie.

## [1.0] - 2026-06-03

### Added
- Initial release: hover over a Reddit post to preview its title, subreddit/author, self-text body, and top comment in a floating panel.
- Enable/disable toggle via the extension popup.
- Small in-memory cache to avoid repeated fetches while browsing.
- Support for `old.reddit.com` and `www.reddit.com`.
