const SETTINGS_KEY = "hoverPreviewEnabled";
const HOVER_DELAY_MS = 450;
const HIDE_DELAY_MS = 140;
const previewCache = new Map();

let enabled = true;
let hoverTimer = null;
let hideTimer = null;
let activePostUrl = "";

init();

function init() {
  setupPopupElement();

  chrome.storage.sync.get({ [SETTINGS_KEY]: true }, (result) => {
    enabled = Boolean(result[SETTINGS_KEY]);
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync" || !changes[SETTINGS_KEY]) {
      return;
    }

    enabled = Boolean(changes[SETTINGS_KEY].newValue);
    if (!enabled) {
      hidePopup(true);
    }
  });

  document.addEventListener("mouseover", onMouseOver, true);
  document.addEventListener("mouseout", onMouseOut, true);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      hidePopup(true);
    }
  });
}

function onMouseOver(event) {
  if (!enabled) {
    return;
  }

  const postUrl = resolvePostUrl(event.target);
  if (!postUrl) {
    return;
  }

  clearTimeout(hideTimer);
  clearTimeout(hoverTimer);

  hoverTimer = setTimeout(() => {
    void loadPreview(postUrl);
  }, HOVER_DELAY_MS);
}

// Resolves the Reddit post URL for the hovered element.
// Old Reddit (and plain title links) use a real <a href="/comments/...">.
// New Reddit's card/compact feed rows are <shreddit-post> web components:
// hovering the card background retargets event.target to the <shreddit-post>
// host itself (shadow DOM retargeting), so we fall back to its
// "permalink"/"content-href" attribute to cover that layout too.
function resolvePostUrl(target) {
  const link = target.closest?.("a[href*='/comments/']");
  if (isValidPostLink(link)) {
    return link.href;
  }

  const post = target.closest?.("shreddit-post");
  if (post) {
    const permalink =
      post.getAttribute("permalink") || post.getAttribute("content-href");
    if (permalink) {
      try {
        return new URL(permalink, window.location.origin).href;
      } catch {
        return "";
      }
    }
  }

  return "";
}

function onMouseOut(event) {
  clearTimeout(hoverTimer);

  const related = event.relatedTarget;
  const popup = getPopupElement();
  if (popup && related && popup.contains(related)) {
    return;
  }

  hideTimer = setTimeout(() => {
    hidePopup(false);
  }, HIDE_DELAY_MS);
}

function setupPopupElement() {
  if (getPopupElement()) {
    return;
  }

  const popup = document.createElement("aside");
  popup.id = "reddit-hover-popup";
  popup.classList.add("hidden");
  popup.innerHTML = `
    <h4 class="rh-title"></h4>
    <p class="rh-meta"></p>
    <pre class="rh-body"></pre>
    <div class="rh-comment-section">
      <p class="rh-comment-label">Top comment</p>
      <p class="rh-comment-author"></p>
      <pre class="rh-comment-body"></pre>
    </div>
  `;

  popup.addEventListener("mouseenter", () => {
    clearTimeout(hideTimer);
  });

  popup.addEventListener("mouseleave", () => {
    hideTimer = setTimeout(() => {
      hidePopup(false);
    }, HIDE_DELAY_MS);
  });

  document.body.appendChild(popup);
}

function getPopupElement() {
  return document.getElementById("reddit-hover-popup");
}

function hidePopup(forceHide) {
  const popup = getPopupElement();
  if (!popup) {
    return;
  }

  if (forceHide) {
    clearTimeout(hideTimer);
    clearTimeout(hoverTimer);
  }

  popup.classList.add("hidden");
  activePostUrl = "";
}

