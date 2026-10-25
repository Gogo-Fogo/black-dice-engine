import React from "react";
import type { useNarration } from "./useNarration";

export function NarrationPanel({ narration }: { narration: ReturnType<typeof useNarration> }) {
  const { narrationText, speaking } = narration;
  return (
        narrationText ? (
          <div style={{
            background: "linear-gradient(135deg, #1a1209 0%, #2a1a0a 100%)",
            border: "1px solid #5a4a2a", borderRadius: 8, padding: "20px 24px",
            marginBottom: 12, fontSize: "1.35rem", lineHeight: 1.7,
            color: "#f0dcaf", fontStyle: "italic", position: "relative"
          }}>
            <div style={{ position: "absolute", top: 6, right: 10, fontSize: "0.7rem", color: "#8a7a4a" }}>
              {speaking ? "🔊 speaking..." : ""}
            </div>
            {narrationText}
          </div>
        ) : null
  );
}
