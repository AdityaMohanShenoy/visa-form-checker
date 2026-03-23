const API_BASE = "http://127.0.0.1:5050/api/v1";

const statusDot = document.getElementById("statusDot");
const offlineMsg = document.getElementById("offlineMsg");
const profileSelect = document.getElementById("profileSelect");
const checkBtn = document.getElementById("checkBtn");
const clearBtn = document.getElementById("clearBtn");
const optionsBtn = document.getElementById("optionsBtn");
const resultsDiv = document.getElementById("results");

let currentTabId = null;

async function init() {
  // Get current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTabId = tab.id;

  // Check backend health
  const healthResp = await chrome.runtime.sendMessage({ action: "checkHealth" });
  const online = healthResp && healthResp.ok;

  statusDot.classList.toggle("online", online);
  statusDot.classList.toggle("offline", !online);
  offlineMsg.classList.toggle("hidden", online);

  if (!online) {
    checkBtn.disabled = true;
    profileSelect.innerHTML = '<option value="">Backend offline</option>';
    return;
  }

  // Load profiles
  const resp = await chrome.runtime.sendMessage({ action: "getProfiles" });
  if (resp.error) {
    profileSelect.innerHTML = `<option value="">Error: ${resp.error}</option>`;
    return;
  }

  const profiles = resp.profiles || [];
  if (profiles.length === 0) {
    profileSelect.innerHTML =
      '<option value="">No profiles — add one in Settings</option>';
    return;
  }

  profileSelect.innerHTML = profiles
    .map(
      (p) =>
        `<option value="${p.id}">${p.label} (${p.passport_number || "no passport#"})</option>`
    )
    .join("");
  checkBtn.disabled = false;
}

checkBtn.addEventListener("click", async () => {
  const profileId = profileSelect.value;
  if (!profileId) return;

  checkBtn.disabled = true;
  checkBtn.textContent = "Checking...";
  resultsDiv.classList.add("hidden");

  const resp = await chrome.runtime.sendMessage({
    action: "checkPage",
    profileId,
    tabId: currentTabId,
  });

  checkBtn.disabled = false;
  checkBtn.textContent = "Check This Page";

  if (resp.error) {
    resultsDiv.innerHTML = `<div class="error-msg">${resp.error}</div>`;
    resultsDiv.classList.remove("hidden");
    return;
  }

  renderResults(resp.results);
});

function renderResults(results) {
  const mismatches = results.mismatches || [];
  const matches = results.matches || [];
  const unmatched = results.unmatched_fields || [];

  let html = "";

  // Summary
  if (mismatches.length === 0 && matches.length > 0) {
    html += `<div class="summary summary-good">\u2713 All ${matches.length} fields match</div>`;
  } else if (mismatches.length > 0) {
    const errors = mismatches.filter((m) => m.severity === "error").length;
    const warnings = mismatches.filter((m) => m.severity === "warning").length;
    html += `<div class="summary summary-bad">${errors} error(s), ${warnings} warning(s) found</div>`;
  }

  // Mismatches first
  for (const m of mismatches) {
    const icon = m.severity === "error" ? "\u2717" : "\u26a0";
    const cls = m.severity === "error" ? "result-error" : "result-warning";
    html += `<div class="result-item ${cls}">
      <span class="result-icon">${icon}</span>
      <div><strong>${m.form_field}</strong>: "${m.form_value}" \u2192 expected "${m.expected_value}"</div>
    </div>`;
  }

  // Matches
  for (const m of matches) {
    html += `<div class="result-item result-match">
      <span class="result-icon">\u2713</span>
      <div><strong>${m.form_field}</strong>: "${m.form_value}" (${m.match_type})</div>
    </div>`;
  }

  if (unmatched.length > 0) {
    html += `<div style="font-size:11px;color:#718096;margin-top:8px">
      Unmatched fields: ${unmatched.join(", ")}
    </div>`;
  }

  resultsDiv.innerHTML = html;
  resultsDiv.classList.remove("hidden");
}

clearBtn.addEventListener("click", async () => {
  if (currentTabId) {
    await chrome.runtime.sendMessage({
      action: "clearHighlights",
      tabId: currentTabId,
    });
  }
  resultsDiv.classList.add("hidden");
});

optionsBtn.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

init();
