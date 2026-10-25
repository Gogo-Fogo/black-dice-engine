import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { StageApp } from "./stage";
import "./styles.css";

// ?view=stage renders only the couch-facing table display, for a second window on the TV.
const isStageView = new URLSearchParams(window.location.search).get("view") === "stage";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{isStageView ? <StageApp /> : <App />}</React.StrictMode>
);
