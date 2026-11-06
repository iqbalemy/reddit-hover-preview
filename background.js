// Fetches post preview JSON on behalf of content scripts. Running here
// (rather than in the page context) avoids the host page's Content-Security
// Policy, which blocks content-script fetches to reddit's JSON API.

// Keyed by the content script's requestId (its normalized post URL) so a
// CANCEL_PREVIEW_JSON message can abort the matching in-flight fetch —
// content.js only ever keeps one request in flight at a time, cancelling
// the previous one whenever hovering moves on to a different post before
// it resolves.
const inFlightControllers = new Map();

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "CANCEL_PREVIEW_JSON") {
    const controller = inFlightControllers.get(message.requestId);
    if (controller) {
      controller.abort();
      inFlightControllers.delete(message.requestId);
    }
    return false;
  }

  if (!message || message.type !== "FETCH_PREVIEW_JSON") {
    return false;
  }

  // Defense in depth: content.js already restricts which URLs it asks us
  // to fetch, but don't rely on that alone — this is the one place the
  // user's reddit.com session cookie actually gets attached, so verify
  // the host here too before ever sending it anywhere.
  let targetHost;
  try {
    targetHost = new URL(message.url).hostname;
  } catch {
    sendResponse({ ok: false, error: "Invalid URL" });
    return false;
  }
  if (!/(^|\.)reddit\.com$/i.test(targetHost)) {
    sendResponse({ ok: false, error: "Refusing to fetch a non-reddit.com URL" });
    return false;
  }

  const controller = new AbortController();
  if (message.requestId) {
    inFlightControllers.set(message.requestId, controller);
  }

  // Reddit now rejects most cookie-less JSON requests with 403 or a block
  // page. "include" attaches the user's existing reddit.com session cookie
  // (same site the user is already signed into) instead of a third party.
  fetch(message.url, { credentials: "include", signal: controller.signal })
    .then(async (response) => {
      if (!response.ok) {
        sendResponse({ ok: false, error: `Request failed: ${response.status}` });
        return;
      }

      // Some block/interstitial pages are served with a JSON-ish
      // content-type header, so sniff the body itself instead of trusting it.
      const text = await response.text();
      if (!text.trim().startsWith("[") && !text.trim().startsWith("{")) {
        sendResponse({ ok: false, error: "Reddit returned a non-JSON (blocked?) response" });
        return;
      }

      const payload = JSON.parse(text);
      sendResponse({ ok: true, payload });
    })
    .catch((error) => {
      if (error?.name === "AbortError") {
        sendResponse({ ok: false, aborted: true });
      } else {
        sendResponse({ ok: false, error: error?.message || "Network error" });
      }
    })
    .finally(() => {
      if (message.requestId) {
        inFlightControllers.delete(message.requestId);
      }
    });

  return true;
});
