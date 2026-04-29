import { getStoredEngine, getStoredInspect } from "./EngineContext";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

function buildUrl(path, params = {}) {
  const normalizedBase = API_BASE_URL.endsWith("/")
    ? API_BASE_URL.slice(0, -1)
    : API_BASE_URL;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${normalizedBase}${normalizedPath}`, window.location.origin);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      url.searchParams.set(key, value);
    }
  });
  return url.toString();
}

function withClientParams(params) {
  const next = { ...params };
  next.engine = getStoredEngine();
  if (getStoredInspect()) {
    next.inspect = "1";
  }
  return next;
}

async function request(path, params = {}, options = {}) {
  const headers = options.body
    ? {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    : options.headers;

  const response = await fetch(buildUrl(path, withClientParams(params)), {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: options.signal
  });
  const payload = await response.json();

  if (!response.ok) {
    const message = payload?.error?.message || "API request failed";
    throw new Error(message);
  }

  return payload;
}

export function searchQuestions({ q, tag }, options = {}) {
  return request("/search", { q, tag }, options);
}

export function getTags({ q } = {}, options = {}) {
  return request("/tags", { q }, options);
}

export function getBenchmark({ q, tag } = {}, options = {}) {
  return request("/benchmark", { q, tag }, options);
}

export function getQuestion(id, options = {}) {
  return request(`/question/${id}`, {}, options);
}

export function createQuestion({ title, body, tags, ownerDisplayName }, options = {}) {
  return request(
    "/questions",
    {},
    {
      ...options,
      method: "POST",
      body: { title, body, tags, ownerDisplayName }
    }
  );
}

export function upvoteQuestion(id, options = {}) {
  return request(`/question/${id}/upvote`, {}, { ...options, method: "POST" });
}

export function postAnswer(questionId, { body, ownerDisplayName }, options = {}) {
  return request(
    `/question/${questionId}/answers`,
    {},
    {
      ...options,
      method: "POST",
      body: { body, ownerDisplayName }
    }
  );
}

export function upvoteAnswer(questionId, answerId, options = {}) {
  return request(`/question/${questionId}/answers/${answerId}/upvote`, {}, {
    ...options,
    method: "POST"
  });
}

export function postComment(questionId, answerId, { text, userDisplayName }, options = {}) {
  return request(
    `/question/${questionId}/answers/${answerId}/comments`,
    {},
    {
      ...options,
      method: "POST",
      body: { text, userDisplayName }
    }
  );
}

export function upvoteComment(questionId, answerId, commentId, options = {}) {
  return request(
    `/question/${questionId}/answers/${answerId}/comments/${commentId}/upvote`,
    {},
    { ...options, method: "POST" }
  );
}

export function inspectQuery(sql, options = {}) {
  return request("/inspect", {}, { method: "POST", body: { sql }, ...options });
}
