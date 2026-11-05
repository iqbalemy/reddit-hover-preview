# Reddit Hover Preview

A lightweight Chrome/Edge extension that lets you preview Reddit posts on hover — see the title, text, and top comment without clicking through, in both card and compact feed view.

Features:
- Instant Reddit post preview on hover — title, subreddit/author, score, and comment count appear right away from the feed page itself
- Works in card view and compact view
- Full self-text body and top comment (with its upvote count) load automatically a moment after hovering — no click needed
- Image galleries stay behind a "Show content" button so you choose when to see the pictures; images are prefetched in the background while you hover, so clicking reveals them instantly
- Carousel navigation (prev/next + dots) for posts with multiple images
- Fast, lightweight, no tracking

## What It Does

- Detects Reddit post links while you browse feed pages.
- Shows a floating preview card immediately on hover, using whatever title/score/thumbnail data the feed page already has.
- A moment later, the post's full text body and top comment (author, upvotes, text) load automatically and are always shown — no extra click required.
- If the post has one or more images, they're fetched and prefetched in the background at the same time, but stay hidden behind a **Show content** button until you click it — so you control when images actually render, while the click itself is instant since the bytes are already warmed in the browser's cache.
- Uses a small in-memory cache so re-hovering a post you've already seen doesn't re-fetch anything.
- Lets you enable/disable preview from the extension popup.

## Install (Chrome / Edge)

1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder: `reddit-hover-preview`.

## Usage

1. Go to `https://www.reddit.com/` or `https://old.reddit.com/`.
2. Hover over a post link for around half a second.
3. A preview panel appears instantly with the title, subreddit/author, score, and comment count; the full text body and top comment (with upvotes) fill in a moment later automatically.
4. If the post has images, click **Show content** to reveal them — this just unveils the carousel, no extra loading wait, since the images were prefetched while you were hovering. Use the prev/next arrows or dots to browse multiple images.
5. Press `Esc` to close the panel quickly.
6. Use the extension popup checkbox to turn previews on or off.

## Notes

- New Reddit's feed markup isn't publicly documented, so the instant hover-only thumbnail/score/comment-count fields are read with defensive fallbacks and may be blank for some layouts; the text/comment/image data that loads a moment later always works since it uses Reddit's documented JSON API.
- If Reddit rate-limits or blocks a request, the extension shows an error message in place of the body text instead of crashing.