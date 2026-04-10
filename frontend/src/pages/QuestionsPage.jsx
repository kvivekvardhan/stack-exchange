import QuestionFeed from "../components/QuestionFeed";
import AskQuestionPanel from "../components/AskQuestionPanel";

export default function QuestionsPage() {
  return (
    <section className="home-stack">
      <AskQuestionPanel />

      <QuestionFeed
        title="All Questions"
        subtitle="Find questions by keyword and explore full results."
        enableSorting
        defaultSort="time_desc"
      />
    </section>
  );
}
