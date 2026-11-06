# Reddit Hover Preview

A lightweight Chrome/Edge extension that lets you preview Reddit posts on hover — see the title, text, and top comment without clicking through, in both card and compact feed view.

Features:
- Instant Reddit post preview on hover — title, subreddit/author, score, and comment count appear right away from the feed page itself
- Works in card view and compact view
- Full self-text body and top comment (with its upvote count) load automatically a moment after hovering — no click needed
- Posts with images get a looping carousel: click the right arrow to step through each image, and one more click past the last image brings you back to the post text
- Images are prefetched in the background as soon as the cursor enters the popup, so stepping through the carousel feels instant
- Fast, lightweight, no tracking

## What It Does

- Detects Reddit post links while you browse feed pages.
- Shows a floating preview card immediately on hover, using whatever title/score data the feed page already has.
- A moment later, the post's full text body and top comment (author, upvotes, text) load automatically and are always shown first — this is always the starting view, with no media.
- If the post has one or more images, left/right arrows appear. The content area is one looping sequence: text → image 1 → image 2 → … → last image → back to text. Image bytes start downloading in the background as soon as the cursor enters the popup, so clicking through the carousel doesn't wait on a fresh download.
- Uses a small in-memory cache so re-hovering a post you've already seen doesn't re-fetch anything (though the preview still opens back on the text slide each time).
- Lets you enable/disable preview from the extension popup.

## Install (Chrome / Edge)

1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder: `reddit-hover-preview`.

## Usage

1. Go to `https://www.reddit.com/` or `https://old.reddit.com/`.
2. Hover over a post link for around half a second.
3. A preview panel appears instantly with the title, subreddit/author, score, and comment count; the full text body and top comment (with upvotes) fill in a moment later automatically — this is always the first thing shown, no media yet.
4. If the post has images, arrows appear next to the text. Click the right arrow to step into image 1, then 2, and so on; one more click past the last image brings you back to the text. The left arrow steps backward the same way.
5. Press `Esc` to close the panel quickly.
6. Use the extension popup checkbox to turn previews on or off.

## Notes

- New Reddit's feed markup isn't publicly documented, so the instant hover-only thumbnail/score/comment-count fields are read with defensive fallbacks and may be blank for some layouts; the text/comment/image data that loads a moment later always works since it uses Reddit's documented JSON API.
- If Reddit rate-limits or blocks a request, the extension shows an error message in place of the body text instead of crashing.