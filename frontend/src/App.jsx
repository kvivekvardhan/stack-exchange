import { useState } from "react";
import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import BenchmarkPage from "./pages/BenchmarkPage";
import HomePage from "./pages/HomePage";
import QuestionPage from "./pages/QuestionPage";
import TagsPage from "./pages/TagsPage";

export default function App() {
  const [engine, setEngine] = useState("baseline");

  return (
    <Layout engine={engine} onEngineChange={setEngine}>
      <Routes>
        <Route path="/" element={<HomePage engine={engine} />} />
        <Route path="/question/:id" element={<QuestionPage engine={engine} />} />
        <Route path="/tags" element={<TagsPage />} />
        <Route path="/benchmark" element={<BenchmarkPage />} />
      </Routes>
    </Layout>
  );
}
