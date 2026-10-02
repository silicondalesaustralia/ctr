"use client";

import CountrySelect from "../CountrySelect";
import type { CountryOption } from "../../../lib/geo";
import { inputStyle, labelStyle } from "./shared";

interface CampaignCountryFieldProps {
  countries: CountryOption[];
  value: string;
  onChange: (code: string) => void;
}

export default function CampaignCountryField({ countries, value, onChange }: CampaignCountryFieldProps) {
  return (
    <label>
      <span style={labelStyle}>Country (identities, proxies, Google gl/hl)</span>
      <CountrySelect countries={countries} value={value} onChange={onChange} style={inputStyle} />
    </label>
  );
}
