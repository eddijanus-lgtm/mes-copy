const API_BASE = '/api';

function dispatchToast(type, message) {
  window.dispatchEvent(new CustomEvent('mes-toast', {
    detail: { type, message },
  }));
}

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

  let status;
  try {
    const res = await fetch(url, config);
    status = res.status;

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
        const contentType = res.headers.get('content-type') || '';
        const looksLikeHtml = contentType.includes('text/html') || /<!doctype html|<html[\s>]/i.test(responseText);
        detail = looksLikeHtml ? 'Der Server hat eine HTML-Fehlerseite geliefert. Bitte Backend/Proxy pruefen.' : responseText;
      }
      const prefix = res.status === 403 ? "Zugriff verweigert (403)" : `Anfrage fehlgeschlagen (${res.status})`;
      const errorMessage = detail ? `${prefix}: ${detail}` : prefix;
      dispatchToast('error', errorMessage);
      throw new Error(errorMessage);
    }

    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      throw new Error('Der Server hat keine gueltige API-Antwort geliefert. Bitte Backend/Proxy pruefen.');
    }
  } catch (error) {
    if (!error.message) {
      dispatchToast('error', 'Netzwerkfehler — bitte Verbindung pruefen.');
    }
    throw error;
  }
}

export const api = {
  get: (endpoint) => request(endpoint, { method: 'GET' }),
  post: (endpoint, body) => request(endpoint, { method: 'POST', body }),
  patch: (endpoint, body) => request(endpoint, { method: 'PATCH', body }),
  del: (endpoint) => request(endpoint, { method: 'DELETE' }),
};
