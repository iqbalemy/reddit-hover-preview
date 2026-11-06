# Changelog

All notable changes to this project are documented in this file.

## [2.1] - 2026-11-06

### Changed
- **Top comment is now the highest-upvoted one, not just the first.** Bot comments (AutoModerator, any `*bot`-suffixed username, or a comment carrying Reddit's standard "I am a bot, and this action was performed automatically" disclaimer) are filtered out before picking the top one; if every top-level comment is a bot's, no comment section is shown at all.
- **Card view no longer shows the image carousel or fetches images.** New Reddit's `<shreddit-post view-type="cardView">` already shows the post's media inline in the feed, so the carousel was redundant there — compact view (where the thumbnail is too small to read) keeps it as before.
- The popup no longer appears when hovering a post while already on that post's own page (e.g. its comments opened in this tab).
- The popup now fades out (500ms) instead of vanishing instantly when hidden.
- A cursor that overshoots the popup's edge by a little (e.g. aiming for the scrollbar) no longer dismisses it — a small forgiveness buffer defers the hide and re-checks instead.

### Performance
- The post data fetch now starts ~300ms before the popup itself opens (still well after a mere hover-past), instead of starting only once the popup is about to show — the loading state rarely appears anymore.
- Only one JSON request is kept in flight at a time; hovering onward to a different post before the previous one resolves now cancels it (via a real `AbortController` in the background worker) instead of letting a response nobody needs anymore finish downloading.

### Fixed
- Posts whose only available image is gated behind Reddit's own placeholder thumbnail values (`nsfw`, `spoiler`, `default`, `self`) now still show that image in the carousel, behind a blurred "Show content" button with a remark explaining why Reddit didn't surface a plain thumbnail — previously these posts silently showed no carousel at all.
- Card/compact view detection no longer depends on exactly where over a post's card the cursor enters. New Reddit's cards have several real `<a href="/comments/...">` elements (the full-card overlay link, the title link, the comments-count button) sitting outside the `<shreddit-post>`'s shadow root; landing on one of those used to be misread as old-Reddit-style, silently breaking the view-type check for most of a card's hoverable area.
- `extractImages()` also falls back to the feed thumbnail URL when nothing else matches, catching more video/multi-media/self posts that previously showed no media at all.
- Carousel nav arrows and the "Show content" button no longer render their text/glyph visibly off-center (they relied on `line-height`/`text-align` centering with no font override, instead of flex centering with the popup's own font).

## [2.0] - 2026-11-05

### Fixed
- Post body text and the top comment body render inside `<pre>` tags, which Reddit's own site CSS styles for its code-block markdown rendering (background/color/padding). Since those elements never declared their own color or background, that host styling was free to apply — showing as dark, low-contrast text on a mismatched light box regardless of the popup's own light/dark theme. Explicitly neutralized with `!important` so the popup's own colors always win.

## [1.9] - 2026-11-05

### Fixed
- Scrolling the mouse wheel while over the popup no longer scrolls the Reddit page underneath once the popup's own content has nothing left to scroll (or doesn't overflow at all). Added `overscroll-behavior: contain` to stop that scroll chaining.

## [1.8] - 2026-11-05

### Changed
- The post fetch now asks Reddit for just the single top-level comment (`limit=1&depth=1`) instead of its full default-size comment tree, since that's the only thing read from the response. Cuts payload size and parse time noticeably on heavily-commented posts, which was a big part of why loading felt slow.

## [1.7] - 2026-11-05

### Fixed
- Images in the carousel were being squeezed into a fixed 220px-tall box, which crushed tall screenshots (e.g. a long text announcement) into unreadable mush. The image slide is now width-constrained only — height follows the image's natural aspect ratio with no cap, and the popup scrolls vertically if that makes the slide taller than the viewport.

## [1.6] - 2026-11-05

### Changed
- Popup height now fills down to near the bottom of the actual browser viewport (`calc(100vh - 120px - 20px)`) instead of a flat `70vh`, which either wasted space on tall windows or, on short ones, could push the popup past the bottom edge with no way to scroll to it (fixed elements don't scroll with the page).

## [1.5] - 2026-11-05

### Fixed
- Carousel nav arrows no longer jump around between slides of different heights (e.g. a short image next to a long text body). They're now pinned to the popup's own top-right corner — fixed relative to the popup frame, not to the slide content — so their position never changes regardless of what's currently shown. Styled as solid blue circular buttons to stand out from the rest of the panel.

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
