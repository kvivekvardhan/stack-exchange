import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import HomePage from "./pages/HomePage";
import BenchmarkPage from "./pages/BenchmarkPage";
import QuestionPage from "./pages/QuestionPage";
import QuestionsPage from "./pages/QuestionsPage";
import TagsPage from "./pages/TagsPage";
import { EngineProvider } from "./EngineContext";

export default function App() {
  return (
    <EngineProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/questions" element={<QuestionsPage />} />
          <Route path="/tags" element={<TagsPage />} />
          <Route path="/benchmark" element={<BenchmarkPage />} />
          <Route path="/question/:id" element={<QuestionPage />} />
        </Routes>
      </Layout>
    </EngineProvider>
  );
}
