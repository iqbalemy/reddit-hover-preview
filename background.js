// Fetches post preview JSON on behalf of content scripts. Running here
// (rather than in the page context) avoids the host page's Content-Security
// Policy, which blocks content-script fetches to reddit's JSON API.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "FETCH_PREVIEW_JSON") {
    return false;
  }

  // Reddit now rejects most cookie-less JSON requests with 403 or a block
  // page. "include" attaches the user's existing reddit.com session cookie
  // (same site the user is already signed into) instead of a third party.
  fetch(message.url, { credentials: "include" })
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
      sendResponse({ ok: false, error: error?.message || "Network error" });
    });

  return true;
});
