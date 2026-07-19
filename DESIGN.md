---
name: Health Log
description: A calm, rigorous personal health record — warm paper, structured data you can actually analyze.
colors:
  canvas: "#F5F1EB"
  surface: "#FFFFFF"
  ink: "#1C1A17"
  ink-muted: "#6E6A62"
  ink-faint: "#B2ADA4"
  accent: "#3D6B4F"
  accent-deep: "#2F5340"
  accent-tint: "#E3EFE8"
  amber: "#C4752A"
  amber-tint: "#FBF0E4"
  red: "#B83A3A"
  red-tint: "#FAEAEA"
  border: "#00000014"
  body-fill: "#EAE5DC"
  body-stroke: "#A09890"
typography:
  numeral:
    fontFamily: "Lora, Georgia, serif"
    fontSize: "2rem"
    fontWeight: 600
    lineHeight: 1
  display:
    fontFamily: "Lora, Georgia, serif"
    fontSize: "1.375rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.3px"
  headline:
    fontFamily: "Lora, Georgia, serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.25
  earned:
    fontFamily: "Lora, Georgia, serif"
    fontSize: "1.0625rem"
    fontWeight: 600
    lineHeight: 1.2
  title:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 500
    lineHeight: 1.35
  body:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  meta:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.5
  caption:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "0.625rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.07em"
rounded:
  sm: "8px"
  md: "12px"
  lg: "14px"
  pill: "20px"
  sheet: "22px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "14px"
  lg: "20px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "12px 32px"
  button-primary-hover:
    backgroundColor: "{colors.accent-deep}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "12px 32px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.md}"
    padding: "12px"
  input:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "12px 14px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "14px"
  pill:
    backgroundColor: "{colors.accent-tint}"
    textColor: "{colors.accent}"
    rounded: "{rounded.pill}"
    padding: "3px 9px"
---

# Design System: Health Log

## 1. Overview

**Creative North Star: "The Lab Notebook"**

Health Log is a scientist's personal notebook rendered for the phone: warm paper underfoot, hairline rules keeping everything in order, and data captured in a form you can reason over months later. It is calm but rigorous — reassuring enough to return to every single day, honest enough that a clinician can open it cold and trust what they read. The warmth is deliberate: a cream canvas and a single grounded forest green, not the cold blue-white of hospital software. Nothing here shouts. The notebook's authority comes from consistency and legibility, not decoration.

The system runs on one accent doing honest work. A single forest green marks every primary action, the current selection, and the mild end of the severity scale. Amber and red enter only when the data itself turns serious. Type is a two-voice pairing — Lora, a warm serif, for the few headings and moments that deserve a human hand; DM Sans for every label, field, number, and row. The layout lives inside a fixed 430px column, because this is a tool held in one hand, not a responsive marketing page.

This system explicitly rejects the two failure modes its owner named. It is **never boring**: dull-but-functional is treated as a failure, because a health tracker only works if you actually want to open it, so craft in the small moments (a considered severity dot, a warm sheet that slides up, a body map that feels tactile) is load-bearing, not garnish. And it is **not a sterile clinical EMR**: no cold gray density, no form-first coldness, no interchangeable SaaS card grid.

**Key Characteristics:**
- Warm cream paper (`#F5F1EB`), never a blue-white clinical surface.
- One forest-green accent (`#3D6B4F`) carries actions, selection, and the calm end of severity.
- Two voices: Lora serif for headings, DM Sans for all UI and data.
- Flat by default; depth is earned, not sprinkled.
- Meaning is always carried by more than color — shape, count, position, and label back it up.
- A single 430px hand-held column; density serves the data, not the screen.

## 2. Colors

A warm, grounded palette: cream paper, near-black ink, one forest green, and a two-color alert vocabulary that stays quiet until the data demands attention.

### Primary
- **Forest Green** (`#3D6B4F`): The one working accent. Primary buttons, the active nav item, current selection, focused input borders, and the calm (1–2) end of the severity scale. On hover it deepens to **Pine** (`#2F5340`). Its light wash **Sage Mist** (`#E3EFE8`) fills location pills and selected chips.

### Secondary (status)
- **Amber** (`#C4752A`) with wash **Amber Paper** (`#FBF0E4`): The middle of the severity scale (level 3) and warning states. Present, not alarming.
- **Clay Red** (`#B83A3A`) with wash **Red Paper** (`#FAEAEA`): The high end of severity (4–5), errors, and destructive confirmation. The only color allowed to feel urgent.

