# Changelog

All notable changes to this project are documented in this file.

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
