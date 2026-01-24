SPEC.md

Project Name

Essential Electrical Property Health Inspection – Technician Web App

⸻

1. Project Goal

Build a mobile-first technician inspection web app that:
	•	Allows technicians to complete an on-site electrical health inspection
	•	Uses section-based forms (5–8 questions per section) for efficiency
	•	Supports conditional sections (auto skip) based on earlier answers
	•	Allows skipping any question with a mandatory reason
	•	Automatically submits inspection data to backend
	•	Backend generates a draft internal report for office review
	•	Office manually reviews → AI polishes language → final report sent to customer

This system is designed for decision support, not compliance judgement.

⸻

2. Target Users
	•	Primary: Field Technicians (mobile phone usage on-site)
	•	Secondary: Office staff (internal review & customer communication)

⸻

3. High-Level Architecture
	•	Frontend: Static web app (HTML/CSS/JS or React/Vue)
	•	Backend: Netlify Functions (serverless API)
	•	Storage:
	•	Raw inspection JSON (blob / file storage)
	•	Optional index table (Postgres / SQLite)
	•	Rules Engine: YAML-based (Safety / Urgency / Liability)
	•	Deployment: Netlify

⸻

4. Frontend – Technician Inspection App

4.1 General Requirements
	•	Mobile-first responsive design
	•	Section-based navigation
	•	Top progress bar (percentage or section count)
	•	Buttons per section:
	•	Back
	•	Save Draft
	•	Next
	•	Final section has Submit Inspection

Technician must be able to:
	•	Go back and edit any previous section
	•	Change answers without losing unrelated data
	•	See validation errors clearly

⸻

4.2 Section Structure (5–8 Questions per Section)

Section 0 – Start / Context
	•	Job address
	•	Client type (Owner / Landlord / Property Manager)
	•	Occupancy (Vacant / Tenanted / Owner-occupied)
	•	Property type (House / Unit / Townhouse)
	•	Vulnerable occupants present (multi-select)
	•	Reported issues (multi-select)

⸻

Section 1 – Access & Limitations
	•	Switchboard accessible? (Yes/No)
	•	Roof space accessible? (Yes/No)
	•	Underfloor accessible? (Yes/No)
	•	If No → mandatory reason (dropdown)
	•	Mains power available for testing? (Yes/No)
	•	Photos allowed? (Yes/No)
	•	Notes (optional)

⸻

Section 2 – Switchboard: Overview
	•	Overall condition (Good / Fair / Poor)
	•	Signs of overheating? (Yes / No / Unsure)
	•	Burn marks or carbon tracking? (Yes / No / Unsure)
	•	Water ingress or moisture signs? (Yes / No / Unsure)
	•	Asbestos suspected? (Yes / No / Unsure)
	•	Protection types present (multi-select)
	•	Photo IDs / Notes

⸻

Section 3 – Switchboard: Capacity & Labelling
	•	Board at capacity? (Yes / No / Unsure)
	•	Spare ways available? (Yes / No / Unsure)
	•	Circuit schedule present? (Yes / No)
	•	Labelling quality (Good / OK / Poor)
	•	Non-standard or DIY work observed? (Yes / No / Unsure)
	•	Notes

⸻

Section 4 – Earthing & MEN
	•	MEN link visible / confirmed? (Yes / No / Unsure)
	•	Main earth conductor appears intact? (Yes / No / Unsure)
	•	Earth electrode present? (Yes / No / Unsure)
	•	Earth resistance measured? (Yes / No)
	•	If Yes → Earth resistance value (Ω)
	•	Bonding present (Water / Gas / N/A / Unsure)
	•	Photo IDs / Notes

⸻

Section 5 – RCD Tests: Summary
	•	RCD testing performed? (Yes / No)
	•	If No → mandatory reason
	•	Total devices tested (number)
	•	Total pass (number)
	•	Total fail (number)
	•	Nuisance trip or borderline behaviour? (Yes / No / Notes)
	•	Tester model / serial (optional)

⸻

Section 6 – RCD Tests: Exceptions
	•	Add exception (repeatable):
	•	Location / device ID
	•	Test current (mA)
	•	Trip time (ms)
	•	Result (Pass / Fail)
	•	Notes / Photo IDs
	•	“No exceptions” checkbox
	•	Notes

⸻

Section 7 – GPO & Lighting: Summary
	•	GPO testing performed? (Yes / No)
	•	Total outlets tested
	•	Polarity pass count
	•	Earth present pass count
	•	RCD protection confirmed count
	•	Any warm / loose / damaged outlets? (Yes / No)
	•	Lighting issues observed? (None / Flicker / Heat damage / Other)
	•	Notes

⸻

Section 8 – GPO & Lighting: Exceptions
	•	Add exception (repeatable):
	•	Location
	•	Issue type (dropdown)
	•	Notes
	•	Photo IDs
	•	“No exceptions” checkbox
	•	Notes

⸻

Section 9 – Solar / Battery / EV (Conditional)
Gate questions:
	•	Has solar PV? (Yes / No)
	•	Has battery? (Yes / No)
	•	Has EV charger? (Yes / No)

If all No:
	•	Section auto-skipped (not_applicable)

If any Yes:
	•	Issues observed? (Yes / No)
	•	Add exception list (repeatable)
	•	Notes / Photo IDs

⸻

Section 10 – Sign-off
	•	Technician name
	•	Licence number (optional)
	•	Inspection completed? (Yes)
	•	Customer informed of immediate concerns on site? (Yes / No)
	•	Notes to office (internal only)
	•	Submit Inspection

⸻

5. Conditional Logic (Skip & Clear Rules)
	•	Sections gated by Yes/No questions (e.g. Solar)
	•	Changing a gate from Yes → No:
	•	Clears dependent section data
	•	Prompts user for confirmation
	•	Individual questions can be skipped:
	•	Skip requires skip_reason
	•	Optional skip_note

⸻

6. Data Model (High Level)

Each section:
	•	status: completed / partial / skipped
	•	skip_reason (if skipped)
	•	answers (field-level with status + value)

Each answer:
	•	value
	•	status: answered / skipped
	•	skip_reason (if skipped)
	•	evidence (photo IDs / notes)

⸻

7. Backend – Submission & Processing

7.1 Submit Endpoint

POST /api/submitInspection
	•	Accepts full inspection JSON
	•	Returns:

  {
  "inspection_id": "EH-YYYY-XXXX",
  "status": "accepted",
  "review_url": "/review/EH-YYYY-XXXX"
}

7.2 Backend Processing (Async)
	•	Persist raw inspection JSON
	•	Evaluate findings using rules.yml
	•	Generate:
	•	Findings list
	•	Priority buckets (Immediate / 0–3 months / Plan)
	•	Limitations (from skipped items)
	•	Produce draft report (HTML or PDF)
	•	Notify office via email (inspection ID + summary)

⸻

8. Internal Review & AI Polish
	•	Internal review page (office-only)
	•	Display draft report (read-only)
	•	Allow:
	•	Confirmation
	•	Optional office notes
	•	AI language polish (tone only, no data changes)
	•	Generate final PDF
	•	Send to customer or export

⸻

9. Non-Goals (Explicitly Out of Scope)
	•	Compliance certification
	•	Legal judgement
	•	Automatic customer-facing recommendations
	•	In-field PDF generation

⸻

10. Success Criteria (Acceptance Checklist)
	•	Technician can complete inspection in <20 minutes
	•	Sections auto-skip correctly
	•	Back navigation works without data corruption
	•	Skipped answers always include reasons
	•	Submission returns inspection ID
	•	Backend produces a draft report
	•	Office can review and approve report

⸻

End of SPEC.md