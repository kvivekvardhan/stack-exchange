import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  getQuestion,
  postAnswer,
  postComment,
  upvoteAnswer,
  upvoteQuestion,
  upvoteComment
} from "../api";
import Modal from "../components/Modal";
import QueryInspector from "../components/QueryInspector";

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

function updateAnswerScore(question, answerId, score) {
  return {
    ...question,
    answers: question.answers.map((answer) =>
      answer.id === answerId ? { ...answer, score } : answer
    )
  };
}

function appendAnswer(question, answer) {
  return {
    ...question,
    answers: [...question.answers, answer]
  };
}

function appendCommentToAnswer(question, answerId, comment) {
  return {
    ...question,
    answers: question.answers.map((answer) => {
      if (answer.id !== answerId) {
        return answer;
      }
      return { ...answer, comments: [...(answer.comments || []), comment] };
    })
  };
}

function updateCommentScore(question, answerId, commentId, score) {
  return {
    ...question,
    answers: question.answers.map((answer) => {
      if (answer.id !== answerId) {
        return answer;
      }
      return {
        ...answer,
        comments: (answer.comments || []).map((comment) =>
          comment.id === commentId ? { ...comment, score } : comment
        )
      };
    })
  };
}

export default function QuestionPage() {
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [question, setQuestion] = useState(null);
  const [meta, setMeta] = useState(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  const [answerAuthor, setAnswerAuthor] = useState("");
  const [answerBody, setAnswerBody] = useState("");
  const [postingAnswer, setPostingAnswer] = useState(false);
  const [answerModalOpen, setAnswerModalOpen] = useState(false);

  const [commentAuthor, setCommentAuthor] = useState("");
  const [commentText, setCommentText] = useState("");
  const [postingComment, setPostingComment] = useState(false);
  const [commentModalAnswerId, setCommentModalAnswerId] = useState(null);
  const mutationAbortRef = useRef(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    async function loadQuestion() {
      setLoading(true);
      setError("");
      try {
        const response = await getQuestion(id, { signal: controller.signal });
        if (active) {
          setQuestion(response.data);
          setMeta(response.meta || null);
        }
      } catch (requestError) {
        if (requestError?.name === "AbortError") {
          return;
        }
        if (active) {
          setError(requestError.message);
          setMeta(null);
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
      controller.abort();
    };
  }, [id]);

  useEffect(() => {
    return () => {
      if (mutationAbortRef.current) {
        mutationAbortRef.current.abort();
      }
    };
  }, []);

  function startMutationSignal() {
    if (mutationAbortRef.current) {
      mutationAbortRef.current.abort();
    }
    const controller = new AbortController();
    mutationAbortRef.current = controller;
    return controller;
  }

  async function handleQuestionUpvote() {
    if (!question || busy) {
      return;
    }
    setBusy(true);
    setActionError("");
    const controller = startMutationSignal();
    try {
      const response = await upvoteQuestion(question.id, { signal: controller.signal });
      setQuestion((prev) => (prev ? { ...prev, score: response.data.score } : prev));
    } catch (requestError) {
      if (requestError?.name === "AbortError") {
        return;
      }
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
    const controller = startMutationSignal();
    try {
      const response = await postAnswer(
        question.id,
        { ownerDisplayName: answerAuthor, body: answerBody },
        { signal: controller.signal }
      );
      setQuestion((prev) => (prev ? appendAnswer(prev, response.data) : prev));
      setAnswerAuthor("");
      setAnswerBody("");
      setAnswerModalOpen(false);
    } catch (requestError) {
      if (requestError?.name === "AbortError") {
        return;
      }
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
    const controller = startMutationSignal();
    try {
      const response = await upvoteAnswer(question.id, answerId, { signal: controller.signal });
      setQuestion((prev) => (prev ? updateAnswerScore(prev, answerId, response.data.score) : prev));
    } catch (requestError) {
      if (requestError?.name === "AbortError") {
        return;
      }
      setActionError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function handlePostComment(event) {
    event.preventDefault();
    if (!question || postingComment || !commentModalAnswerId) {
      return;
    }

    const text = commentText.trim();
    const userDisplayName = commentAuthor.trim();
    if (!text) {
      return;
    }

    setPostingComment(true);
    setActionError("");
    const controller = startMutationSignal();
    try {
      const response = await postComment(
        question.id,
        commentModalAnswerId,
        { text, userDisplayName },
        { signal: controller.signal }
      );
      setQuestion((prev) =>
        prev ? appendCommentToAnswer(prev, commentModalAnswerId, response.data) : prev
      );
      setCommentAuthor("");
      setCommentText("");
      setCommentModalAnswerId(null);
    } catch (requestError) {
      if (requestError?.name === "AbortError") {
        return;
      }
      setActionError(requestError.message);
    } finally {
      setPostingComment(false);
    }
  }

  async function handleCommentUpvote(answerId, commentId) {
    if (!question || busy) {
      return;
    }
    setBusy(true);
    setActionError("");
    const controller = startMutationSignal();
    try {
      const response = await upvoteComment(question.id, answerId, commentId, {
        signal: controller.signal
      });
      setQuestion((prev) =>
        prev ? updateCommentScore(prev, answerId, commentId, response.data.score) : prev
      );
    } catch (requestError) {
      if (requestError?.name === "AbortError") {
        return;
      }
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

  const commentTargetAnswer =
    commentModalAnswerId !== null
      ? question.answers.find((answer) => answer.id === commentModalAnswerId) || null
      : null;

  return (
    <section className="question-detail">
      <p className="back-link-wrap">
        <Link to="/questions">Back to questions</Link>
      </p>

      <article className="detail-card">
        <h2>{question.title}</h2>
        <div className="detail-body" dangerouslySetInnerHTML={{ __html: question.body }} />
        <div className="tag-row">
          {question.tags.map((tag) => (
            <span key={tag} className="tag-chip">
              {tag}
            </span>
          ))}
        </div>
        <p className="question-date">
          asked by {question.ownerDisplayName || "anonymous"} • {formatDate(question.creationDate)} •{" "}
          {question.viewCount || 0} views
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
              <div className="answer-body" dangerouslySetInnerHTML={{ __html: answer.body }} />
              <p className="question-date">
                by {answer.ownerDisplayName || "anonymous"} • {formatDate(answer.creationDate)}
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
                    setCommentAuthor("");
                    setCommentText("");
                    setCommentModalAnswerId(answer.id);
                  }}
                >
                  Comment
                </button>
              </div>

              <div className="reply-list">
                {(answer.comments || []).map((comment) => (
                  <article key={comment.id} className="reply-card">
                    <div className="comment-body" dangerouslySetInnerHTML={{ __html: comment.text }} />
                    <p className="question-date">
                      by {comment.userDisplayName || "anonymous"} • {formatDate(comment.creationDate)}
                    </p>
                    <div className="action-row">
                      <button
                        type="button"
                        className="vote-button"
                        onClick={() => handleCommentUpvote(answer.id, comment.id)}
                        disabled={busy}
                        aria-label="Upvote comment"
                        title="Upvote comment"
                      >
                        ▲ {comment.score}
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
        <Modal
          title="Post Your Answer"
          onClose={() => setAnswerModalOpen(false)}
          disableClose={postingAnswer}
        >
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
        </Modal>
      )}

      {commentModalAnswerId !== null && commentTargetAnswer && (
        <Modal
          title={`Comment on ${commentTargetAnswer.ownerDisplayName || "answer"}`}
          onClose={() => setCommentModalAnswerId(null)}
          disableClose={postingComment}
        >
          <form className="inline-form" onSubmit={handlePostComment}>
            <input
              type="text"
              placeholder="Your name (optional)"
              value={commentAuthor}
              onChange={(event) => setCommentAuthor(event.target.value)}
            />
            <textarea
              placeholder="Write your comment..."
              value={commentText}
              onChange={(event) => setCommentText(event.target.value)}
              required
            />
            <button type="submit" disabled={postingComment}>
              {postingComment ? "Posting..." : "Post Comment"}
            </button>
          </form>
        </Modal>
      )}

      {meta?.inspector && meta.inspector.length > 0 && (
        <QueryInspector title="Question Queries" inspector={meta.inspector} />
      )}
    </section>
  );
}
