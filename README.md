# Reddit Hover Preview

A lightweight Chrome/Edge extension that lets you preview Reddit posts on hover — see the title, text, and top comment without clicking through, in both card and compact feed view.

Features:
- Instant Reddit post preview on hover — reads straight from the feed page, so hovering never fetches anything or registers as a view
- Works in card view and compact view
- Shows title, subreddit/author, score, and comment count instantly on hover
- A "Show content" button loads the full self-text, image gallery (with carousel for multiple images), and top comment with its upvote count — only when you click it
- Fast, lightweight, no tracking

## What It Does

- Detects Reddit post links while you browse feed pages.
- Shows a floating preview card after a short hover delay, built entirely from data already on the page — **hovering makes no network request**, so it can't be counted as a view/interaction by the post's owner.
- Clicking **Show content** fetches the full post: self-text body, every image in a gallery (browsable via a small carousel), and the top comment's author, upvotes, and text. This is a deliberate click, same as opening the post, so it's the only action in the extension that talks to Reddit's servers.
- Uses a small in-memory cache so clicking "Show content" again for the same post doesn't re-fetch.
- Lets you enable/disable preview from the extension popup.

## Install (Chrome / Edge)

1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder: `reddit-hover-preview`.

## Usage

1. Go to `https://www.reddit.com/` or `https://old.reddit.com/`.
2. Hover over a post link for around half a second.
3. A preview panel appears in the top-right corner with the title, subreddit/author, score, comment count, and a thumbnail if one is already visible in the feed.
4. Click **Show content** to load the full body, image gallery, and top comment (with its upvote count). Use the prev/next arrows or dots to browse multiple images.
5. Press `Esc` to close the panel quickly.
6. Use the extension popup checkbox to turn previews on or off.

## Notes

- Hovering never fetches the post — everything shown before you click "Show content" comes from the feed page you're already looking at.
- New Reddit's feed markup isn't publicly documented, so the hover-only thumbnail/score/comment-count fields are read with defensive fallbacks and may be blank for some layouts; clicking "Show content" always works since it uses Reddit's documented JSON API.
- If Reddit rate-limits or blocks a request, the extension shows a "Couldn't load — retry" state on the button instead of a crash.