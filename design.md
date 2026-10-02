# DevTrackAcademy — Master Design System & Sub-Brand Specification (`design.md`)

This document is the **definitive design system reference** for DevTrackAcademy (`devtrackacademy.com`) and all of its sub-brands (`workshop.devtrackacademy.com`, `learn.devtrackacademy.com`, `interview.devtrackacademy.com`, and future sub-brands).

Read this specification before building any UI, component library, or new sub-brand platform within the DevTrackAcademy ecosystem.

---

## 1. Design Philosophy & Core Aesthetics

**Design Aesthetic:** Neo-Brutalist, Developer-Native, Playful, and Disciplined.

DevTrackAcademy combines high-density developer utility with bold, tactile, retro-modern Neo-Brutalism. It rejects generic corporate minimalism, soft blurred drop shadows, multi-stop gradients, and artificial glassmorphism.

### Core Principles

1. **Ink is Structure (`--ink: #1B1F3B`):** Every meaningful surface, card, button, and container is enclosed by a 4px Deep Navy border. Solid ink line-work defines visual hierarchy and layout boundaries instead of faint gradients or blurred shadows.
2. **Flat Saturated Colors, Zero Blends:** Color fills are 100% solid and un-blended. Backgrounds rely on rich warm cream (`#FFF8F0`) and high-contrast primary accents (`#FF6B35` Primary Orange, `#4EA8FF` Sky Cobalt, `#6EE7B7` Mint Green, `#FFC93C` Solar Yellow, `#FF5C7A` Coral).
3. **Rounded Brutalism:** Sharp Neo-Brutalist borders are paired with friendly, modern 20px–30px rounded card corners (`rounded-3xl` / 24px radius) and 16px button radii (`rounded-2xl`).
4. **Depth via Hard Offset Shadows (Zero Blur):** Spatial depth is established strictly using hard-edge offset shadows: `Xpx Ypx 0 #1B1F3B`. Blur radii and spread distances are strictly prohibited (`0px` blur everywhere).
5. **Tactile Metaphor (Lift & Press Physics):** Interactive elements (buttons, cards, inputs) physically react to user input. Hover state lifts the element (`translate(-2px, -2px)`) and grows the offset shadow; active click state depresses the element (`translate(3px, 3px)`) and flattens the shadow.
6. **One Primary Accent Per Viewport:** A clean layout uses `--ink` (`#1B1F3B`), `--paper` (`#FFF8F0`), and exactly one primary brand color (`--brand`). Secondary accents (`--mint`, `--yellow`, `--coral`) are used sparingly for semantic status indicators (success, warning, error).
7. **Mono is the Machine Voice:** Code artifacts, stats, badges, timing gutters, WPM indicators, eyebrows, and technical metadata always render in JetBrains Mono. Headings speak in Space Grotesk; body prose speaks in Inter.
8. **Native Pointer Responsiveness:** Native cursor tracking is preserved for crisp usability, keyboard accessibility focus rings, and high frame-rate performance. Custom fake cursor trail scripts are disabled.

---

## 2. Color Palette & Token System

### 2.1 Foundations (Neutrals)

| CSS Variable | Tailwind Token | Hex Code | Role & Usage Guidelines |
|---|---|---|---|
| `--ink` | `color-ink` | `#1B1F3B` | **Deep Navy.** Structural borders (2px/4px/6px), body text, dark mode canvas, hard shadows, high-contrast badges. |
| `--paper` | `color-paper` | `#FFF8F0` | **Warm Cream.** Primary page background. Low-glare tone that makes vibrant accents pop without harsh white eye-fatigue. |
| `--paper-sunk` | `color-paper-sunk` | `#F5EBE0` | **Recessed Surface.** Form inputs, alternating section bands, code block backgrounds, disabled states. |
| `--paper-pure` | `color-paper-pure` | `#FFFFFF` | **Pure White.** Card container faces where maximum contrast against `--paper` is required. |

### 2.2 Core Accents

| Token | CSS Variable | Hex Code | Semantic Role | Usage & Placement |
|---|---|---|---|---|
| **Primary Orange** | `--orange` | `#FF6B35` | Main Brand & Workshop Accent | Marker highlights, primary CTAs, final callout sections, primary wordmark accent. |
| **Sky Cobalt** | `--sky` / `--cobalt` | `#4EA8FF` | Platform & Learn Accent | Navigation links, secondary cards, tech stack tags, sub-brand focal accents. |
| **Solar Yellow** | `--yellow` | `#FFC93C` | Highlight & Moderate Metric | Stat counters, warning callouts, limited seat urgency chips, 5.0–6.9 score bands. |
| **Positive Mint** | `--mint` | `#6EE7B7` | Success & High Performance | Checkmark columns, verified chips, code output passes, >= 7.0 score bands. |
| **Coral Red** | `--coral` / `--violet` | `#FF5C7A` | Warning, Negative & Specialization | Error state callouts, missing skill alerts, danger buttons, < 5.0 score bands. |

