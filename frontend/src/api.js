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

export function searchQuestions({ q, tag }) {
  return request("/search", { q, tag });
}

export function getTags({ q } = {}) {
  return request("/tags", { q });
}

export function getBenchmark({ q, tag } = {}) {
  return request("/benchmark", { q, tag });
}

export function getQuestion(id) {
  return request(`/question/${id}`);
}

export function createQuestion({ title, body, tags, author }) {
  return request(
    "/questions",
    {},
    {
      method: "POST",
      body: { title, body, tags, author }
    }
  );
}

export function upvoteQuestion(id) {
  return request(`/question/${id}/upvote`, {}, { method: "POST" });
}

export function postAnswer(questionId, { body, author }) {
  return request(
    `/question/${questionId}/answers`,
    {},
    {
      method: "POST",
      body: { body, author }
    }
  );
}

export function upvoteAnswer(questionId, answerId) {
  return request(`/question/${questionId}/answers/${answerId}/upvote`, {}, { method: "POST" });
}

export function postReply(questionId, answerId, { body, author }) {
  return request(
    `/question/${questionId}/answers/${answerId}/replies`,
    {},
    {
      method: "POST",
      body: { body, author }
    }
  );
}

export function upvoteReply(questionId, answerId, replyId) {
  return request(
    `/question/${questionId}/answers/${answerId}/replies/${replyId}/upvote`,
    {},
    { method: "POST" }
  );
}

export function inspectQuery(sql) {
  return request("/inspect", {}, { method: "POST", body: { sql } });
}
