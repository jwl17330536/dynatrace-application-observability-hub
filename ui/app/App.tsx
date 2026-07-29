import { Page } from "@dynatrace/strato-components-preview/layouts";
import React from "react";
import { Route, Routes, Navigate } from "react-router-dom";
import { Home } from "@pages/Home";
import { Setup } from "@pages/Setup";
import { Overview } from "@pages/Overview";

export const App = () => {
  return (
    <Page>
      <Page.Main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/setup" element={<Setup />} />
          <Route path="/overview" element={<Overview />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Page.Main>
    </Page>
  );
};
