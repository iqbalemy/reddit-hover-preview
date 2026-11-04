// Fetches post preview JSON on behalf of content scripts. Running here
// (rather than in the page context) avoids the host page's Content-Security
// Policy, which blocks content-script fetches to reddit's JSON API.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "FETCH_PREVIEW_JSON") {
    return false;
  }

  fetch(message.url, { credentials: "omit" })
    .then(async (response) => {
      if (!response.ok) {
        sendResponse({ ok: false, error: `Request failed: ${response.status}` });
        return;
      }
      const payload = await response.json();
      sendResponse({ ok: true, payload });
    })
    .catch((error) => {
      sendResponse({ ok: false, error: error?.message || "Network error" });
    });

  return true;
});
