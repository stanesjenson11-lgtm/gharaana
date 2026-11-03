---
name: DirectNest
description: Rent and buy straight from verified owners. Brokers please excuse.
colors:
  dusk: "oklch(0.27 0.09 266)"
  indigo: "oklch(0.50 0.16 266)"
  indigo-deep: "oklch(0.42 0.15 266)"
  streetlight: "oklch(0.82 0.15 78)"
  canvas: "oklch(1 0 0)"
  surface: "oklch(0.97 0.006 266)"
  hairline: "oklch(0.91 0.01 266)"
  ink: "oklch(0.22 0.025 266)"
  muted: "oklch(0.47 0.02 266)"
  verified: "oklch(0.50 0.12 155)"
  verified-wash: "oklch(0.95 0.04 155)"
  danger: "oklch(0.52 0.19 27)"
  board-enamel: "oklch(0.96 0.01 90)"
  board-paint: "oklch(0.52 0.19 27)"
typography:
  display:
    fontFamily: "Anek Latin, system-ui, sans-serif"
    fontSize: "clamp(2.75rem, 7vw, 5.5rem)"
    fontWeight: 500
    lineHeight: 0.98
    letterSpacing: "-0.02em"
    fontVariation: "'wdth' 112"
  headline:
    fontFamily: "Anek Latin, system-ui, sans-serif"
    fontSize: "clamp(1.75rem, 3.6vw, 2.75rem)"
    fontWeight: 500
    lineHeight: 1.05
    fontVariation: "'wdth' 108"
  title:
    fontFamily: "Anek Latin, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.2
  body:
    fontFamily: "Anek Latin, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Anek Latin, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.3
  price:
    fontFamily: "Anek Latin, system-ui, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 600
    lineHeight: 1.1
    fontFeature: "'tnum' 1"
rounded:
  sm: "6px"
  md: "12px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "32px"
  xl: "64px"
  section: "clamp(96px, 14vw, 200px)"
components:
  button-primary:
    backgroundColor: "{colors.indigo}"
    textColor: "{colors.canvas}"
    rounded: "{rounded.pill}"
    padding: "14px 28px"
  button-primary-hover:
    backgroundColor: "{colors.indigo-deep}"
  button-on-dusk:
    backgroundColor: "{colors.streetlight}"
    textColor: "{colors.dusk}"
    rounded: "{rounded.pill}"
    padding: "14px 28px"
  search-field:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    height: "56px"
  badge-verified:
    backgroundColor: "{colors.verified-wash}"
    textColor: "{colors.verified}"
    rounded: "{rounded.sm}"
    padding: "4px 8px"
---

<!-- SEED: tokens approved in the plan; re-run /impeccable document once the homepage and search exist to capture real components. -->

# Design System: DirectNest

## 1. Overview

**Creative North Star: "Dusk on the Gate"**

The brand moment is the hour a tenant actually house-hunts: early evening, streetlights coming on, a hand-painted TO-LET board on a society gate that ends with the owner's own polite line, *"Brokers please excuse."* Brand surfaces (homepage, city pages) are drenched in that dusk indigo and lit by sodium-lamp amber. Working surfaces (search, listing, post-property, dashboards) step into clean white daylight so prices and photos read in the sun on a phone.

The system is calm and exact. Motion is cinematic on the homepage, a single pinned scroll story, and nearly invisible everywhere else. Imagery is real: owners' photos and drawn objects from Indian streets (water tanks, balcony grills, neem trees, the TO-LET board, a rubber stamp). It rejects NoBroker's cluttered card-in-card stacks and upsell popups, the red-and-yellow classifieds of 99acres and MagicBricks, fake urgency timers, the cream-and-terracotta AI look, and generic SaaS landing kits.

**Key Characteristics:**
- Two worlds: drenched dusk for brand pages, pure white daylight for product pages.
- One type family (Anek Latin) worked hard through its width axis.
- Money is always typeset as data: rent + maintenance, then the deposit, with tabular numerals.
- Flat surfaces. Depth comes from the photography and from motion, not from shadows.

## 2. Colors

A dusk-indigo field lit by a single sodium-lamp amber, with pure white for working surfaces.

### Primary
- **Dusk Sky** (oklch(0.27 0.09 266)): the drenched background of the homepage hero and brand sections. White text on it reaches 12:1 or better.
- **Gate Indigo** (oklch(0.50 0.16 266)): primary buttons and links on white surfaces. Text on it is always white.

### Secondary
- **Sodium Streetlight** (oklch(0.82 0.15 78)): the only warm color. Used for the rocket's flame, the active map pin, the savings figure and the primary button on dusk. Text on it is Dusk Sky. Never use it as a large fill on white.

### Tertiary
- **Courtyard Verified** (oklch(0.50 0.12 155) on oklch(0.95 0.04 155)): only for the "Verified owner" seal and the owner-confirmed freshness badge.

- **Error Red** (oklch(0.52 0.19 27)): form errors and destructive actions only. It shares the board paint's hue on purpose but is its own token.

### Neutral
- **Daylight** (oklch(1 0 0)): body background of every product surface. Pure white, no cream.
- **Shade** (oklch(0.97 0.006 266)): filter bars, the map sheet, quiet bands.
- **Hairline** (oklch(0.91 0.01 266)): row dividers and input strokes.
- **Ink** (oklch(0.22 0.025 266)): body text, at least 7:1 on Daylight.
- **Muted Ink** (oklch(0.47 0.02 266)): secondary text, at least 4.5:1 on Daylight.

