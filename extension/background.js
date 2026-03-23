/**
 * Visa Form Checker — Background Service Worker
 * Bridges popup/content script with the backend API.
 */

const API_BASE = "http://127.0.0.1:5050/api/v1";

async function getToken() {
  const result = await chrome.storage.local.get("authToken");
  return result.authToken || null;
}

async function apiRequest(path, options = {}) {
  const token = await getToken();
  const headers = { ...options.headers };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  if (options.body && typeof options.body === "object" && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(options.body);
  }

  const resp = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!resp.ok) throw new Error(`API ${resp.status}`);
  if (resp.status === 204) return null;
  return resp.json();
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = async () => {
    try {
      switch (message.action) {
        case "checkHealth": {
          const resp = await fetch(`${API_BASE}/health`);
          return { ok: resp.ok };
        }

        case "getProfiles": {
          const profiles = await apiRequest("/profiles");
          return { profiles };
        }

        case "checkPage": {
          const { profileId, tabId } = message;

          // 1. Ask content script to extract fields
          const fieldResp = await chrome.tabs.sendMessage(tabId, {
            action: "extractFields",
          });

          if (!fieldResp || !fieldResp.fields || Object.keys(fieldResp.fields).length === 0) {
            return { error: "No form fields detected on this page" };
          }

          // 2. Send to backend for comparison
          const results = await apiRequest("/compare", {
            method: "POST",
            body: {
              profile_id: profileId,
              form_fields: fieldResp.fields,
            },
          });

          // 3. Send results back to content script for highlighting
          await chrome.tabs.sendMessage(tabId, {
            action: "applyResults",
            results,
          });

          return { results };
        }

        case "clearHighlights": {
          const { tabId: tid } = message;
          await chrome.tabs.sendMessage(tid, { action: "clearHighlights" });
          return { ok: true };
        }

        default:
          return { error: `Unknown action: ${message.action}` };
      }
    } catch (err) {
      return { error: err.message };
    }
  };

  handler().then(sendResponse);
  return true; // Keep channel open for async
});
