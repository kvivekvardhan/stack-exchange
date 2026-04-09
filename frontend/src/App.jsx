import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import HomePage from "./pages/HomePage";
import QuestionPage from "./pages/QuestionPage";
import QuestionsPage from "./pages/QuestionsPage";

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/questions" element={<QuestionsPage />} />
        <Route path="/question/:id" element={<QuestionPage />} />
      </Routes>
    </Layout>
  );
}
