import { createContext, useContext, useMemo, useState } from "react";

const EngineContext = createContext(null);

const ENGINE_KEY = "stackfast.engine";
const INSPECT_KEY = "stackfast.inspect";

function readBoolean(key, fallback = false) {
  if (typeof window === "undefined") {
    return fallback;
  }
  const raw = window.localStorage.getItem(key);
  if (raw === null) {
    return fallback;
  }
  return raw === "true";
}

function readEngine() {
  if (typeof window === "undefined") {
    return "baseline";
  }
  return window.localStorage.getItem(ENGINE_KEY) || "baseline";
}

export function EngineProvider({ children }) {
  const [engine, setEngine] = useState(readEngine);
  const [inspect, setInspect] = useState(() => readBoolean(INSPECT_KEY, false));

  function handleEngineChange(next) {
    setEngine(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(ENGINE_KEY, next);
    }
  }

  function handleInspectChange(next) {
    setInspect(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(INSPECT_KEY, String(next));
    }
  }

  const value = useMemo(
    () => ({
      engine,
      inspect,
      setEngine: handleEngineChange,
      setInspect: handleInspectChange
    }),
    [engine, inspect]
  );

  return <EngineContext.Provider value={value}>{children}</EngineContext.Provider>;
}

export function useEngineSettings() {
  const context = useContext(EngineContext);
  if (!context) {
    throw new Error("useEngineSettings must be used within EngineProvider");
  }
  return context;
}

export function getStoredEngine() {
  return readEngine();
}

export function getStoredInspect() {
  return readBoolean(INSPECT_KEY, false);
}
