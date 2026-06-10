# ShellCrash Updater Design System

Source: approved Concept A mockup, Apple Liquid Glass direction.

This document is the implementation contract for the visual redesign. Do not change JavaScript logic, API calls, data flow, or business behavior when applying it. The redesign scope is HTML structure only where needed for layout semantics, plus CSS, spacing, typography, visual hierarchy, and animation.

## Design Intent

ShellCrash Updater is a focused utility application. The UI should feel like a modern Apple system tool: calm, precise, translucent, and task-oriented. Liquid Glass is used as a functional material layer around controls and panels, not as decorative noise.

The approved mockup has three priorities:

- Make the configuration workflow the primary surface.
- Keep execution progress visible as a secondary companion rail.
- Preserve logs as a quiet diagnostic surface.

The visual tone is light, spacious, and native. Avoid marketing-page composition, oversized cards, saturated gradients, decorative blobs, and heavy animation.

## Layout System

### Canvas

- Viewport background: full-screen soft material field.
- App shell: centered, max-width desktop utility window.
- Desktop composition:
  - Header/title centered at top.
  - Main configuration panel on the left.
  - Progress panel on the right.
  - Logs panel spans below both.
- Idle state without progress:
  - Main content remains centered and capped to a focused utility width.
  - Do not stretch the form across the whole desktop viewport.
- Active/running state:
  - Expand to two columns with progress visible.

### Desktop Grid

Recommended values:

```css
--app-max-width: 1620px;
--app-idle-width: 980px;
--app-gutter: 20px;
--app-gap: 14px;
--progress-width-min: 320px;
--progress-width-max: 420px;
```

Rules:

- Use one column when progress is hidden.
- Use `minmax(0, 1fr) minmax(320px, 380px)` when progress is visible.
- Logs span all columns.
- Right progress panel may be sticky on desktop.
- The grid sits inside one outer Liquid Glass app shell with macOS-style window chrome.

### Responsive Rules

- At `<= 1060px`, collapse to one column.
- At `<= 720px`, reduce outer gutter and panel padding.
- Form grid becomes one column on mobile.
- Action buttons wrap cleanly; no horizontal scrolling.
- Status pill becomes full-width on narrow screens.

## Spacing Rules

Use a 4px base grid with Apple-like optical spacing. Prefer even rhythm over rigid equal spacing.

### Token Scale

```css
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-8: 32px;
--space-10: 40px;
--space-12: 48px;
```

### Applied Spacing

- App top padding: `34px` desktop, `24px` mobile.
- Panel gap: `14px`.
- Panel padding: `24px` desktop, `18px` mobile.
- Form row bottom margin: `17px`.
- Form grid gap: `16px`.
- Label to control gap: `7px`.
- Control internal padding: `11px 13px`.
- Hint top margin: `6px`.
- Action capsule margin top: `20px`.
- Action capsule padding: `12px`, mobile `10px`.
- Button gap: `9px`.
- Progress header bottom spacing: `18px` margin plus `14px` padding.
- Progress item minimum height: `56px`.
- Log panel padding: `18px 22px 22px`.

## Typography Rules

Use system typography. Do not import external web fonts.

### Font Stacks

```css
--font-ui: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif;
--font-mono: "SF Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
```

### Type Scale

```css
--font-size-title: 22px;
--font-size-body: 14px;
--font-size-label: 13px;
--font-size-hint: 12.5px;
--font-size-button: 13px;
--font-size-progress-title: 15px;
--font-size-log: 12px;

--line-height-ui: 1.45;
--line-height-tight: 1.2;
--line-height-label: 1.25;
--line-height-log: 1.55;

--font-weight-title: 700;
--font-weight-label: 650;
--font-weight-button: 650;
--font-weight-status: 700;
--font-weight-body: 400;
```

### Usage

- App title: `22px / 1.2 / 700`.
- Labels: `13px / 1.25 / 650`.
- Body/input text: `14px / 1.45 / 400`.
- Hints and metadata: `12.5px`, muted.
- Buttons: `13px / 1.15 / 650`.
- Progress title: `15px / 700`.
- Logs: `12px / 1.55`, monospace.
- Letter spacing: `0`. Do not use negative tracking.

## Color Tokens

The palette is Apple-system neutral with blue accent and green success. Avoid a one-note blue theme; blue should identify primary action and focus, not dominate every surface.

