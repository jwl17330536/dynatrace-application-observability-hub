import { Page } from "@dynatrace/strato-components-preview/layouts";
import React from "react";
import { Route, Routes, Navigate } from "react-router-dom";
import { Home } from "@pages/Home";
import { Setup } from "@pages/Setup";
import { Overview } from "@pages/Overview";
import { Summary } from "@pages/Summary";

export const App = () => {
  return (
    <Page>
      <Page.Main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/setup" element={<Setup />} />
          <Route path="/summary" element={<Summary />} />
          <Route path="/overview/:sourceId" element={<Overview />} />
          <Route path="/overview" element={<Navigate to="/summary" />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Page.Main>
    </Page>
  );
};