### Neutral
- **Cream Canvas** (`#F5F1EB`): The page. Everything sits on this warm paper.
- **Card White** (`#FFFFFF`): Raised surfaces — cards, sheets, the header bar.
- **Ink** (`#1C1A17`): Primary text and headings. A warm near-black, never pure `#000`.
- **Muted Ink** (`#6E6A62`): Secondary text, labels, captions, cancel actions.
- **Faint Ink** (`#B2ADA4`): Timestamps, inactive nav, placeholders — the quietest legible tier.
- **Hairline** (`rgba(0,0,0,0.08)`): The 1px border that does almost all of the structural separation.
- **Body Fill** (`#EAE5DC`) / **Body Stroke** (`#A09890`): The anatomical body map's resting fill and outline.

### Named Rules
**The One Green Rule.** A single forest green carries every affordance that means "act" or "selected." It is never used decoratively. If green appears, it means something is actionable, active, or calm-severity — nothing else.

**The Categorical Set is Not the Palette.** Food-type dots draw from a separate 10-color categorical set (`#E4572E` orange, `#F2B705` amber, `#6AA84F` green, `#17A398` teal, `#3B82C4` blue, `#8E5FD9` purple, `#D96BA0` pink, `#B5651D` brown, `#E23B3B` red, `#607D8B` slate; fallback `#9CA3AF`). These are data encodings, not brand colors, and must never leak into chrome, buttons, or type.

## 3. Typography

**Display Font:** Lora (with Georgia, serif)
**Body Font:** DM Sans (with system sans-serif)

**Character:** A deliberate contrast-axis pairing — a warm, bookish serif against a clean humanist sans. Lora supplies the human, notebook-like warmth in the few places it appears; DM Sans does the heavy lifting for every label, field, number, and dense row. They are different enough to never be mistaken for each other.

### Hierarchy

A single fixed rem scale (root 16px), tokenized in `index.css` as `--fs-*`. Every text element draws from one of these steps — no ad-hoc px sizes.

- **Numeral** (Lora, 600, 32px / `2rem`): The single hero stat figure only. The largest type in the app.
- **Display** (Lora, 600, 22px / `1.375rem`, letter-spacing −0.3px): The persistent app header title.
- **Headline** (Lora, 600, 20px / `1.25rem`): All page, sheet, modal, and empty-state titles — one size for every title.
- **Earned** (Lora, 600, 17px / `1.0625rem`): The primary save / continue action — a deliberate serif moment on the button that commits.
- **Title** (DM Sans, 500, 15px / `0.9375rem`): List-row headings, entry names, input text.
- **Body** (DM Sans, 400, 14px / `0.875rem`, line-height 1.5): Base body and descriptions. Cap prose at 65–75ch; data rows may run denser.
- **Meta** (DM Sans, 13px / `0.8125rem`): Secondary body — notes, helper text, small text buttons and links.
- **Caption** (DM Sans, 12px / `0.75rem`): Timestamps, tags, badges, pills — the quietest text tier (11px was collapsed into this step).
- **Label** (DM Sans, 600, 10px / `0.625rem`, letter-spacing 0.07em, uppercase): Functional field labels and table headers **only**. The one sanctioned tracked-uppercase — never a section eyebrow.

### Named Rules
**The Serif is a Guest.** Lora appears only in headings and a small number of intentional moments (numeral, display, headline, earned). Never labels, data, numbers, or body.

**Section headers are quiet, not shouted.** Section headers use DM Sans 15/600 in title-case ink (`--fs-title`), never a tracked-uppercase eyebrow. Tracked-uppercase is reserved for functional field labels.

## 4. Elevation

The system is **flat by default**: separation comes from the 1px hairline border and tonal shifts between cream canvas and white surface, not from shadow. Depth is *earned*, not sprinkled — it appears to signal that something has genuinely risen above the page. Overlays always take depth (the bottom sheet slides up over a `rgba(0,0,0,0.4)` scrim; the login card carries a whisper-soft lift). Beyond overlays, a restrained shadow is permitted on interactive surfaces to reinforce a press or a raised, tappable affordance — kept diffuse and low-contrast so it never reads as a 2014 drop shadow.

### Shadow Vocabulary
- **Whisper** (`box-shadow: 0 1px 3px rgba(0,0,0,0.04)`): The resting lift on the login card and, optionally, primary interactive surfaces. Barely there.
- **Overlay** (`box-shadow: 0 -8px 40px rgba(0,0,0,0.12)` on sheets, plus the scrim): Reserved for modals and bottom sheets that float above the page.

### Named Rules
**The Earned-Depth Rule.** Surfaces are flat at rest. A shadow must justify itself as either an overlay or a direct response to interaction. If it's decorating a static card, it's too much — delete it and let the hairline border do the work.