async function loadPreview(postUrl) {
  const normalizedUrl = normalizePostUrl(postUrl);
  if (!normalizedUrl) {
    return;
  }

  if (activePostUrl === normalizedUrl) {
    return;
  }

  activePostUrl = normalizedUrl;

  const cached = previewCache.get(normalizedUrl);
  if (cached) {
    renderPopup(cached);
    return;
  }

  try {
    const jsonUrl = buildJsonUrl(normalizedUrl);
    const result = await chrome.runtime.sendMessage({
      type: "FETCH_PREVIEW_JSON",
      url: jsonUrl
    });
    if (!result?.ok) {
      throw new Error(result?.error || "Request failed");
    }

    const payload = result.payload;
    const postData = payload?.[0]?.data?.children?.[0]?.data;
    if (!postData) {
      throw new Error("Post data missing in response");
    }

    const topCommentData = payload?.[1]?.data?.children?.find(
      (c) => c.kind === "t1" && c.data?.body
    )?.data;

    const previewData = {
      title: postData.title || "Untitled post",
      meta: `r/${postData.subreddit || "unknown"} by u/${postData.author || "unknown"}`,
      body:
        postData.selftext?.trim() ||
        (postData.is_self ? "(No body text)" : "(Link post: no text preview available.)"),
      topCommentAuthor: topCommentData ? `u/${topCommentData.author}` : "",
      topCommentBody: topCommentData?.body?.trim() || ""
    };

    // Keep a small cache to avoid repeated network calls while browsing.
    if (previewCache.size > 60) {
      const oldestKey = previewCache.keys().next().value;
      previewCache.delete(oldestKey);
    }
    previewCache.set(normalizedUrl, previewData);

    if (activePostUrl === normalizedUrl) {
      renderPopup(previewData);
    }
  } catch (error) {
    if (activePostUrl === normalizedUrl) {
      renderPopup({
        title: "Preview unavailable",
        meta: "",
        body: "Could not load this post preview right now."
      });
    }
    console.error("[Reddit Hover Preview]", error);
  }
}

function renderPopup(previewData) {
  const popup = getPopupElement();
  if (!popup) {
    return;
  }

  const titleEl = popup.querySelector(".rh-title");
  const metaEl = popup.querySelector(".rh-meta");
  const bodyEl = popup.querySelector(".rh-body");
  const commentSection = popup.querySelector(".rh-comment-section");
  const commentAuthorEl = popup.querySelector(".rh-comment-author");
  const commentBodyEl = popup.querySelector(".rh-comment-body");
  if (!titleEl || !metaEl || !bodyEl) {
    return;
  }

  titleEl.textContent = previewData.title;
  metaEl.textContent = previewData.meta;
  bodyEl.textContent = previewData.body;

  if (commentSection && commentAuthorEl && commentBodyEl) {
    if (previewData.topCommentBody) {
      commentAuthorEl.textContent = previewData.topCommentAuthor;
      commentBodyEl.textContent = previewData.topCommentBody;
      commentSection.classList.remove("hidden");
    } else {
      commentSection.classList.add("hidden");
    }
  }

  popup.classList.remove("hidden");
  popup.scrollTop = 0;
}

function isValidPostLink(link) {
  if (!link || !link.href) {
    return false;
  }

  try {
    const url = new URL(link.href, window.location.origin);
    const isRedditHost = /(^|\.)reddit\.com$/i.test(url.hostname);
    return isRedditHost && url.pathname.includes("/comments/");
  } catch {
    return false;
  }
}

function normalizePostUrl(rawUrl) {
  try {
    const url = new URL(rawUrl, window.location.origin);
    url.hash = "";
    url.search = "";
    return `${url.origin}${url.pathname.replace(/\/$/, "")}`;
  } catch {
    return "";
  }
}

function buildJsonUrl(normalizedUrl) {
  // www.reddit.com/*.json increasingly 403s unauthenticated fetches;
  // old.reddit.com's JSON API stays publicly accessible, so route through it.
  const url = new URL(normalizedUrl);
  url.hostname = "old.reddit.com";
  return `${url.href}.json?raw_json=1`;
}