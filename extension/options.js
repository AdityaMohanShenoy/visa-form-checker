const API_BASE = "http://127.0.0.1:5050/api/v1";

const tokenInput = document.getElementById("tokenInput");
const saveTokenBtn = document.getElementById("saveTokenBtn");
const tokenMsg = document.getElementById("tokenMsg");
const uploadArea = document.getElementById("uploadArea");
const fileInput = document.getElementById("fileInput");
const ocrResult = document.getElementById("ocrResult");
const fieldsGrid = document.getElementById("fieldsGrid");
const profileLabel = document.getElementById("profileLabel");
const saveProfileBtn = document.getElementById("saveProfileBtn");
const profileMsg = document.getElementById("profileMsg");

let extractedData = null;

// --- Token Management ---

async function loadToken() {
  const result = await chrome.storage.local.get("authToken");
  if (result.authToken) {
    tokenInput.value = result.authToken;
  }
}

saveTokenBtn.addEventListener("click", async () => {
  const token = tokenInput.value.trim();
  if (!token) return;

  await chrome.storage.local.set({ authToken: token });

  // Verify by calling health (which doesn't need auth) then profiles (which does)
  try {
    const resp = await fetch(`${API_BASE}/profiles`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (resp.ok) {
      showMsg(tokenMsg, "Token saved and verified!", "success");
    } else {
      showMsg(tokenMsg, `Token saved but verification failed (${resp.status})`, "error");
    }
  } catch {
    showMsg(tokenMsg, "Token saved but backend is not reachable", "error");
  }
});

// --- File Upload ---

uploadArea.addEventListener("click", () => fileInput.click());
uploadArea.addEventListener("dragover", (e) => {
  e.preventDefault();
  uploadArea.classList.add("dragging");
});
uploadArea.addEventListener("dragleave", () => {
  uploadArea.classList.remove("dragging");
});
uploadArea.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadArea.classList.remove("dragging");
  if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener("change", () => {
  if (fileInput.files.length) handleFile(fileInput.files[0]);
});

async function handleFile(file) {
  uploadArea.innerHTML = `<p>Processing <strong>${file.name}</strong>...</p>`;

  try {
    const token = (await chrome.storage.local.get("authToken")).authToken;
    const formData = new FormData();
    formData.append("file", file);

    const resp = await fetch(`${API_BASE}/ocr/extract`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });

    if (!resp.ok) throw new Error(`API returned ${resp.status}`);

    const data = await resp.json();
    extractedData = data;

    if (!data.mrz.success) {
      uploadArea.innerHTML = `
        <p style="color: #c53030">MRZ extraction failed</p>
        <p style="font-size: 12px; color: #718096">${data.mrz.error || "Unknown error"}</p>
        <p style="font-size: 12px; margin-top: 8px; cursor: pointer; color: #4299e1">Click to try another image</p>
      `;
      return;
    }

    // Show extracted fields
    uploadArea.innerHTML = `
      <p style="color: #38a169">MRZ extracted successfully</p>
      <p style="font-size: 12px; cursor: pointer; color: #4299e1; margin-top: 4px">Click to upload another</p>
    `;

    renderFields(data.mrz.fields);
    ocrResult.classList.remove("hidden");

    // Auto-fill profile label
    const name = [data.mrz.fields.given_names, data.mrz.fields.surname]
      .filter(Boolean)
      .join(" ");
    profileLabel.value = name
      ? `${name} - ${data.mrz.fields.issuing_country || "Passport"}`
      : "";
  } catch (err) {
    uploadArea.innerHTML = `
      <p style="color: #c53030">Error: ${err.message}</p>
      <p style="font-size: 12px; cursor: pointer; color: #4299e1; margin-top: 4px">Click to try again</p>
    `;
  }
}

function renderFields(fields) {
  const labels = {
    surname: "Surname",
    given_names: "Given Names",
    passport_number: "Passport Number",
    nationality: "Nationality",
    date_of_birth: "Date of Birth",
    gender: "Gender",
    expiry_date: "Expiry Date",
    issuing_country: "Issuing Country",
    document_type: "Document Type",
  };

  fieldsGrid.innerHTML = "";
  for (const [key, label] of Object.entries(labels)) {
    const value = fields[key] || "—";
    fieldsGrid.innerHTML += `
      <div class="field-item">
        <label>${label}</label>
        <div class="value" data-field="${key}">${value}</div>
      </div>
    `;
  }
}

// --- Save Profile ---

saveProfileBtn.addEventListener("click", async () => {
  if (!extractedData || !extractedData.mrz.success) return;

  const label = profileLabel.value.trim();
  if (!label) {
    showMsg(profileMsg, "Please enter a profile label", "error");
    return;
  }

  const fields = extractedData.mrz.fields;
  const profileData = {
    label,
    surname: fields.surname,
    given_names: fields.given_names,
    passport_number: fields.passport_number,
    nationality: fields.nationality,
    date_of_birth: fields.date_of_birth,
    gender: fields.gender,
    expiry_date: fields.expiry_date,
    issuing_country: fields.issuing_country,
    document_type: fields.document_type,
    mrz_raw: extractedData.mrz.raw,
    source_image_hash: extractedData.image_hash,
  };

  try {
    const token = (await chrome.storage.local.get("authToken")).authToken;
    const resp = await fetch(`${API_BASE}/profiles`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(profileData),
    });

    if (!resp.ok) throw new Error(`API returned ${resp.status}`);

    showMsg(profileMsg, "Profile saved! You can now use it from the popup.", "success");
    loadProfiles();
  } catch (err) {
    showMsg(profileMsg, `Error saving profile: ${err.message}`, "error");
  }
});

