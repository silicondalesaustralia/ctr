"use client";

import { useState } from "react";
import { inputStyle, secondaryButtonStyle } from "./shared";

interface Props {
  existing: string[];
  disabled: boolean;
  onAdd: (text: string) => void;
}

export default function AddQueryForm({ existing, disabled, onAdd }: Props) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const value = text.replace(/\s+/g, " ").trim();
    if (!value) return;
    if (existing.some((row) => row.toLowerCase() === value.toLowerCase())) {
      setError(`"${value}" is already in the list`);
      return;
    }
    onAdd(value);
    setText("");
    setError(null);
  }

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", gap: 8, maxWidth: 520 }}>
        <input
          style={{ ...inputStyle, padding: "8px 10px" }}
          value={text}
          placeholder="Add a keyword, e.g. womens full seat breeches"
          disabled={disabled}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button
          type="button"
          onClick={submit}
          disabled={disabled || !text.trim()}
          style={secondaryButtonStyle(disabled || !text.trim())}
        >
          Add
        </button>
      </div>
      {error && <p style={{ color: "#bf4352", fontSize: 13, margin: "6px 0 0" }}>{error}</p>}
    </div>
  );
}