### Named Rules
**The Two Worlds Rule.** Dusk belongs to brand pages, Daylight to product pages. A search results screen is never drenched; a homepage hero is never white.

**The One Lamp Rule.** Streetlight amber covers no more than 5% of any screen. It marks the one thing that matters on that screen.

**The Illustration-Only Rule.** Board Enamel and Board Paint exist only inside the TO-LET board illustration. They are never UI colors.

## 3. Typography

**Display Font:** Anek Latin (Ek Type, Mumbai), variable width 75–125 and weight 100–800, falling back to system-ui
**Body Font:** Anek Latin at normal width
**Label/Mono Font:** none. Prices use Anek with tabular numerals, never a monospace face.

**Character:** a single Indian-designed family whose expanded widths carry the calm authority of a building nameplate. The normal width reads easily at small sizes on cheap screens. Its Indic-script companions keep localization in the same voice.

### Hierarchy
- **Display** (500, clamp(2.75rem → 5.5rem), 0.98, wdth 112): homepage and city hero statements only. Use `text-wrap: balance`.
- **Headline** (500, clamp(1.75rem → 2.75rem), 1.05, wdth 108): section heads on brand pages and page titles on product pages.
- **Title** (600, 1.25rem, 1.2): listing titles, panel heads.
- **Body** (400, 1.0625rem, 1.55): descriptions and long text, capped at 68ch. Use `text-wrap: pretty`.
- **Label** (500, 0.875rem, 1.3, sentence case): filter labels, facts, metadata. Never all caps.
- **Price** (600, 1.375rem, tabular numerals): every ₹ figure, plus area and distance figures.

### Named Rules
**The Nameplate Rule.** Hierarchy comes from width and weight inside one family, never from adding a second display face.

**The No-Costume Rule.** Monospace is prohibited for prices and data. Numbers are Anek with `tnum`.

## 4. Elevation

The system is flat. Product surfaces separate content with Hairline dividers and Shade bands, not shadows. On the map, the only shadow is a small, tight pin lift on hover or selection. On brand pages, depth comes from layered SVG scenery and parallax inside the scroll story.

### Shadow Vocabulary
- **Pin lift** (`box-shadow: 0 6px 16px -6px oklch(0.22 0.025 266 / 0.35)`): the active or hovered map price pin, and only that.
- **Sheet edge** (`box-shadow: 0 -8px 24px -12px oklch(0.22 0.025 266 / 0.25)`): the mobile bottom sheet over the map.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest. A shadow appears only for something floating over a map.

## 5. Components

### Buttons
- **Shape:** fully rounded pill (999px).
- **Primary:** Gate Indigo with white text, 14px × 28px padding, label weight 600.
- **On dusk:** Sodium Streetlight with Dusk Sky text. Used only for the hero search action.
- **Hover / Focus:** background deepens over 180ms with ease-out-quint. The focus ring is 2px Streetlight offset 2px on dusk, and 2px Gate Indigo offset 2px on Daylight. Pressing scales to 0.97 over 100ms.

### Search field
- **Style:** a 56px Daylight pill with an Ink placeholder at 4.5:1 or better. The locality suggestions open in a popover, never in a clipped container.
- **Focus:** a 2px Gate Indigo ring. The field never resizes on focus.

### Listing row
- **Structure:** photo (4:3, with a thumbhash placeholder) → Price block (rent + maintenance as one figure, deposit beneath in Muted Ink) → title → a facts line (BHK, carpet area, furnishing, floor) → freshness badge.
- **Container:** none. Rows are separated by a Hairline divider. No card, no nested boxes.

### Verified seal
- A rubber-stamp roundel in Courtyard Verified, used on the listing page and in the hero story. In rows it shrinks to an inline badge.

### Signature: the TO-LET board
- A hand-painted SVG board (Board Enamel field, Board Paint lettering) on the homepage hero gate. It reads "TO-LET · 2 BHK · Brokers please excuse." It is the brand's one joke and appears nowhere else. "TO-LET" is Anek at width 75, weight 800 (sign-painter block caps), and the excuse line is Kalam 700, a handwriting face from the Indian Type Foundry. Kalam is never used outside illustrations.

## 6. Do's and Don'ts

### Do:
- **Do** show rent + maintenance as one monthly figure, with the deposit right beside it, everywhere a price appears.
- **Do** keep Streetlight amber to 5% of a screen or less (the One Lamp Rule).
- **Do** use ease-out-quint (cubic-bezier(0.22, 1, 0.36, 1)) at 180–250ms for every UI transition.
- **Do** confine bounce (GSAP CustomBounce, strength 0.32, scroll-scrubbed) to the homepage story objects: amenity tags and keys.
- **Do** give every animation a reduced-motion end state that shows the same content.
- **Do** use real owner photos and drawn Indian street objects.

### Don't:
- **Don't** build NoBroker's cluttered card-in-card stacks, upsell popups or aggressive callbacks.
- **Don't** use the red-and-yellow classified-portal look of 99acres or MagicBricks.
- **Don't** use fake urgency: countdown timers, "12 people viewing", sticky chatbots.
- **Don't** use the cream-and-terracotta AI look: a warm beige body background, a serif display, a clay accent.
- **Don't** use generic SaaS landing kits: identical icon-card grids, gradient text, an eyebrow label above every section.
- **Don't** use bounce or elastic easing on buttons, menus, drawers, forms or anything a user operates.
- **Don't** use Lenis smooth scroll on search or map pages, where it fights map wheel and scroll panels.
- **Don't** use a monospace font for prices, or all-caps labels.
