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
  uploadArea.textContent = "";
  const processingP = document.createElement("p");
  const strong = document.createElement("strong");
  strong.textContent = file.name;
  processingP.append("Processing ", strong, "...");
  uploadArea.appendChild(processingP);

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
    console.log("OCR API response:", JSON.stringify(data, null, 2));
    extractedData = data;

    if (!data.mrz.success) {
      uploadArea.textContent = "";
      const failP = document.createElement("p");
      failP.style.color = "#c53030";
      failP.textContent = "MRZ extraction failed";
      const errP = document.createElement("p");
      errP.style.cssText = "font-size:12px;color:#718096";
      errP.textContent = data.mrz.error || "Unknown error";
      const retryP = document.createElement("p");
      retryP.style.cssText = "font-size:12px;margin-top:8px;cursor:pointer;color:#4299e1";
      retryP.textContent = "Click to try another image";
      uploadArea.append(failP, errP, retryP);
      return;
    }

    // Show extracted fields
    uploadArea.textContent = "";
    const successP = document.createElement("p");
    successP.style.color = "#38a169";
    successP.textContent = "MRZ extracted successfully";
    const anotherP = document.createElement("p");
    anotherP.style.cssText = "font-size:12px;cursor:pointer;color:#4299e1;margin-top:4px";
    anotherP.textContent = "Click to upload another";
    uploadArea.append(successP, anotherP);

    renderFields(data.mrz.fields || {});
    ocrResult.classList.remove("hidden");

    // Auto-fill profile label
    const name = [data.mrz.fields.given_names, data.mrz.fields.surname]
      .filter(Boolean)
      .join(" ");
    profileLabel.value = name
      ? `${name} - ${data.mrz.fields.issuing_country || "Passport"}`
      : "";
  } catch (err) {
    uploadArea.textContent = "";
    const errP = document.createElement("p");
    errP.style.color = "#c53030";
    errP.textContent = "Error: " + err.message;
    const retryP = document.createElement("p");
    retryP.style.cssText = "font-size:12px;cursor:pointer;color:#4299e1;margin-top:4px";
    retryP.textContent = "Click to try again";
    uploadArea.append(errP, retryP);
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
    const value = fields[key] || "\u2014";
    const item = document.createElement("div");
    item.className = "field-item";
    const lbl = document.createElement("label");
    lbl.textContent = label;
    const val = document.createElement("div");
    val.className = "value";
    val.dataset.field = key;
    val.textContent = value;
    item.append(lbl, val);
    fieldsGrid.appendChild(item);
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

    list.innerHTML = "";
    for (const p of profiles) {
      const card = document.createElement("div");
      card.className = "profile-card";
      card.dataset.id = p.id;

      const header = document.createElement("div");
      header.className = "profile-header";
      header.dataset.toggle = p.id;
      const labelSpan = document.createElement("span");
      labelSpan.className = "profile-label";
      labelSpan.textContent = p.label;
      const metaSpan = document.createElement("span");
      metaSpan.className = "profile-meta";
      metaSpan.textContent = p.updated_at ? new Date(p.updated_at).toLocaleDateString() : "";
      header.append(labelSpan, metaSpan);

      const details = document.createElement("div");
      details.className = "profile-details";
      const fieldGrid = document.createElement("div");
      fieldGrid.className = "profile-field-grid";
      for (const [key, label] of Object.entries(PROFILE_FIELDS)) {
        const row = document.createElement("div");
        const lbl = document.createElement("div");
        lbl.className = "pf-label";
        lbl.textContent = label;
        const val = document.createElement("div");
        val.className = "pf-value";
        val.dataset.pf = p.id;
        val.dataset.key = key;
        val.textContent = p[key] || "\u2014";
        row.append(lbl, val);
        fieldGrid.appendChild(row);
      }

      const actions = document.createElement("div");
      actions.className = "profile-actions";
      const editBtn = document.createElement("button");
      editBtn.className = "btn-sm btn-edit";
      editBtn.dataset.edit = p.id;
      editBtn.textContent = "Edit";
      const saveBtn = document.createElement("button");
      saveBtn.className = "btn-sm btn-save-edit hidden";
      saveBtn.dataset.save = p.id;
      saveBtn.textContent = "Save";
      const cancelBtn = document.createElement("button");
      cancelBtn.className = "btn-sm btn-cancel-edit hidden";
      cancelBtn.dataset.cancel = p.id;
      cancelBtn.textContent = "Cancel";
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "btn-sm btn-delete";
      deleteBtn.dataset.delete = p.id;
      deleteBtn.dataset.label = p.label;
      deleteBtn.textContent = "Delete";
      actions.append(editBtn, saveBtn, cancelBtn, deleteBtn);

      details.append(fieldGrid, actions);
      card.append(header, details);
      list.appendChild(card);
    }

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
    const val = el.textContent === "\u2014" ? "" : el.textContent;
    el.textContent = "";
    const input = document.createElement("input");
    input.className = "pf-edit";
    input.dataset.editKey = key;
    input.value = val;
    el.appendChild(input);
  });
  // Also make label editable
  const labelEl = card.querySelector(".profile-label");
  const labelVal = labelEl.textContent;
  labelEl.textContent = "";
  const labelInput = document.createElement("input");
  labelInput.className = "pf-edit";
  labelInput.dataset.editKey = "label";
  labelInput.value = labelVal;
  labelInput.style.cssText = "font-weight:600;font-size:14px;width:100%";
  labelEl.appendChild(labelInput);
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
