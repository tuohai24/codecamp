const TOKEN_KEY = 'cc_token';

export const state = {
  token: localStorage.getItem(TOKEN_KEY) || '',
  user: null,
  site: null,
};

export function setToken(t) {
  state.token = t || '';
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function api(path, { method = 'GET', body } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
  const res = await fetch('/api' + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text };
  }
  if (!res.ok) {
    if (res.status === 401 && state.token && !path.startsWith('/auth/login')) {
      setToken('');
      state.user = null;
    }
    throw new Error((data && data.error) || `请求失败 (${res.status})`);
  }
  return data;
}

export async function loadMe() {
  if (!state.token) {
    state.user = null;
    return null;
  }
  try {
    state.user = await api('/auth/me');
  } catch {
    state.user = null;
  }
  return state.user;
}

export async function loadSite() {
  state.site = await api('/site');
  return state.site;
}

export function logout() {
  setToken('');
  state.user = null;
}