// --- Profile Management ---

const PROFILE_FIELDS = {
  surname: "Surname",
  given_names: "Given Names",
  passport_number: "Passport Number",
  nationality: "Nationality",
  date_of_birth: "Date of Birth",
  gender: "Gender",
  expiry_date: "Expiry Date",
  issuing_country: "Issuing Country",
  document_type: "Document Type",
  place_of_birth: "Place of Birth",
  issue_date: "Issue Date",
};

async function getToken() {
  return (await chrome.storage.local.get("authToken")).authToken;
}

async function loadProfiles() {
  const list = document.getElementById("profilesList");
  try {
    const token = await getToken();
    const resp = await fetch(`${API_BASE}/profiles`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) throw new Error(`${resp.status}`);
    const profiles = await resp.json();

    if (!profiles.length) {
      list.innerHTML = `<div class="no-profiles">No profiles saved yet. Upload a passport above to create one.</div>`;
      return;
    }

    list.innerHTML = profiles.map((p) => {
      const fieldRows = Object.entries(PROFILE_FIELDS)
        .map(([key, label]) => {
          const val = p[key] || "—";
          return `
            <div>
              <div class="pf-label">${label}</div>
              <div class="pf-value" data-pf="${p.id}" data-key="${key}">${val}</div>
            </div>`;
        })
        .join("");

      const date = p.updated_at ? new Date(p.updated_at).toLocaleDateString() : "";

      return `
        <div class="profile-card" data-id="${p.id}">
          <div class="profile-header" data-toggle="${p.id}">
            <span class="profile-label">${p.label}</span>
            <span class="profile-meta">${date}</span>
          </div>
          <div class="profile-details">
            <div class="profile-field-grid">${fieldRows}</div>
            <div class="profile-actions">
              <button class="btn-sm btn-edit" data-edit="${p.id}">Edit</button>
              <button class="btn-sm btn-save-edit hidden" data-save="${p.id}">Save</button>
              <button class="btn-sm btn-cancel-edit hidden" data-cancel="${p.id}">Cancel</button>
              <button class="btn-sm btn-delete" data-delete="${p.id}" data-label="${p.label}">Delete</button>
            </div>
          </div>
        </div>`;
    }).join("");

    // Attach event listeners (CSP blocks inline onclick)
    list.querySelectorAll("[data-toggle]").forEach((el) => {
      el.addEventListener("click", () => toggleProfile(el.dataset.toggle));
    });
    list.querySelectorAll("[data-edit]").forEach((el) => {
      el.addEventListener("click", () => editProfile(el.dataset.edit));
    });
    list.querySelectorAll("[data-save]").forEach((el) => {
      el.addEventListener("click", () => saveProfile(el.dataset.save));
    });
    list.querySelectorAll("[data-cancel]").forEach((el) => {
      el.addEventListener("click", () => cancelEdit(el.dataset.cancel));
    });
    list.querySelectorAll("[data-delete]").forEach((el) => {
      el.addEventListener("click", () => deleteProfile(el.dataset.delete, el.dataset.label));
    });
  } catch {
    list.innerHTML = `<div class="no-profiles">Could not load profiles. Is the backend running?</div>`;
  }
}

function toggleProfile(id) {
  const card = document.querySelector(`.profile-card[data-id="${id}"]`);
  card.classList.toggle("expanded");
}

function editProfile(id) {
  const card = document.querySelector(`.profile-card[data-id="${id}"]`);
  // Replace values with inputs
  card.querySelectorAll(`.pf-value[data-pf="${id}"]`).forEach((el) => {
    const key = el.dataset.key;
    const val = el.textContent === "—" ? "" : el.textContent;
    el.innerHTML = `<input class="pf-edit" data-edit-key="${key}" value="${val}">`;
  });
  // Also make label editable
  const labelEl = card.querySelector(".profile-label");
  const labelVal = labelEl.textContent;
  labelEl.innerHTML = `<input class="pf-edit" data-edit-key="label" value="${labelVal}" style="font-weight:600;font-size:14px;width:100%">`;
  // Toggle buttons
  card.querySelector(".btn-edit").classList.add("hidden");
  card.querySelector(`[data-save="${id}"]`).classList.remove("hidden");
  card.querySelector(`[data-cancel="${id}"]`).classList.remove("hidden");
}

function cancelEdit(id) {
  loadProfiles();
}

async function saveProfile(id) {
  const card = document.querySelector(`.profile-card[data-id="${id}"]`);
  const updates = {};
  card.querySelectorAll(".pf-edit").forEach((input) => {
    const key = input.dataset.editKey;
    const val = input.value.trim();
    if (val) updates[key] = val;
  });

  try {
    const token = await getToken();
    const resp = await fetch(`${API_BASE}/profiles/${id}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(updates),
    });
    if (!resp.ok) throw new Error(`${resp.status}`);
    loadProfiles();
  } catch (err) {
    alert(`Failed to save: ${err.message}`);
  }
}

async function deleteProfile(id, label) {
  if (!confirm(`Delete profile "${label}"?`)) return;
  try {
    const token = await getToken();
    const resp = await fetch(`${API_BASE}/profiles/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) throw new Error(`${resp.status}`);
    loadProfiles();
  } catch (err) {
    alert(`Failed to delete: ${err.message}`);
  }
}

function showMsg(el, text, type) {
  el.textContent = text;
  el.className = `msg msg-${type}`;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 5000);
}

loadToken();
loadProfiles();