## 5. Components

Components lean **tactile and confident**: firmer presses, clear feedback, deliberate weight — calm, but never whisper-thin. (Today's build is more restrained in places; this section documents the target, and existing components should be nudged toward it, not rebuilt wholesale.)

### Buttons
- **Shape:** Gently rounded (12px, `{rounded.md}`); full-width primary actions on sheets.
- **Primary:** Solid forest green (`#3D6B4F`) with white text, `12px 32px` padding (or full-width `15px` on sheets). The save action may use Lora at ~17px as an earned moment.
- **Hover / Active:** Background deepens to Pine (`#2F5340`) over 150ms; a confident press should also register a subtle downward nudge or shadow shift, not just a color change.
- **Secondary / Ghost:** Transparent or white with a 1px hairline border and muted-ink text (`#6E6A62`), same 12px radius. Used for cancel and low-emphasis actions.
- **Disabled:** `opacity: 0.6`, cursor default.

### Chips / Pills
- **Style:** Fully rounded (20px). Location and category pills use the sage-mist wash (`#E3EFE8`) with forest-green text; selectable filter pills sit on the canvas with a hairline border until selected.
- **Selected:** Border and text shift to forest green, background to sage mist. The selected state is legible without relying on color alone (border weight + fill both change).

### Cards / Containers
- **Corner Style:** 14px (`{rounded.lg}`).
- **Background:** Card white (`#FFFFFF`) on the cream canvas.
- **Shadow Strategy:** Flat by default (see Elevation); hairline border does the separation.
- **Border:** 1px hairline (`rgba(0,0,0,0.08)`).
- **Internal Padding:** 14px. Never nest a card inside a card.

### Inputs / Fields
- **Style:** Canvas-fill (`#F5F1EB`) with a 1px hairline border, 8–10px radius, 12–14px padding, ink text.
- **Focus:** Border shifts to forest green (`#3D6B4F`); no glow. Field labels sit above in tracked uppercase 10px muted ink.
- **Error:** Message in clay red (`#B83A3A`); pair with text, never color alone.

### Navigation
- **Bottom tab bar:** Fixed, white, 64px, hairline top border, safe-area aware. Inactive items are faint ink (`#B2ADA4`); the active item's label turns forest green. Icons 20px, labels 10px/500.
- **Symptom action:** The primary "log symptom" tab is emphasized — wider flex, solid forest-green fill, white bold label, and a single rounded top-left corner. This is the app's front-door action and is allowed to stand out.

### Signature Component — Body Map & Severity Dots
- **Body Map:** An anatomical SVG (front/back toggle) with body-fill (`#EAE5DC`) and body-stroke (`#A09890`); tapped regions take the accent. The tactile centerpiece of symptom logging.
- **Severity Dots:** Five dots encode a 1–5 value by **count filled** (position/quantity) *and* color band — forest green (1–2), amber (3), clay red (4–5). The dual encoding is intentional and must be preserved: the count carries the value even where color can't.

## 6. Do's and Don'ts

### Do:
- **Do** keep the cream canvas (`#F5F1EB`) as the ground and one forest green (`#3D6B4F`) as the only working accent.
- **Do** back every color-coded signal with a second cue — count, shape, icon, position, or label — so severity, food type, and status survive color blindness and a printed page handed to a clinician.
- **Do** reserve Lora for headings and rare earned moments; run all labels, data, and numbers in DM Sans.
- **Do** keep surfaces flat with hairline borders; add depth only for overlays or a genuine interaction response (The Earned-Depth Rule).
- **Do** meet WCAG AA contrast (≥4.5:1 body, ≥3:1 large text), including muted and placeholder text — bump toward ink before adding gray "for elegance."
- **Do** make it feel considered — a well-tuned dot, a warm slide-up sheet — because "not boring" is a requirement, not a nicety.

### Don't:
- **Don't** let it feel boring, generic, or forgettable — a dull-but-functional health tracker is a failed one.
- **Don't** drift toward a cold, sterile clinical EMR look: no gray-on-gray density, no form-first coldness.
- **Don't** rely on color as the only signal for severity, food type, or status.
- **Don't** use the forest green decoratively — if it appears, it must mean actionable, active, or calm-severity.
- **Don't** let the categorical food-type colors leak into chrome, buttons, or type; they are data encodings only.
- **Don't** use `border-left`/`border-right` >1px as a colored accent stripe; use full hairline borders or a background tint.
- **Don't** nest cards, and don't add a tracked-uppercase eyebrow above every section — the only sanctioned tracked-uppercase is a functional field label.
