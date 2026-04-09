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

async function request(path, params = {}, options = {}) {
  const headers = options.body
    ? {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    : options.headers;

  const response = await fetch(buildUrl(path, params), {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
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
