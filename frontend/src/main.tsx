import { createRoot } from "react-dom/client";
import App from "./App";
import PwaUpdate from "./PwaUpdate";

createRoot(document.getElementById("root")!).render(
  <>
    <App />
    <PwaUpdate />
  </>,
);
