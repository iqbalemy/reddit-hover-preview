const SETTINGS_KEY = "hoverPreviewEnabled";
const HOVER_DELAY_MS = 450;
const HIDE_DELAY_MS = 140;
// Post text/comment/image-URL data, fetched once per post on hover and
// cached here so re-hovering (or re-revealing media) doesn't re-fetch.
const fullContentCache = new Map();

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

  const context = resolvePostContext(event.target);
  if (!context) {
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
// Deliberately read-only and synchronous: used only for the instant
// quick-preview shown before the real fetch (see showQuickPreview/
// loadFullContent) resolves.
function resolvePostContext(target) {
  const link = target.closest?.("a[href*='/comments/']");
  if (isValidPostLink(link)) {
    return { url: link.href, kind: "old", el: link.closest?.(".thing") || link };
  }

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

  return null;
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

  let thumbnailUrl = "";
  try {
    const img = post.querySelector(
      '[slot="thumbnail"] img, [slot="thumbnail"] faceplate-img, img'
    );
    thumbnailUrl = img?.getAttribute("src") || img?.getAttribute("data-src") || "";
  } catch {
    thumbnailUrl = "";
  }

  return {
    title,
    meta: `${subredditName} by u/${author}`,
    score,
    commentCount,
    thumbnailUrl
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
  const thumbnailSrc = thing.querySelector?.("a.thumbnail img")?.getAttribute("src") || "";

  let thumbnailUrl = "";
  if (thumbnailSrc) {
    try {
      thumbnailUrl = new URL(thumbnailSrc, window.location.origin).href;
    } catch {
      thumbnailUrl = "";
    }
  }

  return {
    title,
    meta: `${subreddit} by u/${author}`,
    score,
    commentCount,
    thumbnailUrl
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
    <h4 class="rh-title"></h4>
    <p class="rh-meta"></p>
    <p class="rh-stats"></p>
    <p class="rh-loading hidden">Loading post…</p>
    <div class="rh-media">
      <img class="rh-thumb hidden" alt="" />
      <button type="button" class="rh-show-content-btn hidden">Show content</button>
      <div class="rh-carousel hidden">
        <button type="button" class="rh-carousel-prev hidden" aria-label="Previous image">&#8249;</button>
        <img class="rh-carousel-img" alt="" />
        <button type="button" class="rh-carousel-next hidden" aria-label="Next image">&#8250;</button>
        <div class="rh-carousel-dots"></div>
      </div>
    </div>
    <pre class="rh-body hidden"></pre>
    <div class="rh-comment-section hidden">
      <p class="rh-comment-label">Top comment</p>
      <p class="rh-comment-author"></p>
      <p class="rh-comment-ups"></p>
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

  // Image data was already fetched (and its bytes already prefetched)
  // during hover — this click only reveals the carousel, it makes no
  // network request of its own.
  popup.querySelector(".rh-show-content-btn").addEventListener("click", () => {
    const postUrl = popup.dataset.postUrl;
    const fullData = fullContentCache.get(postUrl);
    if (!fullData) {
      return;
    }

    fullData.mediaRevealed = true;
    fullContentCache.set(postUrl, fullData);
    renderMedia(popup, fullData);
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

// Hover handler: renders instantly from data the feed page already has in
// the DOM, then kicks off the one network fetch that fills in the post's
// text body and top comment (always shown — no click needed for those).
// Image media is the only thing still gated behind "Show content": we
// fetch its URLs up front here too (same request) and start prefetching
// the image bytes immediately, so revealing the carousel on click is
// instant instead of waiting on a fresh image download.
function showQuickPreview(context) {
  const normalizedUrl = normalizePostUrl(context.url);
  if (!normalizedUrl) {
    return;
  }

  if (activePostUrl === normalizedUrl) {
    return;
  }
  activePostUrl = normalizedUrl;

  const quickData = context.kind === "new"
    ? extractQuickDataNewReddit(context.el)
    : extractQuickDataOldReddit(context.el);

  renderQuickPopup(normalizedUrl, quickData);

  const cachedFull = fullContentCache.get(normalizedUrl);
  if (cachedFull) {
    renderFullContent(cachedFull);
  } else {
    void loadFullContent(normalizedUrl);
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

  const thumbEl = popup.querySelector(".rh-thumb");
  if (quickData.thumbnailUrl) {
    thumbEl.src = quickData.thumbnailUrl;
    thumbEl.classList.remove("hidden");
  } else {
    thumbEl.classList.add("hidden");
  }

  popup.querySelector(".rh-carousel").classList.add("hidden");
  popup.querySelector(".rh-show-content-btn").classList.add("hidden");
  popup.querySelector(".rh-body").classList.add("hidden");
  popup.querySelector(".rh-comment-section").classList.add("hidden");
  popup.querySelector(".rh-loading").classList.remove("hidden");

  popup.classList.remove("hidden");
  popup.scrollTop = 0;
}

// Fetches the post's text body, top comment, and image URLs. Runs
// automatically on hover (text/comment are always shown), since that's
// the one network request the whole preview needs — image *bytes* are
// prefetched here too, in the background, so the only thing left for the
// "Show content" click to do is reveal an already-loaded carousel.
async function loadFullContent(postUrl) {
  if (!postUrl) {
    return;
  }

  const popup = getPopupElement();

  try {
    const jsonUrl = buildJsonUrl(postUrl);
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

    const fullData = {
      postUrl,
      body: postData.selftext?.trim() || "",
      images: extractImages(postData),
      topCommentAuthor: topCommentData ? `u/${topCommentData.author}` : "",
      topCommentBody: topCommentData?.body?.trim() || "",
      topCommentUps: topCommentData && typeof topCommentData.ups === "number" ? topCommentData.ups : null,
      mediaRevealed: false
    };

    if (fullContentCache.size > 60) {
      const oldestKey = fullContentCache.keys().next().value;
      fullContentCache.delete(oldestKey);
    }
    fullContentCache.set(postUrl, fullData);
    prefetchImages(fullData.images);

    if (popup?.dataset.postUrl === postUrl) {
      renderFullContent(fullData);
    }
  } catch (error) {
    if (popup?.dataset.postUrl === postUrl) {
      popup.querySelector(".rh-loading").classList.add("hidden");
      const bodyEl = popup.querySelector(".rh-body");
      bodyEl.textContent = "Could not load this post right now.";
      bodyEl.classList.remove("hidden");
    }
    console.error("[Reddit Hover Preview]", error);
  }
}

// Warms the browser's own image cache while the user is still just
// hovering, so clicking "Show content" later displays instantly instead
// of waiting on a fresh download. The first image is prefetched at high
// priority since it's what the carousel opens on; the rest follow at low
// priority so they don't compete with it for bandwidth.
function prefetchImages(urls) {
  if (!urls.length) {
    return;
  }

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

  return [];
}

// Text and top comment are always shown once loaded — only the image
// media stays gated behind the "Show content" click (see renderMedia).
function renderFullContent(fullData) {
  const popup = getPopupElement();
  if (!popup || popup.dataset.postUrl !== fullData.postUrl) {
    return;
  }

  popup.querySelector(".rh-loading").classList.add("hidden");

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

  renderMedia(popup, fullData);
}

// Shows the "Show content" button over whatever thumbnail is already
// displayed until the user clicks it, then swaps to the full carousel —
// using the already-prefetched images, so the swap is instant.
function renderMedia(popup, fullData) {
  const thumbEl = popup.querySelector(".rh-thumb");
  const showBtn = popup.querySelector(".rh-show-content-btn");
  const carousel = popup.querySelector(".rh-carousel");

  if (!fullData.images.length) {
    showBtn.classList.add("hidden");
    carousel.classList.add("hidden");
    return;
  }

  if (fullData.mediaRevealed) {
    thumbEl.classList.add("hidden");
    showBtn.classList.add("hidden");
    setupCarousel(carousel, fullData.images);
    carousel.classList.remove("hidden");
    return;
  }

  carousel.classList.add("hidden");
  showBtn.classList.remove("hidden");

  if (thumbEl.classList.contains("hidden")) {
    thumbEl.src = fullData.images[0];
    thumbEl.classList.remove("hidden");
  }
}

function setupCarousel(carousel, images) {
  const imgEl = carousel.querySelector(".rh-carousel-img");
  const dotsEl = carousel.querySelector(".rh-carousel-dots");
  const prevBtn = carousel.querySelector(".rh-carousel-prev");
  const nextBtn = carousel.querySelector(".rh-carousel-next");

  let index = 0;

  function render() {
    imgEl.src = images[index];
    dotsEl.innerHTML = images
      .map((_, i) => `<span class="rh-dot${i === index ? " active" : ""}"></span>`)
      .join("");
    const hasMultiple = images.length > 1;
    prevBtn.classList.toggle("hidden", !hasMultiple);
    nextBtn.classList.toggle("hidden", !hasMultiple);
  }

  prevBtn.onclick = (event) => {
    event.stopPropagation();
    index = (index - 1 + images.length) % images.length;
    render();
  };
  nextBtn.onclick = (event) => {
    event.stopPropagation();
    index = (index + 1) % images.length;
    render();
  };

  render();
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
  return `${normalizedUrl}.json?raw_json=1`;
}