import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  getQuestion,
  postAnswer,
  postReply,
  upvoteAnswer,
  upvoteQuestion,
  upvoteReply
} from "../api";

function formatDate(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Date unavailable";
  }
  return parsed.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export default function QuestionPage() {
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [question, setQuestion] = useState(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  const [answerAuthor, setAnswerAuthor] = useState("");
  const [answerBody, setAnswerBody] = useState("");
  const [postingAnswer, setPostingAnswer] = useState(false);
  const [answerModalOpen, setAnswerModalOpen] = useState(false);

  const [replyAuthor, setReplyAuthor] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [postingReply, setPostingReply] = useState(false);
  const [replyModalAnswerId, setReplyModalAnswerId] = useState(null);

  useEffect(() => {
    let active = true;

    async function loadQuestion() {
      setLoading(true);
      setError("");
      try {
        const response = await getQuestion(id);
        if (active) {
          setQuestion(response.data);
        }
      } catch (requestError) {
        if (active) {
          setError(requestError.message);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadQuestion();

    return () => {
      active = false;
    };
  }, [id]);

  async function handleQuestionUpvote() {
    if (!question || busy) {
      return;
    }
    setBusy(true);
    setActionError("");
    try {
      const response = await upvoteQuestion(question.id);
      setQuestion((prev) => (prev ? { ...prev, score: response.data.score } : prev));
    } catch (requestError) {
      setActionError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function handlePostAnswer(event) {
    event.preventDefault();
    if (!question || postingAnswer) {
      return;
    }

    setPostingAnswer(true);
    setActionError("");
    try {
      const response = await postAnswer(question.id, {
        author: answerAuthor,
        body: answerBody
      });
      setQuestion((prev) =>
        prev
          ? {
              ...prev,
              answers: [...prev.answers, response.data]
            }
          : prev
      );
      setAnswerAuthor("");
      setAnswerBody("");
      setAnswerModalOpen(false);
    } catch (requestError) {
      setActionError(requestError.message);
    } finally {
      setPostingAnswer(false);
    }
  }

  async function handleAnswerUpvote(answerId) {
    if (!question || busy) {
      return;
    }
    setBusy(true);
    setActionError("");
    try {
      const response = await upvoteAnswer(question.id, answerId);
      setQuestion((prev) => {
        if (!prev) {
          return prev;
        }
        return {
          ...prev,
          answers: prev.answers.map((answer) =>
            answer.id === answerId ? { ...answer, score: response.data.score } : answer
          )
        };
      });
    } catch (requestError) {
      setActionError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function handlePostReply(event) {
    event.preventDefault();
    if (!question || postingReply || !replyModalAnswerId) {
      return;
    }
    const body = replyBody.trim();
    const author = replyAuthor.trim();
    if (!body) {
      return;
    }

    setPostingReply(true);
    setActionError("");
    try {
      const response = await postReply(question.id, replyModalAnswerId, { body, author });
      setQuestion((prev) => {
        if (!prev) {
          return prev;
        }
        return {
          ...prev,
          answers: prev.answers.map((answer) => {
            if (answer.id !== replyModalAnswerId) {
              return answer;
            }
            const nextReplies = [...(answer.replies || []), response.data];
            return { ...answer, replies: nextReplies };
          })
        };
      });
      setReplyAuthor("");
      setReplyBody("");
      setReplyModalAnswerId(null);
    } catch (requestError) {
      setActionError(requestError.message);
    } finally {
      setPostingReply(false);
    }
  }

  async function handleReplyUpvote(answerId, replyId) {
    if (!question || busy) {
      return;
    }
    setBusy(true);
    setActionError("");
    try {
      const response = await upvoteReply(question.id, answerId, replyId);
      setQuestion((prev) => {
        if (!prev) {
          return prev;
        }
        return {
          ...prev,
          answers: prev.answers.map((answer) => {
            if (answer.id !== answerId) {
              return answer;
            }
            return {
              ...answer,
              replies: (answer.replies || []).map((reply) =>
                reply.id === replyId ? { ...reply, score: response.data.score } : reply
              )
            };
          })
        };
      });
    } catch (requestError) {
      setActionError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p className="status loading">Loading question...</p>;
  }

  if (error) {
    return <p className="status error">{error}</p>;
  }

  if (!question) {
    return <p className="status error">Question not found.</p>;
  }

  const replyTargetAnswer =
    replyModalAnswerId !== null
      ? question.answers.find((answer) => answer.id === replyModalAnswerId) || null
      : null;

  return (
    <section className="question-detail">
      <p className="back-link-wrap">
        <Link to="/questions">Back to questions</Link>
      </p>

      <article className="detail-card">
        <h2>{question.title}</h2>
        <p className="detail-body">{question.body}</p>
        <div className="tag-row">
          {question.tags.map((tag) => (
            <span key={tag} className="tag-chip">
              {tag}
            </span>
          ))}
        </div>
        <p className="question-date">
          asked by {question.askedBy || "anonymous"} • {formatDate(question.createdAt)} •{" "}
          {question.views || 0} views
        </p>
        <div className="action-row">
          <button
            type="button"
            className="vote-button"
            onClick={handleQuestionUpvote}
            disabled={busy}
            aria-label="Upvote question"
            title="Upvote question"
          >
            ▲ {question.score}
          </button>
        </div>
      </article>

      {actionError && <p className="status error">{actionError}</p>}

      <section className="answers-panel">
        <h3>{question.answers.length} Answers</h3>
        <div className="answer-list">
          {question.answers.map((answer) => (
            <article key={answer.id} className="answer-card">
              <p>{answer.body}</p>
              <p className="question-date">
                by {answer.author} • {formatDate(answer.createdAt)}
              </p>
              <div className="action-row">
                <button
                  type="button"
                  className="vote-button"
                  onClick={() => handleAnswerUpvote(answer.id)}
                  disabled={busy}
                  aria-label="Upvote answer"
                  title="Upvote answer"
                >
                  ▲ {answer.score}
                </button>
                <button
                  type="button"
                  className="reply-toggle"
                  onClick={() => {
                    setActionError("");
                    setReplyAuthor("");
                    setReplyBody("");
                    setReplyModalAnswerId(answer.id);
                  }}
                >
                  Reply
                </button>
              </div>

              <div className="reply-list">
                {(answer.replies || []).map((reply) => (
                  <article key={reply.id} className="reply-card">
                    <p>{reply.body}</p>
                    <p className="question-date">
                      by {reply.author} • {formatDate(reply.createdAt)}
                    </p>
                    <div className="action-row">
                      <button
                        type="button"
                        className="vote-button"
                        onClick={() => handleReplyUpvote(answer.id, reply.id)}
                        disabled={busy}
                        aria-label="Upvote reply"
                        title="Upvote reply"
                      >
                        ▲ {reply.score}
                      </button>
                    </div>
                  </article>
                ))}
              </div>

            </article>
          ))}
        </div>
      </section>

      <section className="answer-form-wrap">
        <h3>Your Answer</h3>
        <button
          type="button"
          onClick={() => {
            setActionError("");
            setAnswerModalOpen(true);
          }}
        >
          Post Answer
        </button>
      </section>

      {answerModalOpen && (
        <div className="modal-backdrop" onClick={() => !postingAnswer && setAnswerModalOpen(false)}>
          <section className="modal-card" onClick={(event) => event.stopPropagation()}>
            <header className="modal-header">
              <h3>Post Your Answer</h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => !postingAnswer && setAnswerModalOpen(false)}
                disabled={postingAnswer}
              >
                Close
              </button>
            </header>
            <form className="inline-form" onSubmit={handlePostAnswer}>
              <input
                type="text"
                placeholder="Your name (optional)"
                value={answerAuthor}
                onChange={(event) => setAnswerAuthor(event.target.value)}
              />
              <textarea
                placeholder="Write your answer..."
                value={answerBody}
                onChange={(event) => setAnswerBody(event.target.value)}
                required
              />
              <button type="submit" disabled={postingAnswer}>
                {postingAnswer ? "Posting..." : "Post Answer"}
              </button>
            </form>
          </section>
        </div>
      )}

      {replyModalAnswerId !== null && replyTargetAnswer && (
        <div className="modal-backdrop" onClick={() => !postingReply && setReplyModalAnswerId(null)}>
          <section className="modal-card" onClick={(event) => event.stopPropagation()}>
            <header className="modal-header">
              <h3>Reply to {replyTargetAnswer.author}</h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => !postingReply && setReplyModalAnswerId(null)}
                disabled={postingReply}
              >
                Close
              </button>
            </header>
            <form className="inline-form" onSubmit={handlePostReply}>
              <input
                type="text"
                placeholder="Your name (optional)"
                value={replyAuthor}
                onChange={(event) => setReplyAuthor(event.target.value)}
              />
              <textarea
                placeholder="Write your reply..."
                value={replyBody}
                onChange={(event) => setReplyBody(event.target.value)}
                required
              />
              <button type="submit" disabled={postingReply}>
                {postingReply ? "Posting..." : "Post Reply"}
              </button>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
