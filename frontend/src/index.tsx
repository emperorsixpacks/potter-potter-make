/* eslint-disable import/first */
import { Buffer } from "buffer";
(globalThis as any).Buffer = Buffer;
(window as any).Buffer = Buffer;

// 3️⃣ Other imports come AFTER
import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import reportWebVitals from "./reportWebVitals";

// 4️⃣ Render
const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

reportWebVitals();
