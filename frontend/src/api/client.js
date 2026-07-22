const API_BASE = '/api';

async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const token = localStorage.getItem('jwt_token');
  const headers = { ...options.headers };

  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';

  const config = {
    ...options,
    headers,
  };
  if (config.body && typeof config.body === 'object' && !(config.body instanceof FormData)) {
    config.body = JSON.stringify(config.body);
  }
  const res = await fetch(url, config);
  if (res.status === 401) {
    localStorage.removeItem('jwt_token');
    window.dispatchEvent(new Event('auth:unauthorized'));
  }
  if (!res.ok) {
    const responseText = await res.text();
    let detail = responseText;
    try {
      const payload = JSON.parse(responseText);
      detail = Array.isArray(payload.message) ? payload.message.join(" ") : payload.message || payload.error || responseText;
    } catch {
      // Keep plain-text error responses as-is.
    }
    const prefix = res.status === 403 ? "Zugriff verweigert (403)" : `Anfrage fehlgeschlagen (${res.status})`;
    throw new Error(detail ? `${prefix}: ${detail}` : prefix);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export const api = {
  get: (endpoint) => request(endpoint, { method: 'GET' }),
  post: (endpoint, body) => request(endpoint, { method: 'POST', body }),
  patch: (endpoint, body) => request(endpoint, { method: 'PATCH', body }),
  del: (endpoint) => request(endpoint, { method: 'DELETE' }),
};
