import { Page } from "@dynatrace/strato-components-preview/layouts";
import React from "react";
import { Route, Routes, Navigate } from "react-router-dom";
import { Home } from "@pages/Home";
import { Setup } from "@pages/Setup";
import { Overview } from "@pages/Overview";
import { Summary } from "@pages/Summary";
import { APP_BUILD_VERSION } from "@constants/buildInfo";

export const App = () => {
  return (
    <Page>
      <Page.Main>
        <div
          style={{
            position: "fixed",
            top: "10px",
            right: "12px",
            zIndex: 1000,
            border: "1px solid #cfd7eb",
            borderRadius: "999px",
            padding: "3px 10px",
            backgroundColor: "#f3f7ff",
            color: "#2e3a63",
            fontSize: "11px",
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          v{APP_BUILD_VERSION}
        </div>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/setup" element={<Setup />} />
          <Route path="/summary" element={<Summary />} />
          <Route path="/overview" element={<Overview />} />
          <Route path="/overview/:sourceId" element={<Overview />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Page.Main>
    </Page>
  );
};
