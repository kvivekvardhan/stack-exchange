import QuestionFeed from "../components/QuestionFeed";
import AskQuestionPanel from "../components/AskQuestionPanel";

export default function HomePage() {
  return (
    <section className="home-stack">
      <AskQuestionPanel />

      <QuestionFeed
        title="Top Questions"
        subtitle="Search and browse the top-scoring community questions."
        previewLimit={10}
      />
    </section>
  );
}
