const SETTINGS_KEY = "hoverPreviewEnabled";
const HOVER_DELAY_MS = 450;
// Must stay below HOVER_DELAY_MS, or quickly moving the cursor from one
// post to the next post's own hover delay can overlap awkwardly with
// this one still counting down. Deliberately NOT tied to the CSS fade
// duration (see #reddit-hover-popup.hidden in style.css) — that's a
// separate, purely visual timing with no such constraint.
const HIDE_DELAY_MS = 350;
// Forgives a cursor that overshoots the popup's edge by this many CSS
// pixels (e.g. aiming for its scrollbar, or the gap between the nav
// arrows and the border) — see isPointerNearPopup().
const HOVER_BUFFER_PX = 32;
// Post text/comment/image-URL data, fetched once per post on hover and
// cached here so re-hovering doesn't re-fetch.
const fullContentCache = new Map();

let enabled = true;
let hoverTimer = null;
let hideTimer = null;
let activePostUrl = "";
// The postUrl of the single JSON request currently in flight (at most
// one at a time — see loadFullContent()), or "" when none is.
let fetchUrl = "";
let cursorOverPopup = false;
// Last known pointer position (viewport coordinates), kept up to date by
// a document-wide mousemove listener — see isPointerNearPopup().
let lastMouseX = -1;
let lastMouseY = -1;
// Slide 0 is always the text/top-comment view; slides 1..N are images.
// Reset to 0 every time a post is (re-)hovered, per spec: the preview
// always opens on text first.
let slideIndex = 0;

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
  document.addEventListener(
    "mousemove",
    (event) => {
      lastMouseX = event.clientX;
      lastMouseY = event.clientY;
    },
    { passive: true }
  );
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

  const context = resolvePostContext(event.target);
  if (!context) {
    return;
  }

  const normalizedUrl = normalizePostUrl(context.url);

  // Already on this post's own page (e.g. its comments were opened in this
  // tab) — showing the preview here would just cover the real thing.
  if (normalizedUrl === normalizePostUrl(window.location.href)) {
    return;
  }

  clearTimeout(hideTimer);
  clearTimeout(hoverTimer);

  hoverTimer = setTimeout(() => {
    showQuickPreview(context);
  }, HOVER_DELAY_MS);
}

// Resolves the Reddit post URL *and* the DOM node that already holds that
// post's feed-row data for the hovered element. Old Reddit (and plain title
// links) use a real <a href="/comments/...">, with the rest of the row's
// data living on the ancestor ".thing". New Reddit's card/compact feed rows
// are <shreddit-post> web components: hovering the card background
// retargets event.target to the <shreddit-post> host itself (shadow DOM
// retargeting), so we fall back to its "permalink"/"content-href" attribute
// to cover that layout too, and scrape the rest straight off the element.
//
// <shreddit-post> is checked FIRST, before the old-Reddit anchor check,
// even though that means an extra closest() call on every hover: new
// Reddit's cards have several real <a href="/comments/...">s scattered
// around (the full-card overlay link, the title link, the comments-count
// button) that sit *outside* the shreddit-post's shadow root as slotted
// light-DOM content, so target.closest("a[...]") can match one of those
// before ever reaching the shreddit-post branch. That misclassified the
// post as kind "old" with `el` pointing at a bare, dataless <a> (no
// ".thing" ancestor exists on new Reddit) for most of a card's hoverable
// area — breaking the instant quick-preview scrape, and specifically
// isCardViewPost()'s view-type check, depending on exactly where over the
// card the cursor happened to land. A <shreddit-post> ancestor existing
// at all is an unambiguous "this is new Reddit" signal, so resolve that
// first regardless of which anchor is nearest.
//
// Deliberately read-only and synchronous: used only for the instant
// quick-preview shown before the real fetch (see showQuickPreview/
// loadFullContent) resolves.
function resolvePostContext(target) {
  const post = target.closest?.("shreddit-post");
  if (post) {
    const permalink =
      post.getAttribute("permalink") || post.getAttribute("content-href");
    if (permalink) {
      try {
        return { url: new URL(permalink, window.location.origin).href, kind: "new", el: post };
      } catch {
        return null;
      }
    }
  }

  const link = target.closest?.("a[href*='/comments/']");
  if (isValidPostLink(link)) {
    return { url: link.href, kind: "old", el: link.closest?.(".thing") || link };
  }

  return null;
}

