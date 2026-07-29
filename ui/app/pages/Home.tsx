import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useMappingConfig } from "@hooks/useMappingConfig";

/**
 * Home Page - Entry point
 * Redirects to Setup if no lookups exist, otherwise to Overview
 */
export const Home: React.FC = () => {
  const navigate = useNavigate();
  const { config, isLoading, error } = useMappingConfig();

  useEffect(() => {
    if (!isLoading) {
      if (!config) {
        // No configuration found - go to setup
        navigate("/setup");
      } else {
        // Configuration exists - go to summary
        navigate("/summary");
      }
    }
  }, [isLoading, config, navigate]);

  return (
    <div style={{ padding: "20px" }}>
      {isLoading && <p>Loading configuration...</p>}
      {error && <p style={{ color: "red" }}>Error: {error}</p>}
    </div>
  );
};