```css
--text: #1d1d1f;
--text-soft: #3c3c43;
--muted: rgba(60, 60, 67, 0.68);
--muted-faint: rgba(60, 60, 67, 0.44);

--accent: #007aff;
--accent-strong: #006edb;
--accent-primary-top: #1688ff;
--accent-primary-bottom: #006ee6;
--accent-primary-hover-bottom: #005fc8;

--ok: #34c759;
--ok-text: #18833a;
--danger: #ff3b30;
--danger-text: #c5221f;

--canvas-base: #eef3fb;
--canvas-top: #f8fbff;
--canvas-mid: #eef5ff;
--canvas-end: #f7f4ff;
```

### State Colors

```css
--status-ok-bg: rgba(52, 199, 89, 0.14);
--status-ok-border: rgba(52, 199, 89, 0.24);
--status-run-bg: rgba(0, 122, 255, 0.11);
--status-run-border: rgba(0, 122, 255, 0.22);
--status-error-bg: rgba(255, 59, 48, 0.11);
--status-error-border: rgba(255, 59, 48, 0.22);
```

## Liquid Glass Material Specifications

Liquid Glass should be layered by functional importance.

### Background Material

Purpose: provide a soft color field that is visible through glass surfaces.

```css
background:
  radial-gradient(1100px 720px at 16% 26%, rgba(79, 151, 255, 0.22), transparent 62%),
  radial-gradient(860px 620px at 85% 16%, rgba(178, 121, 255, 0.13), transparent 58%),
  radial-gradient(900px 620px at 70% 92%, rgba(255, 125, 160, 0.12), transparent 60%),
  linear-gradient(135deg, #f8fbff 0%, #eef5ff 44%, #f7f4ff 100%);
```

Rules:

- No animated blobs or moving orbs.
- No saturated decorative gradients.
- Background must stay behind content and never reduce legibility.

### Panel Glass

Purpose: main app surfaces.

```css
--surface: rgba(255, 255, 255, 0.56);
--hairline: rgba(255, 255, 255, 0.86);
--shadow-panel: 0 30px 80px rgba(35, 47, 75, 0.16),
                0 8px 24px rgba(35, 47, 75, 0.08);

background:
  linear-gradient(145deg, rgba(255, 255, 255, 0.78), rgba(255, 255, 255, 0.48)),
  var(--surface);
border: 1px solid var(--hairline);
box-shadow: var(--shadow-panel), inset 0 1px 0 rgba(255, 255, 255, 0.95);
backdrop-filter: blur(34px) saturate(180%);
-webkit-backdrop-filter: blur(34px) saturate(180%);
```

Panel highlight overlay:

```css
background:
  linear-gradient(180deg, rgba(255, 255, 255, 0.72), transparent 34%),
  linear-gradient(110deg, transparent 0%, rgba(255, 255, 255, 0.3) 42%, transparent 66%);
opacity: 0.72;
```

### Control Glass

Purpose: inputs, file picker, segmented control.

```css
--surface-control: rgba(255, 255, 255, 0.62);
--surface-recessed: rgba(248, 250, 255, 0.58);
--stroke-soft: rgba(60, 60, 67, 0.08);
--shadow-control: 0 1px 1px rgba(255, 255, 255, 0.78) inset,
                  0 1px 2px rgba(35, 47, 75, 0.06);

background: var(--surface-control);
border: 1px solid var(--stroke-soft);
box-shadow: var(--shadow-control);
backdrop-filter: blur(18px) saturate(160%);
-webkit-backdrop-filter: blur(18px) saturate(160%);
```

Focus:

```css
--focus-ring: 0 0 0 4px rgba(0, 122, 255, 0.2),
              0 0 0 1px rgba(0, 122, 255, 0.42);
```

### Action Capsule Glass

Purpose: gathers high-frequency commands into one floating functional layer.

```css
background: rgba(255, 255, 255, 0.46);
border: 1px solid rgba(255, 255, 255, 0.8);
box-shadow:
  inset 0 1px 0 rgba(255, 255, 255, 0.88),
  0 10px 28px rgba(35, 47, 75, 0.08);
backdrop-filter: blur(26px) saturate(180%);
-webkit-backdrop-filter: blur(26px) saturate(180%);
border-radius: 20px;
```

### Log Surface

Purpose: quiet diagnostic area.

```css
background: rgba(250, 252, 255, 0.66);
border-color: rgba(60, 60, 67, 0.1);
box-shadow:
  inset 0 1px 4px rgba(35, 47, 75, 0.05),
  0 1px 0 rgba(255, 255, 255, 0.8);
```

