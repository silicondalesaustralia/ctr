"use client";

import type { DevicePoolStatus, DeviceTargetInputs, PoolDevice } from "../../lib/warm-pool";
import { cellStyle, inputStyle } from "./campaign/shared";

interface WarmPoolRowProps {
  city: string;
  targets: DeviceTargetInputs | undefined;
  status: Record<PoolDevice, DevicePoolStatus> | undefined;
  mobileAvailable: boolean;
  onChange: (device: PoolDevice, value: string) => void;
}

function split(status: WarmPoolRowProps["status"], field: "warming" | "eligible"): string {
  if (!status) return "—";
  return `${status.desktop[field]} / ${status.mobile[field]}`;
}

export default function WarmPoolRow({ city, targets, status, mobileAvailable, onChange }: WarmPoolRowProps) {
  const input = (device: PoolDevice, disabled: boolean) => (
    <input
      style={{ ...inputStyle, width: 80, padding: "6px 8px" }}
      type="number"
      min={0}
      max={50}
      disabled={disabled}
      aria-label={`${city} ${device} target`}
      value={targets?.[device] ?? ""}
      placeholder="0"
      onChange={(e) => onChange(device, e.target.value)}
    />
  );

  return (
    <tr>
      <td style={cellStyle}>{city}</td>
      <td style={cellStyle}>{input("desktop", false)}</td>
      <td style={cellStyle}>{input("mobile", !mobileAvailable)}</td>
      <td style={cellStyle}>{split(status, "warming")}</td>
      <td style={cellStyle}>{split(status, "eligible")}</td>
    </tr>
  );
}