### 2.3 Semantic Aliases & CSS Variables

```css
:root {
  /* Foundations */
  --ink:        #1B1F3B;
  --paper:      #FFF8F0;
  --paper-sunk: #F5EBE0;
  --paper-pure: #FFFFFF;

  /* Accents */
  --orange:     #FF6B35;
  --sky:        #4EA8FF;
  --cobalt:     #4EA8FF;
  --yellow:     #FFC93C;
  --mint:       #6EE7B7;
  --coral:      #FF5C7A;
  --violet:     #FF5C7A;

  /* Semantic Mapping */
  --brand:             var(--orange);   /* #FF6B35 - Default Brand Color */
  --platform-workshop: var(--orange);   /* #FF6B35 - Workshop Sub-Brand */
  --platform-learn:    var(--sky);      /* #4EA8FF - Learning Platform Sub-Brand */
  --platform-interview:var(--cobalt);   /* #4EA8FF - Interview Prep Sub-Brand */
  
  --accent-data:      var(--yellow);   /* #FFC93C */
  --accent-positive:  var(--mint);     /* #6EE7B7 */
  --accent-future:    var(--coral);    /* #FF5C7A */
  --negative:         var(--coral);    /* #FF5C7A */
}
```

---

## 3. Sub-Brand System & Color Schemes

DevTrackAcademy operates as an ecosystem of focused engineering platforms. Every sub-brand inherits the exact structural system (4px `--ink` borders, `--paper` background, typography, button physics) but designates a unique primary accent color for instant sub-brand identity.

### 3.1 Sub-Brand Palette Mapping

```
 DevTrackAcademy Parent Brand (#FF6B35 Primary Orange)
 ├── 1. DevTrackAcademy Workshops   ── Primary Accent: #FF6B35 (Orange)
 ├── 2. DevTrackAcademy Learn       ── Primary Accent: #4EA8FF (Sky Cobalt)
 ├── 3. DevTrackAcademy Interview   ── Primary Accent: #4EA8FF (Cobalt Blue)
 └── 4. [New Sub-Brand Platform]   ── Choose Accent (e.g. #FFC93C Yellow / #6EE7B7 Mint / #FF5C7A Coral)
```

### 3.2 Guidelines for Creating a New Sub-Brand

When creating a new sub-brand platform:

1. **Keep invariant:**
   - Page background: `--paper` (`#FFF8F0`)
   - All borders & ink lines: `--ink` (`#1B1F3B`)
   - Font family stack: Space Grotesk, Inter, JetBrains Mono
   - Border thickness: `4px solid #1B1F3B`
   - Shadows: `4px 4px 0 #1B1F3B` / `6px 6px 0 #1B1F3B`
2. **Customize per sub-brand:**
   - **Primary Brand Color (`--brand`):** Set `--brand` to your chosen sub-brand accent (e.g., `#FF6B35` for Workshops, `#4EA8FF` for Learn/Interview, or `#9333EA` / `#FFC93C` for new properties).
   - **Sub-Brand Badge Tag:** In the header wordmark, display `DevTrackAcademy` followed by a pill tag with your sub-brand identifier (e.g., `WORKSHOP`, `LEARN`, `INTERVIEW`, `LABS`, `STUDIO`).
   - **Marker Highlights:** Key headline highlights use the sub-brand's `--brand` color.
   - **Primary Buttons:** Primary action buttons default to the sub-brand's `--brand` color fill with white bold text and 4px `--ink` border.

---

## 4. Typography System

### 4.1 Typefaces

| Role | Font Family | Weights Used | Fallbacks | Usage Context |
|---|---|---|---|---|
| **Display / Headings** | `Space Grotesk` | 500, 600, 700, 800 | `system-ui, sans-serif` | H1, H2, H3, Hero text, Card titles, Stat values |
| **Body / Copy** | `Inter` | 400, 500, 600, 700 | `system-ui, sans-serif` | Paragraphs, descriptions, long prose, form labels |
| **Utility / Mono** | `JetBrains Mono` | 400, 700 | `ui-monospace, monospace` | Badges, tags, timestamps, code snippets, WPM |

### 4.2 Typographic Scale

