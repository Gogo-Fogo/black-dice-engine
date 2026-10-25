import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { DiceLab } from "./DiceLab";
import "./styles.css";

// ?lab=dice opens the dice animation playground instead of the table.
const isDiceLab = new URLSearchParams(window.location.search).get("lab") === "dice";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{isDiceLab ? <DiceLab /> : <App />}</React.StrictMode>
);
