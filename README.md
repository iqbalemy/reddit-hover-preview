# Reddit Hover Preview

Hover over a Reddit post to see the full content without opening it.

Features:
- Hover preview
- Fast loading
- Lightweight

## What It Does

- Detects Reddit post links while you browse feed pages.
- Shows a floating preview card after a short hover delay.
- Includes post title, subreddit/author meta, and self-text body.
- Uses a small in-memory cache to reduce repeated fetches.
- Lets you enable/disable preview from the extension popup.

## Install (Chrome / Edge)

1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder: `reddit-hover-preview`.

## Usage

1. Go to `https://www.reddit.com/` or `https://old.reddit.com/`.
2. Hover over a post link for around half a second.
3. A preview panel appears in the top-right corner.
4. Press `Esc` to close the panel quickly.
5. Use the extension popup checkbox to turn previews on or off.

## Notes

- Link posts without self-text show a fallback message.
- If Reddit rate-limits or blocks a request, the extension shows a brief error message in the preview card.