| Token | CSS Clamp Formula | Font Size Range | Line Height | Letter Spacing | Context |
|---|---|---|---|---|---|
| `--t-hero` | `clamp(3rem, 8.5vw, 7.5rem)` | 48px – 120px | 0.95 | `-0.03em` | Main landing H1 headlines |
| `--t-display` | `clamp(2.25rem, 5.5vw, 4.5rem)` | 36px – 72px | 1.05 | `-0.02em` | Section primary titles |
| `--t-h2` | `clamp(1.75rem, 3.5vw, 3.25rem)` | 28px – 52px | 1.1 | `-0.015em` | Component H2 titles |
| `--t-h3` | `clamp(1.25rem, 2vw, 1.85rem)` | 20px – 30px | 1.2 | `0em` | Card titles, modal headers |
| `--t-lead` | `clamp(1.125rem, 1.5vw, 1.35rem)` | 18px – 22px | 1.5 | `0em` | Subtitles & lead paragraphs |
| `--t-body` | `clamp(1rem, 1.1vw, 1.125rem)` | 16px – 18px | 1.6 | `0em` | Standard body prose |
| `--t-small` | `0.875rem` | 14px | 1.5 | `0em` | Secondary descriptions, hints |
| `--t-label` | `0.75rem` | 12px | 1.4 | `0.1em` | Form labels, eyebrow headers |
| `--t-tag` | `0.6875rem` | 11px | 1.2 | `0.18em` | Mono tags, trust chips, WPM |

---

## 5. Layout, Spacing & Container Grid

### 5.1 Container Max-Width

- **Standard Application Container:** `1320px` (`max-w-[1320px] mx-auto px-4 md:px-8`)
- **Focused Wizard / Form Container:** `800px` (`max-w-3xl mx-auto`)
- **Reading / Article Width:** `680px` (`max-w-2xl`)

### 5.2 Spacing Tokens

- `--sp-section`: `clamp(64px, 10vh, 140px)` — Vertical spacing between page sections
- `--sp-block`: `clamp(36px, 5vh, 80px)` — Spacing between major content blocks
- `--sp-card`: `clamp(20px, 2.5vw, 36px)` — Internal padding for cards and containers

---

## 6. Component Blueprints & UI Patterns

### 6.1 Buttons (`.tactile-btn`)

Buttons use thick ink borders, hard offset shadows, and tactile physical feedback.

```tsx
// Primary Button Blueprint
<button className="
  inline-flex items-center justify-center gap-2 px-5 py-3 
  bg-[#FF6B35] text-white 
  border-4 border-[#1B1F3B] rounded-2xl 
  font-[family-name:var(--font-display)] font-bold text-sm 
  shadow-[4px_4px_0_#1B1F3B] 
  transition-all duration-150 
  hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0_#1B1F3B] 
  active:translate-x-0.5 active:translate-y-0.5 active:shadow-[2px_2px_0_#1B1F3B]
  focus-visible:outline-3 focus-visible:outline-[#FF6B35] focus-visible:outline-offset-3
  disabled:opacity-40 disabled:pointer-events-none
">
  <span>Start Free Interview</span>
</button>
```

#### Button Variants

| Variant | Background | Text Color | Border | Shadow | Hover Behavior |
|---|---|---|---|---|---|
| **Primary** | `--brand` (`#FF6B35` / `#4EA8FF`) | `#FFFFFF` | `4px solid #1B1F3B` | `4px 4px 0 #1B1F3B` | Lift -2px, Shadow 6px |
| **Secondary** | `#FFFFFF` | `#1B1F3B` | `4px solid #1B1F3B` | `4px 4px 0 #1B1F3B` | Lift -2px, Shadow 6px |
| **Ghost** | `transparent` | `#1B1F3B` | `4px solid transparent` | `none` | Subtle bg `#F5EBE0` |
| **Danger** | `#FF5C7A` | `#FFFFFF` | `4px solid #1B1F3B` | `4px 4px 0 #1B1F3B` | Lift -2px, Shadow 6px |

### 6.2 Cards (`.card-brut`)

Cards use solid white backgrounds, 4px ink borders, 24px corner radii (`rounded-3xl`), and 6px hard offset shadows.

```tsx
// Standard Neo-Brutalist Card
<div className="
  bg-white 
  border-4 border-[#1B1F3B] 
  rounded-3xl 
  p-6 md:p-8 
  shadow-[6px_6px_0_#1B1F3B] 
  transition-all duration-300 
  hover:-translate-y-1 hover:shadow-[10px_10px_0_#1B1F3B]
">
  {children}
</div>
```

#### Playful Card Tilts
To emphasize the handcrafted Neo-Brutalist aesthetic, cards in grid layouts can use slight rotational offsets:
- `.tilt-neg-2` (`transform: rotate(-2deg);`)
- `.tilt-neg-1` (`transform: rotate(-1deg);`)
- `.tilt-pos-1` (`transform: rotate(1deg);`)
- `.tilt-pos-2` (`transform: rotate(2deg);`)

*Note: On hover, tilted cards transition back to `rotate(0deg)` to signal active focus.*

### 6.3 Marker Highlights (`.marker`)

Used on landing page headlines to draw focus to a single high-impact keyword.

