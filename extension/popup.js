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
    profileSelect.textContent = "";
    const offOpt = document.createElement("option");
    offOpt.value = "";
    offOpt.textContent = "Backend offline";
    profileSelect.appendChild(offOpt);
    return;
  }

  // Load profiles
  const resp = await chrome.runtime.sendMessage({ action: "getProfiles" });
  if (resp.error) {
    profileSelect.textContent = "";
    const errOpt = document.createElement("option");
    errOpt.value = "";
    errOpt.textContent = "Error: " + resp.error;
    profileSelect.appendChild(errOpt);
    return;
  }

  const profiles = resp.profiles || [];
  if (profiles.length === 0) {
    profileSelect.textContent = "";
    const emptyOpt = document.createElement("option");
    emptyOpt.value = "";
    emptyOpt.textContent = "No profiles \u2014 add one in Settings";
    profileSelect.appendChild(emptyOpt);
    return;
  }

  profileSelect.textContent = "";
  for (const p of profiles) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = `${p.label} (${p.passport_number || "no passport#"})`;
    profileSelect.appendChild(opt);
  }
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
    resultsDiv.textContent = "";
    const errDiv = document.createElement("div");
    errDiv.className = "error-msg";
    errDiv.textContent = resp.error;
    resultsDiv.appendChild(errDiv);
    resultsDiv.classList.remove("hidden");
    return;
  }

  renderResults(resp.results);
});

function renderResults(results) {
  const mismatches = results.mismatches || [];
  const matches = results.matches || [];
  const unmatched = results.unmatched_fields || [];

  resultsDiv.textContent = "";

  // Summary
  if (mismatches.length === 0 && matches.length > 0) {
    const summary = document.createElement("div");
    summary.className = "summary summary-good";
    summary.textContent = "\u2713 All " + matches.length + " fields match";
    resultsDiv.appendChild(summary);
  } else if (mismatches.length > 0) {
    const errors = mismatches.filter((m) => m.severity === "error").length;
    const warnings = mismatches.filter((m) => m.severity === "warning").length;
    const summary = document.createElement("div");
    summary.className = "summary summary-bad";
    summary.textContent = errors + " error(s), " + warnings + " warning(s) found";
    resultsDiv.appendChild(summary);
  }

  // Mismatches first
  for (const m of mismatches) {
    const icon = m.severity === "error" ? "\u2717" : "\u26a0";
    const cls = m.severity === "error" ? "result-error" : "result-warning";
    const item = document.createElement("div");
    item.className = "result-item " + cls;
    const iconSpan = document.createElement("span");
    iconSpan.className = "result-icon";
    iconSpan.textContent = icon;
    const info = document.createElement("div");
    const strong = document.createElement("strong");
    strong.textContent = m.form_field;
    info.append(strong, ': "' + m.form_value + '" \u2192 expected "' + m.expected_value + '"');
    item.append(iconSpan, info);
    resultsDiv.appendChild(item);
  }

  // Matches
  for (const m of matches) {
    const item = document.createElement("div");
    item.className = "result-item result-match";
    const iconSpan = document.createElement("span");
    iconSpan.className = "result-icon";
    iconSpan.textContent = "\u2713";
    const info = document.createElement("div");
    const strong = document.createElement("strong");
    strong.textContent = m.form_field;
    info.append(strong, ': "' + m.form_value + '" (' + m.match_type + ')');
    item.append(iconSpan, info);
    resultsDiv.appendChild(item);
  }

  if (unmatched.length > 0) {
    const unmatchedDiv = document.createElement("div");
    unmatchedDiv.style.cssText = "font-size:11px;color:#718096;margin-top:8px";
    unmatchedDiv.textContent = "Unmatched fields: " + unmatched.join(", ");
    resultsDiv.appendChild(unmatchedDiv);
  }
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
