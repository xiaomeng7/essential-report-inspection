# Text Sanitisation Helper (Design Notes)

## Why you’re seeing “weird characters”
They typically come from:
- Non‑breaking spaces (\u00A0)
- Hidden control characters copied from Word/PDF (\u000b, \u000c, etc.)
- Mixed Windows/Mac line endings (\r\n)

These characters can appear in Docx output as boxes, strange symbols, or broken spacing.

## Minimal Safe Sanitiser Rules
Apply this to **every** string you send into docxtemplater:

1) Convert NBSP to regular spaces  
2) Remove control characters except newline and tab  
3) Normalise line endings to \n  
4) Trim trailing whitespace on each line (optional)

## Recommended JS Implementation (Cursor should add)
- Input: unknown
- Output: string

Edge cases:
- null/undefined → ""
- numbers/booleans → String(x)
- arrays → join with "\n"
- objects → JSON.stringify(x) (only for debug fields)