```html
<span class="marker">interview</span>
```

```css
.marker {
  position: relative;
  display: inline-block;
  white-space: nowrap;
  color: #FFFFFF;
  padding: 0 0.2em;
  z-index: 1;
}

.marker::before {
  content: '';
  position: absolute;
  inset: 10% -0.1em 8%;
  background: var(--brand);
  transform: skewX(-3deg);
  z-index: -1;
  border-radius: 4px;
  box-shadow: 2px 2px 0 var(--ink);
}
```

### 6.4 Chips & Badges (`Chip`)

Uppercase JetBrains Mono tags with 2px ink borders and rounded pill shapes.

```tsx
<span className="
  inline-flex items-center gap-1.5 px-3 py-1 
  bg-[#4EA8FF] text-[#1B1F3B] 
  border-2 border-[#1B1F3B] rounded-full 
  font-[family-name:var(--font-mono)] text-[11px] font-bold uppercase tracking-wider
">
  LIVE ADAPTIVE
</span>
```

### 6.5 Stat Tiles & Score Displays

Numbers in stat tiles use `tabular-nums` so animated count-ups never cause layout jitter.

```tsx
<div className="bg-white border-4 border-[#1B1F3B] rounded-3xl px-5 py-4 shadow-[4px_4px_0_#1B1F3B]">
  <p className="font-[family-name:var(--font-mono)] text-[10px] font-bold uppercase tracking-[0.18em] text-[#1B1F3B]/60">
    SPEAKING PACE
  </p>
  <p className="font-[family-name:var(--font-display)] text-3xl font-extrabold text-[#FF6B35] tabular-nums mt-1">
    142 WPM
  </p>
</div>
```

---

## 7. Form Controls & Recessed Inputs

Inputs sit on recessed paper backgrounds (`#F5EBE0`) with 4px ink borders and distinct focus states.

```tsx
<div className="space-y-2">
  <label className="block font-[family-name:var(--font-mono)] text-xs font-bold uppercase tracking-wider text-[#1B1F3B]">
    Target Job Description
  </label>
  <textarea className="
    w-full p-4 
    bg-[#F5EBE0] text-[#1B1F3B] 
    border-4 border-[#1B1F3B] rounded-2xl 
    font-[family-name:var(--font-body)] text-sm 
    placeholder:text-[#1B1F3B]/40 
    focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#FF6B35]/30
    transition-all
  " rows={4} placeholder="Paste requirements here..." />
</div>
```

---

## 8. Dark Mode & Section Inversion Rules

DevTrackAcademy uses full-width dark sections (`.section-dark`) to create dramatic visual contrast for special features, code editors, or final call-to-action bands.

### Dark Section Theme Overrides

```css
.section-dark {
  background-color: #1B1F3B;
  color: #FFF8F0;
  --paper: #1B1F3B;
  --paper-sunk: #24294A;
  --ink: #FFF8F0;
}

.section-dark .card-brut {
  background-color: #24294A;
  border-color: #FFF8F0;
  box-shadow: 6px 6px 0 #FFF8F0;
  color: #FFF8F0;
}
```

---

## 9. Animation & Motion Tokens

Animations are fast, snappy, and physical. Soft, slow, floaty transitions are prohibited.

### Motion Variables

```css
--dur-micro:  150ms;   /* Button clicks, hover shifts, toggle flips */
--dur-fast:   240ms;   /* Dropdown popups, toast notifications */
--dur-base:   400ms;   /* Card expansion, tab switching */
--dur-reveal: 640ms;   /* Scroll reveal, staggered list items */

--ease-brut:   cubic-bezier(0.16, 1, 0.30, 1);   /* Snappy spring-like curve */
--ease-snap:   cubic-bezier(0.34, 1.56, 0.64, 1);  /* Overshoot snap curve */
```

### Accessibility (Reduced Motion)

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
```

---

## 10. Summary Checklist for Sub-Brand Developers

Before launching a new sub-brand platform:

- [ ] `globals.css` defines `--ink: #1B1F3B`, `--paper: #FFF8F0`, `--paper-sunk: #F5EBE0`.
- [ ] `--brand` is assigned to the sub-brand's signature accent color.
- [ ] Space Grotesk, Inter, and JetBrains Mono fonts are loaded.
- [ ] No blurred shadows (`box-shadow` uses `Xpx Ypx 0 #1B1F3B` format exclusively).
- [ ] No glassmorphism (`backdrop-blur` is disabled).
- [ ] All interactive buttons use `.tactile-btn` physics (hover lift, active press down).
- [ ] Mobile menu keeps primary CTA visible without hiding it inside a hamburger drawer.
- [ ] Form input fields use `#F5EBE0` background with `4px solid #1B1F3B` borders.
- [ ] Stat numbers specify `tabular-nums` for rock-solid layouts.
