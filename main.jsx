import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import FinTechArchitecture from "./gcp.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <FinTechArchitecture />
  </StrictMode>
);
