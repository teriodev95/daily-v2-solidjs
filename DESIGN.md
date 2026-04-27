---
version: alpha
name: Daily Check iOS
description: Visual identity and implementation guardrails for the Daily Check SolidJS app.
colors:
  primary: "#171717"
  on-primary: "#FFFFFF"
  secondary: "#525252"
  accent: "#007AFF"
  accent-hover: "#0051D5"
  success: "#34C759"
  warning: "#FF9500"
  error: "#FF3B30"
  surface: "#FFFFFF"
  surface-muted: "#FAFAFA"
  surface-raised: "#F5F5F5"
  surface-dark: "#000000"
  surface-dark-raised: "#171717"
  border: "#E5E5E5"
  border-strong: "#D4D4D4"
  text: "#171717"
  text-muted: "#737373"
  text-subtle: "#A3A3A3"
typography:
  title-lg:
    fontFamily: "-apple-system, BlinkMacSystemFont, San Francisco, Helvetica Neue, Arial, sans-serif"
    fontSize: 18px
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: 0em
  title-md:
    fontFamily: "-apple-system, BlinkMacSystemFont, San Francisco, Helvetica Neue, Arial, sans-serif"
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: 0em
  body-md:
    fontFamily: "-apple-system, BlinkMacSystemFont, San Francisco, Helvetica Neue, Arial, sans-serif"
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: 0em
  body-sm:
    fontFamily: "-apple-system, BlinkMacSystemFont, San Francisco, Helvetica Neue, Arial, sans-serif"
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.45
    letterSpacing: 0em
  label-sm:
    fontFamily: "-apple-system, BlinkMacSystemFont, San Francisco, Helvetica Neue, Arial, sans-serif"
    fontSize: 11px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: 0.1em
rounded:
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  pill: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  page-x-mobile: 16px
  page-x-desktop: 32px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: 12px
  button-primary-hover:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.on-primary}"
  button-secondary:
    backgroundColor: "#EFF6FF"
    textColor: "#1D4ED8"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: 12px
  button-ghost:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.secondary}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: 12px
  icon-button:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.accent-hover}"
    rounded: "{rounded.pill}"
    size: 40px
  card-default:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: 20px
  modal-panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: 24px
  status-success:
    backgroundColor: "#F0FDF4"
    textColor: "#15803D"
    rounded: "{rounded.md}"
    padding: 16px
  status-info:
    backgroundColor: "#EFF6FF"
    textColor: "#1D4ED8"
    rounded: "{rounded.md}"
    padding: 16px
---

## Overview

Daily Check is a focused productivity app for daily reports, objectives, team stories, and PDF output. The interface should feel native to iOS: quiet, immediate, readable, and task oriented. Visual polish comes from restrained surfaces, soft borders, modest shadows, precise spacing, and clear interaction states.

The app favors utility over marketing. New screens should open directly into the working surface, keep repeated actions close to the content, and avoid decorative sections that do not help users complete or review daily work.

## Colors

The design is mostly neutral, with color reserved for state and action.

- **Primary (#171717):** Main ink for titles, primary buttons, and strong text in light mode.
- **Surface (#FFFFFF / #FAFAFA):** Default page and card surfaces in light mode.
- **Dark surfaces (#000000 / #171717):** Default shell and raised panels in dark mode.
- **Accent (#007AFF):** iOS blue for links, active controls, focused selection, remote-update hints, and important secondary actions.
- **Success (#34C759):** Completion, done states, and positive progress.
- **Warning (#FF9500):** Due-soon, in-progress, and attention states.
- **Error (#FF3B30):** Destructive actions, overdue state, and hard validation errors.

## Typography

Use the system stack from `src/index.css`: `-apple-system, BlinkMacSystemFont, San Francisco, Helvetica Neue, Arial, sans-serif`.

Use compact, work-focused type. Section titles usually sit between 14px and 18px. Body copy sits between 13px and 15px. Tiny metadata labels can use 10px or 11px with uppercase and wide positive tracking. Do not use oversized landing-page type inside dashboards, cards, modals, or forms.

## Layout

The app uses a responsive constrained shell: page content is centered with `max-w-7xl`, mobile horizontal padding around 16px, and desktop padding around 32px. Cards and panels should use dense but breathable spacing: 16px to 24px for major panels, 8px to 12px for compact controls.

Keep workflows scan-friendly. Related fields belong in clear sections with visible headings. Lists should preserve stable row heights and avoid layout shift when status, hover, or remote-sync indicators appear.

## Elevation & Depth

Depth is subtle. Prefer borders, translucent surfaces, and low-spread shadows over heavy floating cards. In dark mode, use tonal layering and low-alpha borders instead of bright shadow effects.

Animations should remain quick and functional. Existing motion tokens in `src/index.css` use short durations for card entry, contextual menus, toasts, remote pulses, and sync indicators. New motion should communicate state changes, not decorate static content.

## Shapes

The default radius language is soft iOS geometry:

- 8px for small inputs, buttons, and modal panels that need precision.
- 12px to 16px for cards, section containers, and repeated list items.
- 22px to 30px for mobile-first panels where the existing mobile v2 UI already uses larger rounded surfaces.
- Full radius for icon buttons, avatars, chips, and floating action buttons.

Avoid mixing sharp rectangular elements with highly rounded controls in the same local surface unless an existing component already establishes that contrast.

## Components

Buttons use icon plus text when the command benefits from recognition, and icon-only controls require accessible labels or titles. Primary buttons are dark in light mode and light in dark mode. Blue is generally reserved for selection, focus, links, and secondary positive actions.

Cards use white or near-white surfaces in light mode, dark raised surfaces in dark mode, low-alpha borders, and subtle shadows. Cards should frame repeated items or real tools, not every page section.

Inputs and textareas should follow the `ios-input` utility where possible: white surface, gray border, 8px radius, 12px vertical padding, and a clear focus state. Textareas must preserve readability and avoid resizing parent layouts unexpectedly.

Modals use a blurred dark overlay, constrained max width, internal scrolling, and explicit escape/click-outside close behavior. Destructive actions should be visually separated from routine editing controls.

## Do's and Don'ts

- Do use `src/index.css` tokens and utilities before adding new one-off colors or shadows.
- Do keep dark and light mode behavior aligned through `data-theme="ios"` and `data-theme="ios-dark"`.
- Do use Lucide icons for new UI actions when an icon exists.
- Do preserve compact, operational layouts for dashboards, reports, calendars, and forms.
- Do make mobile controls at least 40px tall when they are primary touch targets.
- Don't add hero sections, marketing copy, decorative gradients, or ornamental backgrounds to working screens.
- Don't introduce a new color palette unless it represents a real domain state.
- Don't use color alone to communicate status; pair it with text, icon, placement, or shape.
- Don't create nested cards or page sections that look like stacks of floating panels.
- Don't use negative letter spacing or viewport-scaled font sizes.
