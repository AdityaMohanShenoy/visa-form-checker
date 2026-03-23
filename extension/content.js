/**
 * Visa Form Checker — Content Script
 * Extracts form fields and highlights mismatches.
 */

// Import generic adapter (loaded via manifest content_scripts)
// generic.js is loaded before this file

/**
 * Remove all existing highlights.
 */
function clearHighlights() {
  document.querySelectorAll("[data-visa-checker-field]").forEach((el) => {
    el.classList.remove(
      "visa-checker-error",
      "visa-checker-warning",
      "visa-checker-match"
    );
  });
  document
    .querySelectorAll(".visa-checker-badge")
    .forEach((el) => el.remove());
}

/**
 * Position a badge near a form element.
 */
function addBadge(el, type, message) {
  const badge = document.createElement("div");
  badge.className = `visa-checker-badge visa-checker-badge-${type}`;
  badge.textContent = message;
  badge.title = message;

  // Position relative to the element
  const rect = el.getBoundingClientRect();
  badge.style.position = "absolute";
  badge.style.top = `${window.scrollY + rect.top - 20}px`;
  badge.style.left = `${window.scrollX + rect.right + 4}px`;

  document.body.appendChild(badge);
}

/**
 * Apply comparison results to the page.
 */
function applyResults(results) {
  clearHighlights();

  // Highlight mismatches
  for (const mismatch of results.mismatches || []) {
    const el = document.querySelector(
      `[data-visa-checker-field="${mismatch.form_field}"]`
    );
    if (!el) continue;

    const cssClass =
      mismatch.severity === "error"
        ? "visa-checker-error"
        : "visa-checker-warning";
    el.classList.add(cssClass);

    const icon = mismatch.severity === "error" ? "\u2717" : "\u26a0";
    addBadge(el, mismatch.severity, `${icon} ${mismatch.message}`);
  }

  // Highlight matches
  for (const match of results.matches || []) {
    const el = document.querySelector(
      `[data-visa-checker-field="${match.form_field}"]`
    );
    if (!el) continue;

    // Don't override error/warning highlights
    if (
      !el.classList.contains("visa-checker-error") &&
      !el.classList.contains("visa-checker-warning")
    ) {
      el.classList.add("visa-checker-match");
      addBadge(el, "match", `\u2713 Match (${match.match_type})`);
    }
  }
}

/**
 * Listen for messages from the background service worker.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "extractFields") {
    const fields = extractAllFields();
    sendResponse({ fields });
  } else if (message.action === "applyResults") {
    applyResults(message.results);
    sendResponse({ ok: true });
  } else if (message.action === "clearHighlights") {
    clearHighlights();
    sendResponse({ ok: true });
  }
  return true; // Keep message channel open for async response
});
