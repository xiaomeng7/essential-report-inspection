/**
 * AddressAutocomplete: Google Places autocomplete for Australian addresses only.
 * User must select from suggestions; free-text input is not allowed.
 */
import { useState, useRef, useCallback, useEffect } from "react";

export type AddressComponents = {
  street_number?: string;
  route?: string;
  suburb?: string;
  state?: string;
  postcode?: string;
  country?: string;
};

export type AddressGeo = {
  lat: number;
  lng: number;
};

export type StructuredAddress = {
  property_address: string;
  address_place_id: string;
  address_components: AddressComponents;
  address_geo?: AddressGeo;
};

type Suggestion = { text: string; placeId: string };

type Props = {
  value: StructuredAddress | null;
  onChange: (addr: StructuredAddress | null) => void;
  required?: boolean;
  disabled?: boolean;
  error?: string;
};

const DEBOUNCE_MS = 300;
const MAX_SUGGESTIONS = 8;

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

export function AddressAutocomplete({ value, onChange, required = true, disabled, error }: Props) {
  const [inputText, setInputText] = useState(value?.property_address ?? "");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const debouncedInput = useDebounce(inputText, DEBOUNCE_MS);

  useEffect(() => {
    if (value?.property_address) {
      setInputText(value.property_address);
    } else {
      setInputText("");
    }
  }, [value?.property_address]);

  useEffect(() => {
    if (!focused || !debouncedInput.trim() || debouncedInput.length < 2) {
      setSuggestions([]);
      setLoading(false);
      setApiError(null);
      return;
    }
    setLoading(true);
    setApiError(null);
    fetch(`/api/addressSuggest?q=${encodeURIComponent(debouncedInput.trim())}`)
      .then((r) => {
        return r.json().then((data: { suggestions?: Suggestion[]; error?: string; message?: string }) => {
          if (!r.ok) {
            const raw = data.error || data.message || "Address suggestions unavailable.";
            const msg =
              raw === "Address suggestions not configured"
                ? "地址建议未配置：请设置 GOOGLE_MAPS_API_KEY（Netlify 或 .env）。"
                : raw;
            setApiError(msg);
            setSuggestions([]);
            return;
          }
          if (data.error) {
            setApiError(
              data.error === "Address suggestions not configured"
                ? "地址建议未配置：请设置 GOOGLE_MAPS_API_KEY（Netlify 或 .env）。"
                : data.error
            );
            setSuggestions([]);
            return;
          }
          const list = data.suggestions ?? [];
          setSuggestions(list.slice(0, MAX_SUGGESTIONS));
        });
      })
      .catch(() => {
        setApiError("无法连接地址服务。请用 netlify dev 启动本地，并配置 GOOGLE_MAPS_API_KEY。");
        setSuggestions([]);
      })
      .finally(() => setLoading(false));
  }, [debouncedInput, focused]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchDetails = useCallback((placeId: string) => {
    return fetch(`/api/addressDetails?place_id=${encodeURIComponent(placeId)}`).then((r) => r.json());
  }, []);

  const selectSuggestion = useCallback(
    (s: Suggestion) => {
      setOpen(false);
      setSuggestions([]);
      setLoading(true);
      fetchDetails(s.placeId)
        .then((data: { formatted_address?: string; components?: AddressComponents; geo?: { lat: number; lng: number } }) => {
          const formatted = data.formatted_address ?? s.text;
          const components = data.components ?? {};
          onChange({
            property_address: formatted,
            address_place_id: s.placeId,
            address_components: components,
            address_geo: data.geo,
          });
          setInputText(formatted);
        })
        .catch(() => {
          onChange(null);
          setInputText("");
        })
        .finally(() => setLoading(false));
    },
    [fetchDetails, onChange]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setInputText(v);
    if (!v.trim()) {
      onChange(null);
      setSuggestions([]);
    }
    setOpen(true);
  };

  const handleFocus = () => {
    setFocused(true);
    if (inputText.length >= 2 && suggestions.length > 0) setOpen(true);
  };

  const handleBlur = () => {
    setFocused(false);
    // Don't clear immediately; let click on suggestion fire first
    setTimeout(() => setOpen(false), 200);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (suggestions.length > 0) {
        selectSuggestion(suggestions[0]);
      }
    }
  };

  const comp = value?.address_components;
  const preview = comp
    ? [comp.suburb, comp.state, comp.postcode].filter(Boolean).join(", ")
    : "";

  return (
    <div ref={containerRef} className="address-autocomplete" style={{ position: "relative" }}>
      <label style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>
        Property Address {required && <span style={{ color: "red" }}>*</span>}
      </label>
      <input
        type="text"
        value={inputText}
        onChange={handleInputChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder="Start typing address (Australia only)..."
        disabled={disabled}
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={open && suggestions.length > 0}
        style={{
          width: "100%",
          padding: "10px 12px",
          fontSize: 14,
          border: error ? "1px solid #c62828" : "1px solid #ccc",
          borderRadius: 4,
          outline: "none",
        }}
      />
      {loading && (
        <span style={{ position: "absolute", right: 12, top: 38, fontSize: 12, color: "#666" }}>
          Loading...
        </span>
      )}
      {open && suggestions.length > 0 && (
        <ul
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: "100%",
            margin: 0,
            padding: 0,
            listStyle: "none",
            background: "#fff",
            border: "1px solid #ccc",
            borderTop: "none",
            borderRadius: "0 0 4px 4px",
            maxHeight: 240,
            overflowY: "auto",
            zIndex: 1000,
            boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
          }}
        >
          {suggestions.map((s, i) => (
            <li
              key={s.placeId}
              onClick={() => selectSuggestion(s)}
              onMouseDown={(e) => e.preventDefault()}
              style={{
                padding: "10px 12px",
                cursor: "pointer",
                borderBottom: i < suggestions.length - 1 ? "1px solid #eee" : "none",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#f5f5f5";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#fff";
              }}
            >
              {s.text}
            </li>
          ))}
        </ul>
      )}
      {preview && (
        <div
          style={{
            marginTop: 6,
            fontSize: 12,
            color: "#666",
          }}
        >
          Suburb / State / Postcode: {preview}
        </div>
      )}
      {apiError && (
        <p style={{ color: "#c62828", fontSize: 12, marginTop: 4 }}>
          {apiError}
        </p>
      )}
      {error && (
        <p className="validation-msg" style={{ color: "#c62828", fontSize: 12, marginTop: 4 }}>
          {error}
        </p>
      )}
      {required && !value?.address_place_id && inputText && !apiError && (
        <p style={{ color: "#f57c00", fontSize: 12, marginTop: 4 }}>
          Please select a valid address from suggestions.
        </p>
      )}
    </div>
  );
}
