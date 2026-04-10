import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createQuestion } from "../api";
import Modal from "./Modal";

export default function AskQuestionPanel() {
  const navigate = useNavigate();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");
  const [author, setAuthor] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  function openModal() {
    setError("");
    setIsModalOpen(true);
  }

  function closeModal() {
    if (!isSubmitting) {
      setIsModalOpen(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const response = await createQuestion({ title, body, tags, author });
      const newQuestionId = response?.data?.id;
      if (newQuestionId) {
        setIsModalOpen(false);
        navigate(`/question/${newQuestionId}`);
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <section className="ask-card">
        <h2>Ask a Question</h2>
        <p>Post your question to get answers from others.</p>
        <button type="button" onClick={openModal}>
          Ask Question
        </button>
      </section>

      {isModalOpen && (
        <Modal title="Ask a Question" onClose={closeModal} disableClose={isSubmitting}>
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
            <button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Posting..." : "Post Question"}
            </button>
          </form>
          {error && <p className="status error">{error}</p>}
        </Modal>
      )}
    </>
  );
}
