import QuestionFeed from "../components/QuestionFeed";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createQuestion } from "../api";

export default function QuestionsPage() {
  const navigate = useNavigate();
  const [askModalOpen, setAskModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");
  const [author, setAuthor] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    if (posting) {
      return;
    }

    setPosting(true);
    setError("");
    try {
      const response = await createQuestion({ title, body, tags, author });
      const newId = response?.data?.id;
      if (newId) {
        setAskModalOpen(false);
        navigate(`/question/${newId}`);
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setPosting(false);
    }
  }

  return (
    <section className="home-stack">
      <section className="ask-card">
        <h2>Ask a Question</h2>
        <p>Post your question to get answers from others.</p>
        <button
          type="button"
          onClick={() => {
            setError("");
            setAskModalOpen(true);
          }}
        >
          Ask Question
        </button>
      </section>

      <QuestionFeed
        title="All Questions"
        subtitle="Find questions by keyword and explore full results."
        enableSorting
        defaultSort="time_desc"
      />

      {askModalOpen && (
        <div className="modal-backdrop" onClick={() => !posting && setAskModalOpen(false)}>
          <section className="modal-card" onClick={(event) => event.stopPropagation()}>
            <header className="modal-header">
              <h3>Ask a Question</h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => !posting && setAskModalOpen(false)}
                disabled={posting}
              >
                Close
              </button>
            </header>
            <form className="inline-form" onSubmit={handleSubmit}>
              <input
                type="text"
                placeholder="Your name (optional)"
                value={author}
                onChange={(event) => setAuthor(event.target.value)}
              />
              <input
                type="text"
                placeholder="Question title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
              />
              <textarea
                placeholder="Question details"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                required
              />
              <input
                type="text"
                placeholder="Tags (comma separated, e.g. reactjs,api)"
                value={tags}
                onChange={(event) => setTags(event.target.value)}
              />
              <button type="submit" disabled={posting}>
                {posting ? "Posting..." : "Post Question"}
              </button>
            </form>
            {error && <p className="status error">{error}</p>}
          </section>
        </div>
      )}
    </section>
  );
}
