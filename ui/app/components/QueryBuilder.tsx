import React, { useState } from "react";
import { theme } from "@utils/themeStyles";

interface QueryBuilderProps {
  query: string;
}

/**
 * QueryBuilder Component - Debug/test tool for queries
 * Shows query and allows copying/testing
 */
export const QueryBuilder: React.FC<QueryBuilderProps> = ({ query }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(query);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ padding: "10px", backgroundColor: theme.surfaceSubtle, borderRadius: "4px" }}>
      <div style={{ marginBottom: "10px" }}>
        <strong>Query:</strong>
        <button
          onClick={handleCopy}
          style={{
            marginLeft: "10px",
            padding: "5px 10px",
            backgroundColor: theme.primary,
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre style={{ overflow: "auto", fontSize: "12px" }}>{query}</pre>
    </div>
  );
};