// New Reddit's <shreddit-post> carries view-type="cardView" or
// view-type="compactView" depending on the feed's current display mode
// (undocumented, found by inspecting live markup — may need updating if
// Reddit renames it). Card view already shows the post's media inline in
// the feed itself, so our own image carousel would be redundant there;
// compact view's thumbnail is too small to read, which is what the
// carousel is actually for. Old Reddit has no such attribute and always
// gets the carousel, same as before.
function isCardViewPost(context) {
  return context.kind === "new" && context.el?.getAttribute?.("view-type") === "cardView";
}

// Best-effort scrape of whatever the new-Reddit feed already rendered for
// this post. Attribute names on <shreddit-post> aren't publicly documented
// and can change; every lookup here is defensive so a missing/renamed
// attribute just degrades to a blanker quick-preview instead of throwing.
function extractQuickDataNewReddit(post) {
  const title = post.getAttribute("post-title") || "Untitled post";
  const subredditName = post.getAttribute("subreddit-prefixed-name") ||
    (post.getAttribute("subreddit-name") ? `r/${post.getAttribute("subreddit-name")}` : "r/unknown");
  const author = post.getAttribute("author") || "unknown";
  const score = post.getAttribute("score");
  const commentCount = post.getAttribute("comment-count");

  return {
    title,
    meta: `${subredditName} by u/${author}`,
    score,
    commentCount
  };
}

