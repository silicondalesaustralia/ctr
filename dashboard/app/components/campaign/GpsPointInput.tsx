"use client";

import { useEffect, useState } from "react";
import HintLabel from "./HintLabel";
import { inputStyle } from "./shared";

interface Props {
  label: string;
  hint: string;
  placeholder: string;
  latitude: number | null;
  longitude: number | null;
  disabled: boolean;
  onChange: (latitude: number | null, longitude: number | null) => void;
}

function formatPoint(lat: number | null, lng: number | null): string {
  return lat !== null && lng !== null ? `${lat}, ${lng}` : "";
}

function parsePoint(text: string): { lat: number; lng: number } | null {
  const match = text.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/** "latitude, longitude" text box (paste from Google Maps); blank clears the point. */
export default function GpsPointInput({ label, hint, placeholder, latitude, longitude, disabled, onChange }: Props) {
  const [text, setText] = useState(formatPoint(latitude, longitude));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setText(formatPoint(latitude, longitude));
  }, [latitude, longitude]);

  function commit() {
    if (!text.trim()) {
      setError(null);
      onChange(null, null);
      return;
    }
    const point = parsePoint(text);
    if (!point) {
      setError("Paste as “latitude, longitude”, e.g. -35.0666, 138.8583");
      return;
    }
    setError(null);
    onChange(point.lat, point.lng);
  }

  return (
    <label>
      <HintLabel label={label} hint={hint} />
      <input
        style={inputStyle}
        placeholder={placeholder}
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
      />
      {error && <div style={{ color: "#bf4352", fontSize: 12 }}>{error}</div>}
    </label>
  );
}
