/**
 * Generic form field extractor — works on any site via heuristic label matching.
 */

// Canonical field names we try to match labels against
const LABEL_PATTERNS = {
  given_names: [/first\s*name/i, /given\s*name/i, /forename/i],
  surname: [/last\s*name/i, /surname/i, /family\s*name/i],
  full_name: [/^full\s*name$/i, /^name$/i],
  passport_number: [/passport\s*(no|number|num)/i, /travel\s*doc/i, /document\s*number/i],
  date_of_birth: [/date\s*of\s*birth/i, /birth\s*date/i, /^dob$/i],
  dob_day: [/birth.*day/i, /dob.*day/i, /day.*birth/i],
  dob_month: [/birth.*month/i, /dob.*month/i, /month.*birth/i],
  dob_year: [/birth.*year/i, /dob.*year/i, /year.*birth/i],
  nationality: [/nationality/i, /citizenship/i],
  gender: [/gender/i, /^sex$/i],
  expiry_date: [/expir/i, /passport.*expir/i, /valid.*until/i],
  issue_date: [/issue\s*date/i, /date.*issue/i],
  place_of_birth: [/place\s*of\s*birth/i, /birth\s*place/i, /city.*birth/i],
  country: [/^country$/i, /country\s*of\s*residence/i],
  address_line1: [/address\s*(line)?\s*1/i, /^address$/i, /street/i],
  address_line2: [/address\s*(line)?\s*2/i],
  city: [/^city$/i, /^town$/i],
  state_province: [/^state$/i, /province/i, /^region$/i],
  postal_code: [/post\s*code/i, /zip\s*code/i, /postal/i],
};

const DATE_FIELDS = new Set(["date_of_birth", "expiry_date", "issue_date"]);

function isLikelyDateValue(value) {
  const v = (value || "").trim();
  if (!v || !/\d/.test(v)) return false;
  if (/^\d{8}$/.test(v)) return true;
  if (/^\d{1,4}[/-]\d{1,2}[/-]\d{1,4}$/.test(v)) return true;
  if (/^\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4}$/.test(v)) return true;
  if (/^[A-Za-z]{3,9}\s+\d{1,2},\s*\d{2,4}$/.test(v)) return true;
  return false;
}

function isLikelyPersonName(value) {
  const cleaned = (value || "").trim().replace(/\s+/g, " ");
  if (!cleaned) return false;
  const parts = cleaned.split(" ");
  const alphaParts = parts.filter((p) => /[A-Za-z]/.test(p));
  return alphaParts.length >= 2;
}

function shouldAcceptValue(canonical, value) {
  if (DATE_FIELDS.has(canonical)) return isLikelyDateValue(value);
  if (canonical === "full_name") return isLikelyPersonName(value);
  return true;
}

function setFieldIfAbsent(fields, canonical, value, el) {
  const trimmed = (value || "").trim();
  if (!trimmed) return;
  if (!shouldAcceptValue(canonical, trimmed)) return;
  // Keep the first plausible match; later duplicates are often secondary sections.
  if (!(canonical in fields)) {
    fields[canonical] = trimmed;
    if (el) el.dataset.visaCheckerField = canonical;
  }
}

/**
 * Find the best label text for a form element.
 */
function getLabelText(el) {
  // 1. Check for associated <label>
  if (el.id) {
    const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (label) return label.textContent.trim();
  }

  // 2. Check aria-label
  if (el.getAttribute("aria-label")) {
    return el.getAttribute("aria-label").trim();
  }

  // 3. Check placeholder
  if (el.placeholder) {
    return el.placeholder.trim();
  }

  // 4. Check parent label
  const parentLabel = el.closest("label");
  if (parentLabel) {
    // Get text content excluding the input itself
    const clone = parentLabel.cloneNode(true);
    clone.querySelectorAll("input, select, textarea").forEach((e) => e.remove());
    const text = clone.textContent.trim();
    if (text) return text;
  }

  // 5. Check preceding sibling or nearby text
  const prev = el.previousElementSibling;
  if (prev && (prev.tagName === "LABEL" || prev.tagName === "SPAN")) {
    return prev.textContent.trim();
  }

  // 6. Fall back to name or id
  return el.name || el.id || "";
}

/**
 * Match a label string to a canonical field name.
 */
function matchLabel(labelText) {
  const text = labelText.toLowerCase().trim();
  for (const [fieldName, patterns] of Object.entries(LABEL_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        return fieldName;
      }
    }
  }
  return null;
}

/**
 * Extract all form field values from the current page.
 * Returns { canonicalFieldName: value, ... }
 */
function extractFormFields() {
  const fields = {};
  const elements = document.querySelectorAll(
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]), select, textarea'
  );

  for (const el of elements) {
    const label = getLabelText(el);
    if (!label) continue;

    const canonical = matchLabel(label);
    if (!canonical) continue;

    let value = "";
    if (el.tagName === "SELECT") {
      const selected = el.options[el.selectedIndex];
      value = selected ? selected.text || selected.value : "";
    } else {
      value = el.value;
    }

    setFieldIfAbsent(fields, canonical, value, el);
  }

  return fields;
}

// Also try to detect by common field name/id patterns
function extractByNameId() {
  const NAME_ID_MAP = {
    first_name: "given_names",
    firstname: "given_names",
    given_name: "given_names",
    last_name: "surname",
    lastname: "surname",
    surname: "surname",
    passport_number: "passport_number",
    passport_no: "passport_number",
    dob: "date_of_birth",
    date_of_birth: "date_of_birth",
    nationality: "nationality",
    gender: "gender",
    sex: "gender",
  };

  const fields = {};
  for (const [nameAttr, canonical] of Object.entries(NAME_ID_MAP)) {
    const el =
      document.querySelector(
        `input[name="${nameAttr}" i]:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]), select[name="${nameAttr}" i], textarea[name="${nameAttr}" i]`
      ) ||
      document.querySelector(
        `input[id="${nameAttr}" i]:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]), select[id="${nameAttr}" i], textarea[id="${nameAttr}" i]`
      );
    if (el) {
      const value = el.tagName === "SELECT"
        ? (el.options[el.selectedIndex]?.text || el.options[el.selectedIndex]?.value || "")
        : el.value;
      setFieldIfAbsent(fields, canonical, value, el);
    }
  }
  return fields;
}

/**
 * Combined extraction: label-based + name/id-based (label takes priority).
 */
function extractAllFields() {
  const byNameId = extractByNameId();
  const byLabel = extractFormFields();
  return { ...byNameId, ...byLabel }; // label-based overwrites name/id-based
}