function extractQuickDataOldReddit(el) {
  const thing = el.closest?.(".thing") || el;
  const title = thing.querySelector?.("a.title")?.textContent?.trim() || "Untitled post";
  const author = thing.querySelector?.(".tagline a.author")?.textContent?.trim() || "unknown";
  const subreddit = thing.querySelector?.(".tagline a.subreddit")?.textContent?.trim() || "r/unknown";
  const scoreEl = thing.querySelector?.(".score.unvoted");
  const score = scoreEl?.getAttribute("title") || scoreEl?.textContent?.trim() || "";
  const commentCount = thing.querySelector?.("a.comments")?.textContent?.trim() || "";

  return {
    title,
    meta: `${subreddit} by u/${author}`,
    score,
    commentCount
  };
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
    <button type="button" class="rh-nav-prev hidden" aria-label="Previous">&#8249;</button>
    <button type="button" class="rh-nav-next hidden" aria-label="Next">&#8250;</button>
    <h4 class="rh-title"></h4>
    <p class="rh-meta"></p>
    <p class="rh-stats"></p>
    <p class="rh-loading hidden">Loading post…</p>
    <div class="rh-slides">
      <div class="rh-slide-viewport">
        <div class="rh-slide-text">
          <pre class="rh-body hidden"></pre>
          <div class="rh-comment-section hidden">
            <p class="rh-comment-label">Top voted comment</p>
            <p class="rh-comment-author"></p>
            <p class="rh-comment-ups"></p>
            <pre class="rh-comment-body"></pre>
          </div>
        </div>
        <img class="rh-slide-image hidden" alt="" />
        <div class="rh-slide-gate hidden">
          <p class="rh-gate-remark"></p>
          <button type="button" class="rh-gate-button">Show content</button>
        </div>
      </div>
    </div>
    <div class="rh-slide-dots hidden"></div>
  `;

  popup.addEventListener("mouseenter", () => {
    clearTimeout(hideTimer);
    cursorOverPopup = true;

    // Entering the popup is the real signal of intent to engage with this
    // post, so this is where image bytes start downloading in the
    // background — not on hover-start, which fires for every post the
    // cursor merely passes over.
    const fullData = fullContentCache.get(popup.dataset.postUrl);
    if (fullData) {
      maybePrefetchImages(fullData);
    }
  });

  popup.addEventListener("mouseleave", () => {
    cursorOverPopup = false;
    hideTimer = setTimeout(() => {
      hidePopup(false);
    }, HIDE_DELAY_MS);
  });

  popup.querySelector(".rh-nav-prev").addEventListener("click", () => {
    navigateSlide(popup, -1);
  });
  popup.querySelector(".rh-nav-next").addEventListener("click", () => {
    navigateSlide(popup, 1);
  });

  // "Show content" is a one-way reveal per post — sticks on fullData
  // itself (not some popup-local flag) so it stays revealed if the user
  // navigates the carousel away and back, or re-hovers the same post.
  popup.querySelector(".rh-gate-button").addEventListener("click", () => {
    const fullData = fullContentCache.get(popup.dataset.postUrl);
    if (!fullData) {
      return;
    }
    fullData.revealed = true;
    showSlide(popup, fullData, slideIndex);
  });

  document.body.appendChild(popup);
}

function getPopupElement() {
  return document.getElementById("reddit-hover-popup");
}

// True if the last known pointer position is inside the popup's bounds
// expanded by HOVER_BUFFER_PX on every side — i.e. the cursor overshot
// the popup by a little without really leaving its vicinity.
function isPointerNearPopup(popup) {
  const rect = popup.getBoundingClientRect();
  return (
    lastMouseX >= rect.left - HOVER_BUFFER_PX &&
    lastMouseX <= rect.right + HOVER_BUFFER_PX &&
    lastMouseY >= rect.top - HOVER_BUFFER_PX &&
    lastMouseY <= rect.bottom + HOVER_BUFFER_PX
  );
}

function hidePopup(forceHide) {
  const popup = getPopupElement();
  if (!popup) {
    return;
  }

  if (forceHide) {
    clearTimeout(hideTimer);
    clearTimeout(hoverTimer);
    popup.classList.add("hidden");
    activePostUrl = "";
    return;
  }

  // Give a cursor that's just outside the popup, but still within the
  // buffer zone around it, another grace period instead of hiding —
  // handles overshooting the edge (e.g. toward the scrollbar) without
  // needing an actual oversized hitbox element.
  if (!popup.classList.contains("hidden") && isPointerNearPopup(popup)) {
    hideTimer = setTimeout(() => hidePopup(false), HIDE_DELAY_MS);
    return;
  }

  popup.classList.add("hidden");
  activePostUrl = "";
}

// Hover handler: renders instantly from data the feed page already has in
// the DOM (title/meta/stats only — no media), then kicks off the one
// network fetch that fills in the post's text body, top comment, and
// image URLs. The preview always opens on the text slide; images only
// appear once the user navigates the carousel to them.
function showQuickPreview(context) {
  const normalizedUrl = normalizePostUrl(context.url);
  if (!normalizedUrl) {
    return;
  }

  if (activePostUrl === normalizedUrl) {
    return;
  }
  activePostUrl = normalizedUrl;
  slideIndex = 0;

  const quickData = context.kind === "new"
    ? extractQuickDataNewReddit(context.el)
    : extractQuickDataOldReddit(context.el);

  renderQuickPopup(normalizedUrl, quickData);

  const cachedFull = fullContentCache.get(normalizedUrl);
  if (cachedFull) {
    renderFullContent(cachedFull);
  } else {
    void loadFullContent(normalizedUrl, isCardViewPost(context));
  }
}

function renderQuickPopup(postUrl, quickData) {
  const popup = getPopupElement();
  if (!popup) {
    return;
  }

  popup.dataset.postUrl = postUrl;

  popup.querySelector(".rh-title").textContent = quickData.title;
  popup.querySelector(".rh-meta").textContent = quickData.meta;
  popup.querySelector(".rh-stats").textContent = [
    quickData.score ? `${quickData.score} upvotes` : "",
    quickData.commentCount ? `${quickData.commentCount} comments` : ""
  ].filter(Boolean).join(" · ");

  popup.querySelector(".rh-body").classList.add("hidden");
  popup.querySelector(".rh-comment-section").classList.add("hidden");
  popup.querySelector(".rh-slide-image").classList.add("hidden");
  popup.querySelector(".rh-slide-text").classList.remove("hidden");
  popup.querySelector(".rh-nav-prev").classList.add("hidden");
  popup.querySelector(".rh-nav-next").classList.add("hidden");
  popup.querySelector(".rh-slide-dots").classList.add("hidden");
  popup.querySelector(".rh-loading").classList.remove("hidden");

  popup.classList.remove("hidden");
  popup.scrollTop = 0;
}

// Reddit's standard disclaimer that bots are required/expected to post
// on automated comments — catches subreddit-specific bots whose username
// doesn't follow the "*bot" convention (e.g. a custom welcome-message bot).
const BOT_DISCLAIMER_RE = /i am a bot,? and this action was performed automatically/i;

// Bot accounts (AutoModerator and friends) almost always post the first
// top-level comment, which isn't what people want to see as the "top"
// one — filter those out before picking the most-upvoted comment.
function isBotComment(comment) {
  const author = (comment?.author || "").toLowerCase();
  if (author === "automoderator" || author.endsWith("bot")) {
    return true;
  }
  return BOT_DISCLAIMER_RE.test(comment?.body || "");
}

// Picks the highest-upvoted top-level comment, ignoring bot comments.
// Returns undefined if there are no non-bot comments (e.g. the only
// comment is AutoModerator's), so the comment section stays hidden.
function pickTopComment(children) {
  const candidates = (children || []).filter(
    (c) => c.kind === "t1" && c.data?.body && !isBotComment(c.data)
  );
  if (candidates.length === 0) {
    return undefined;
  }
  return candidates.reduce((best, c) =>
    (c.data.ups || 0) > (best.data.ups || 0) ? c : best
  ).data;
}

// Fetches the post's text body, top comment, and image URLs — the one
// network request the whole preview needs, run once the popup is about
// to show. `isCardView` skips extracting (and therefore ever fetching/
// carouseling) images entirely — see isCardViewPost() for why. The
// fetchUrl check below keeps at most one request in flight — if a
// different post's fetch starts before this one resolves, it's the one
// that gets cancelled (not this one).
async function loadFullContent(postUrl, isCardView) {
  if (!postUrl || fetchUrl === postUrl) {
    return;
  }

  // At most one JSON request stays in flight — hovering onward to a
  // different post before this one resolves cancels it in background.js
  // instead of letting a response nobody needs anymore finish downloading.
  if (fetchUrl) {
    chrome.runtime.sendMessage({ type: "CANCEL_PREVIEW_JSON", requestId: fetchUrl }).catch(() => {});
  }
  fetchUrl = postUrl;

  const popup = getPopupElement();

  try {
    const jsonUrl = buildJsonUrl(postUrl);
    const result = await chrome.runtime.sendMessage({
      type: "FETCH_PREVIEW_JSON",
      url: jsonUrl,
      requestId: postUrl
    });

    if (fetchUrl === postUrl) {
      fetchUrl = "";
    }

    if (result?.aborted) {
      // Superseded by a newer hover before Reddit responded — nothing to
      // show or log, the post that mattered has already moved on.
      return;
    }
    if (!result?.ok) {
      throw new Error(result?.error || "Request failed");
    }

    const payload = result.payload;
    const postData = payload?.[0]?.data?.children?.[0]?.data;
    if (!postData) {
      throw new Error("Post data missing in response");
    }

    const topCommentData = pickTopComment(payload?.[1]?.data?.children);

    const fullData = {
      postUrl,
      // Authoritative title/meta/stats from the fetch itself — used to
      // correct the quick DOM-scraped placeholder once this resolves,
      // since that scrape can come up empty if Reddit's feed markup
      // doesn't match the selectors/attributes we guessed.
      title: postData.title || "",
      meta: `r/${postData.subreddit || "unknown"} by u/${postData.author || "unknown"}`,
      score: typeof postData.score === "number" ? String(postData.score) : "",
      commentCount: typeof postData.num_comments === "number" ? String(postData.num_comments) : "",
      body:
        postData.selftext?.trim() ||
        (postData.is_self ? "" : "(Link post: no text preview available.)"),
      // Card view already shows the post's media inline in the feed, so
      // there's nothing for our own carousel to add — skip the work and
      // the image fetch/prefetch entirely rather than just hiding the UI.
      images: isCardView ? [] : extractImages(postData),
      // Set only when the image(s) above should be shown behind a "Show
      // content" button rather than directly — see getContentGateRemark().
      gateRemark: isCardView ? null : getContentGateRemark(postData),
      revealed: false,
      topCommentAuthor: topCommentData ? `u/${topCommentData.author}` : "",
      topCommentBody: topCommentData?.body?.trim() || "",
      topCommentUps: topCommentData && typeof topCommentData.ups === "number" ? topCommentData.ups : null,
      prefetched: false
    };

    if (fullContentCache.size > 60) {
      const oldestKey = fullContentCache.keys().next().value;
      fullContentCache.delete(oldestKey);
    }
    fullContentCache.set(postUrl, fullData);

    // The user may have already moved into the popup while this fetch was
    // in flight — in that case start the image prefetch immediately
    // instead of waiting for another mouseenter that won't come.
    if (cursorOverPopup && popup?.dataset.postUrl === postUrl) {
      maybePrefetchImages(fullData);
    }

    if (popup?.dataset.postUrl === postUrl) {
      renderFullContent(fullData);
    }
  } catch (error) {
    if (fetchUrl === postUrl) {
      fetchUrl = "";
    }
    if (popup?.dataset.postUrl === postUrl) {
      popup.querySelector(".rh-loading").classList.add("hidden");
      const bodyEl = popup.querySelector(".rh-body");
      bodyEl.textContent = "Could not load this post right now.";
      bodyEl.classList.remove("hidden");
    }
    console.error("[Reddit Hover Preview]", error);
  }
}

// Starts warming the browser's image cache, at most once per post — called
// once the cursor actually enters the popup (real engagement), not on
// hover-start, so posts the user merely glances past never trigger a
// download. By the time the carousel is clicked to an image, it's
// typically already loading or loaded, since reading the text first takes
// at least as long.
function maybePrefetchImages(fullData) {
  if (fullData.prefetched || !fullData.images.length) {
    return;
  }

  fullData.prefetched = true;
  prefetchImages(fullData.images);
}

function prefetchImages(urls) {
  prefetchImage(urls[0], "high");
  if (urls.length > 1) {
    setTimeout(() => {
      urls.slice(1).forEach((url) => prefetchImage(url, "low"));
    }, 0);
  }
}

function prefetchImage(url, priority) {
  const img = new Image();
  img.decoding = "async";
  if ("fetchPriority" in img) {
    img.fetchPriority = priority;
  }
  img.src = url;
}

// Extracts every image for the post: the full gallery when it's a gallery
// post, otherwise the single image/link-preview image, if any.
function extractImages(postData) {
  const decode = (url) => (typeof url === "string" ? url.replace(/&amp;/g, "&") : "");

  if (postData.is_gallery && postData.gallery_data?.items?.length && postData.media_metadata) {
    const images = postData.gallery_data.items
      .map((item) => postData.media_metadata?.[item.media_id])
      .filter((meta) => meta?.s?.u || meta?.s?.gif)
      .map((meta) => decode(meta.s.u || meta.s.gif));
    if (images.length) {
      return images;
    }
  }

  if (postData.post_hint === "image" && postData.url_overridden_by_dest) {
    return [decode(postData.url_overridden_by_dest)];
  }

  const previewImage = postData.preview?.images?.[0]?.source?.url;
  if (previewImage) {
    return [decode(previewImage)];
  }

  // Last resort: Reddit's own feed thumbnail. It's a real image URL for
  // plenty of posts that don't match any case above — including many
  // "self"/video/multi_media posts — except for a handful of literal
  // sentinel strings ("self", "default", "nsfw", "spoiler", "image", "")
  // Reddit uses in its place; getContentGateRemark() is what reacts to
  // those by gating the result behind a "Show content" button.
  if (typeof postData.thumbnail === "string" && /^https?:\/\//i.test(postData.thumbnail)) {
    return [decode(postData.thumbnail)];
  }

  return [];
}

// Reddit substitutes one of a handful of literal strings for `thumbnail`
// instead of a URL in these cases. The underlying image is often still
// reachable through extractImages()'s other fallbacks (e.g. preview.images
// for an nsfw/spoiler post), so rather than hide it entirely, gate it
// behind a "Show content" button with a remark explaining why Reddit
// itself didn't surface a thumbnail here.
const THUMBNAIL_GATE_REMARKS = {
  nsfw: "Hidden because this post is marked NSFW.",
  spoiler: "Hidden to avoid spoiling this post.",
  default: "Reddit didn't generate a thumbnail for this post.",
  self: "This image comes from the post's text, not a thumbnail."
};

function getContentGateRemark(postData) {
  return THUMBNAIL_GATE_REMARKS[postData.thumbnail] || null;
}

function renderFullContent(fullData) {
  const popup = getPopupElement();
  if (!popup || popup.dataset.postUrl !== fullData.postUrl) {
    return;
  }

  popup.querySelector(".rh-loading").classList.add("hidden");

  // Correct the quick DOM-scraped placeholder with the real data, in case
  // that scrape came up empty (e.g. "Untitled post" / "r/unknown").
  if (fullData.title) {
    popup.querySelector(".rh-title").textContent = fullData.title;
  }
  popup.querySelector(".rh-meta").textContent = fullData.meta;
  popup.querySelector(".rh-stats").textContent = [
    fullData.score ? `${fullData.score} upvotes` : "",
    fullData.commentCount ? `${fullData.commentCount} comments` : ""
  ].filter(Boolean).join(" · ");

  const hasImages = fullData.images.length > 0;
  popup.querySelector(".rh-nav-prev").classList.toggle("hidden", !hasImages);
  popup.querySelector(".rh-nav-next").classList.toggle("hidden", !hasImages);
  popup.querySelector(".rh-slide-dots").classList.toggle("hidden", !hasImages);

  showSlide(popup, fullData, slideIndex);
}

function navigateSlide(popup, delta) {
  const fullData = fullContentCache.get(popup.dataset.postUrl);
  if (!fullData || !fullData.images.length) {
    return;
  }

  showSlide(popup, fullData, slideIndex + delta);
}

// Renders one slide of the text/images sequence: slide 0 is always the
// text body + top comment, slides 1..N are images[0..N-1]. Navigation
// wraps around in both directions — clicking past the last image lands
// back on the text slide, and clicking "previous" from the text slide
// lands on the last image.
function showSlide(popup, fullData, requestedIndex) {
  const totalSlides = fullData.images.length + 1;
  slideIndex = ((requestedIndex % totalSlides) + totalSlides) % totalSlides;

  const textEl = popup.querySelector(".rh-slide-text");
  const imageEl = popup.querySelector(".rh-slide-image");
  const gateEl = popup.querySelector(".rh-slide-gate");

  if (slideIndex === 0) {
    imageEl.classList.add("hidden");
    imageEl.classList.remove("gated");
    imageEl.removeAttribute("src");
    gateEl.classList.add("hidden");
    textEl.classList.remove("hidden");

    const bodyEl = popup.querySelector(".rh-body");
    if (fullData.body) {
      bodyEl.textContent = fullData.body;
      bodyEl.classList.remove("hidden");
    } else {
      bodyEl.classList.add("hidden");
    }

    const commentSection = popup.querySelector(".rh-comment-section");
    if (fullData.topCommentBody) {
      popup.querySelector(".rh-comment-author").textContent = fullData.topCommentAuthor;
      popup.querySelector(".rh-comment-ups").textContent =
        fullData.topCommentUps != null ? `${fullData.topCommentUps} upvotes` : "";
      popup.querySelector(".rh-comment-body").textContent = fullData.topCommentBody;
      commentSection.classList.remove("hidden");
    } else {
      commentSection.classList.add("hidden");
    }
  } else {
    textEl.classList.add("hidden");
    imageEl.src = fullData.images[slideIndex - 1];
    imageEl.classList.remove("hidden");

    const isGated = Boolean(fullData.gateRemark) && !fullData.revealed;
    imageEl.classList.toggle("gated", isGated);
    if (isGated) {
      popup.querySelector(".rh-gate-remark").textContent = fullData.gateRemark;
      gateEl.classList.remove("hidden");
    } else {
      gateEl.classList.add("hidden");
    }
  }

  updateDots(popup, totalSlides);
}

function updateDots(popup, totalSlides) {
  const dotsEl = popup.querySelector(".rh-slide-dots");
  dotsEl.innerHTML = Array.from(
    { length: totalSlides },
    (_, i) => `<span class="rh-dot${i === slideIndex ? " active" : ""}"></span>`
  ).join("");
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

// sort=top&limit=10&depth=1 asks Reddit for just the top-level comments,
// sorted by score, instead of its default (much larger) comment tree —
// enough to pick the highest-upvoted non-bot comment while still cutting
// payload size and parse time noticeably on posts with hundreds of comments.
function buildJsonUrl(normalizedUrl) {
  return `${normalizedUrl}.json?raw_json=1&sort=top&limit=10&depth=1`;
}