## Radius Tokens

```css
--radius-window: 30px;
--radius-panel: 24px;
--radius-control: 13px;
--radius-small: 10px;
--radius-pill: 999px;
```

Usage:

- App/window feel: `30px`.
- Main panels: `24px`.
- Mobile panels: `22px`.
- Inputs: `13px`.
- Segmented selected segment: `10px`.
- Buttons/status: `999px`.
- File picker/action capsule: `16px` to `20px`.

## Component Rules

### Header

- Centered title on desktop.
- Left-aligned on narrow mobile.
- Icon size: `24px`.
- Icon color: `--accent`.
- Icon shadow: `drop-shadow(0 5px 12px rgba(0, 122, 255, 0.22))`.
- Desktop app shell includes three traffic-light dots at top left and a small circular menu affordance at top right. These may be CSS pseudo-elements.

### Form

- Keep current fields and IDs.
- Use a two-column grid only for related peer fields, such as router IP and SSH key.
- Use one-column full-width rows for long paths and subscription URLs.
- Labels sit above controls.
- Hints sit below controls in muted text.
- Avoid nested cards inside the main form panel.

### Segmented Control

- Two equal columns.
- Outer material uses control glass.
- Selected item uses brighter inner material and subtle shadow.
- Radio inputs may remain visible if preserving native semantics, but the selected segment must be visually dominant.

### Buttons

- Primary button: only `生成并上传`.
- Secondary buttons: `保存配置`, `仅生成 YAML`, `上传 YAML`, `下载 YAML`, file chooser, close/cancel controls.
- Button shape: pill.
- Primary fill: blue vertical gradient.
- Secondary fill: translucent white.
- Hover: brighten background and add subtle lift.
- Active: scale to `0.975`.
- Disabled: opacity around `0.48`, no shadow.

### Status Pill

- Lives at the end of the action capsule.
- Uses state color backgrounds.
- On mobile, becomes full-width below the buttons.

### Progress Timeline

- Use a vertical timeline, not stacked alert bars.
- Dot size: `17px`.
- Connector: `1px` line, muted neutral.
- Completed dot: green.
- Active dot: blue with soft glow and subtle pulse.
- Error dot: red.
- Item minimum height: `56px`.
- Completed progress panel should visually match the form panel height on desktop.
- Completed progress panel includes a bottom glass summary capsule with completion text and elapsed time, plus the log-view action aligned to the bottom right.

### Logs

- Logs are a recessed console within a glass panel.
- Use monospace only here.
- Minimum height: `215px`.
- Keep line-height generous enough for scanning.

## Motion Rules

Motion must be functional and restrained.

```css
--transition-fast: 180ms cubic-bezier(0.2, 0.8, 0.2, 1);
--transition-fluid: 420ms cubic-bezier(0.22, 1, 0.36, 1);
```

Allowed:

- Panel enter: slight fade/translate/scale.
- Button active press scale.
- Status running pulse.
- Active progress dot pulse.

Avoid:

- Background hue rotation.
- Moving decorative blobs.
- Continuous shimmer across panels.
- Floating title icon animation.

Reduced motion:

- Set animations and transitions to near-zero duration.
- Do not rely on animation to communicate state.

## Accessibility Rules

- Preserve all current labels and input IDs.
- Preserve native form controls where possible.
- Focus states must be visible on keyboard navigation.
- Text must pass legibility against glass backgrounds.
- Do not use blur-heavy surfaces without a solid fallback:

```css
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .panel,
  .actions,
  .auth-options,
  input[type="text"],
  input[type="password"],
  textarea {
    background: rgba(255, 255, 255, 0.92);
  }
}
```

## Implementation Boundaries

Allowed:

- CSS variables and style rules.
- HTML wrappers/classes if needed for layout.
- Responsive layout changes.
- Visual hierarchy changes.
- Motion and focus styling.

Not allowed:

- JavaScript behavior changes.
- API endpoint changes.
- Task polling changes.
- Payload shape changes.
- Config persistence changes.
- Upload/download behavior changes.

## Approval Checklist

Before implementation continues, confirm:

- The design should remain Concept A: Apple Liquid Glass.
- Idle layout should stay centered and capped around `980px`.
- Running layout should expand into form plus progress rail.
- Only `生成并上传` should be primary.
- Logs should remain visible as a bottom diagnostic panel.
