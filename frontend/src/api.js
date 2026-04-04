const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

function buildUrl(path, params = {}) {
  const url = new URL(`${API_BASE_URL}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      url.searchParams.set(key, value);
    }
  });
  return url.toString();
}

async function request(path, params = {}) {
  const response = await fetch(buildUrl(path, params));
  const payload = await response.json();

  if (!response.ok) {
    const message = payload?.error?.message || "API request failed";
    throw new Error(message);
  }

  return payload;
}

export function searchQuestions({ q, tag, engine }) {
  return request("/search", { q, tag, engine });
}

export function getQuestion(id, engine) {
  return request(`/question/${id}`, { engine });
}

export function getTags() {
  return request("/tags");
}

export function getBenchmark() {
  return request("/benchmark");
}
