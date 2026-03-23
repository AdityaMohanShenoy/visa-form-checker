/**
 * Backend HTTP client for the Visa Form Checker API.
 */

const DEFAULT_BASE_URL = "http://127.0.0.1:5050/api/v1";

class ApiClient {
  constructor(baseUrl = DEFAULT_BASE_URL) {
    this.baseUrl = baseUrl;
    this.token = null;
  }

  async loadToken() {
    const result = await chrome.storage.local.get("authToken");
    this.token = result.authToken || null;
    return this.token;
  }

  async setToken(token) {
    this.token = token;
    await chrome.storage.local.set({ authToken: token });
  }

  async request(path, options = {}) {
    if (!this.token) {
      await this.loadToken();
    }

    const url = `${this.baseUrl}${path}`;
    const headers = {
      ...options.headers,
    };

    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    if (options.body && !(options.body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(options.body);
    }

    const response = await fetch(url, { ...options, headers });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`API ${response.status}: ${text}`);
    }

    if (response.status === 204) return null;
    return response.json();
  }

  async health() {
    // Health endpoint doesn't need auth
    const url = `${this.baseUrl}/health`;
    const response = await fetch(url);
    return response.ok;
  }

  async getProfiles() {
    return this.request("/profiles");
  }

  async getProfile(id) {
    return this.request(`/profiles/${id}`);
  }

  async compare(profileId, formFields) {
    return this.request("/compare", {
      method: "POST",
      body: { profile_id: profileId, form_fields: formFields },
    });
  }

  async extractOCR(file) {
    const formData = new FormData();
    formData.append("file", file);
    return this.request("/ocr/extract", {
      method: "POST",
      body: formData,
    });
  }

  async createProfile(data) {
    return this.request("/profiles", {
      method: "POST",
      body: data,
    });
  }
}

// Singleton
const api = new ApiClient();
