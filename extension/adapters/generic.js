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
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="checkbox"]), select, textarea'
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

    if (value) {
      fields[canonical] = value;
      // Store the element reference for highlighting later
      el.dataset.visaCheckerField = canonical;
    }
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
      document.querySelector(`[name="${nameAttr}" i]`) ||
      document.querySelector(`[id="${nameAttr}" i]`);
    if (el && el.value) {
      fields[canonical] = el.value;
      el.dataset.visaCheckerField = canonical;
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
