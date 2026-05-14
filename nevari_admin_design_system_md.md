# Mint Glassmorphism Dashboard Design System

Based on your uploaded dashboard design, this system follows a **soft clinical glassmorphism aesthetic** with:
- Rounded UI surfaces
- Pastel analytics colors
- Deep teal primary actions
- Frosted translucent containers
- Compact typography
- Soft shadow layering

---

# Design Principles

## 1. Soft Glass Surfaces
Use semi-transparent panels with blur and inner highlights.

```css
background: rgba(255,255,255,0.35);
backdrop-filter: blur(16px);
border: 1px solid rgba(255,255,255,0.5);
```

---

## 2. Pastel Data Visualization
Analytics cards use emotional pastel colors instead of harsh saturation.

| Usage | Color |
|---|---|
| Success / Growth | Lime |
| Activity | Mint |
| Warning | Rose |
| Info | Violet |
| Engagement | Teal |
| Finance | Apricot |

---

## 3. Rounded Everything
Nothing is sharp.

| Element | Radius |
|---|---|
| Small Controls | 8px |
| Inputs | 999px |
| Cards | 22px |
| Panels | 26px |
| App Shell | 30px |

---

# Color System

## Core Colors

| Token | Value | Usage |
|---|---|---|
| `--color-primary` | `#04282A` | Main CTA |
| `--color-primary-hover` | `#06383A` | Hover |
| `--color-primary-soft` | `#D7F2F1` | Soft states |
| `--color-bg-page` | `#A8C4C2` | Page background |
| `--color-bg-app` | `#EAFAFA` | Main app |
| `--color-bg-panel` | `#ECF8F8` | Panels |
| `--color-bg-card` | `#EAF9F8` | Cards |

---

## Text Colors

| Token | Value |
|---|---|
| `--color-text-main` | `#04282A` |
| `--color-text-muted` | `#566968` |
| `--color-text-subtle` | `#8AA09F` |

---

## Accent Palette

| Token | Value |
|---|---|
| `--color-accent-lime` | `#D7EDB5` |
| `--color-accent-mint` | `#A2D9DA` |
| `--color-accent-rose` | `#ECB3B7` |
| `--color-accent-violet` | `#B1BBEB` |
| `--color-accent-pink` | `#E4B0DA` |
| `--color-accent-teal` | `#7DD8CF` |
| `--color-accent-apricot` | `#F0C99F` |

---

# Typography System

## Font Family

```css
font-family:
Inter,
Manrope,
ui-sans-serif,
system-ui,
sans-serif;
```

---

## Type Scale

| Token | Size |
|---|---|
| `xs` | 11px |
| `sm` | 12px |
| `md` | 14px |
| `lg` | 16px |
| `xl` | 22px |
| `2xl` | 26px |

---

## Font Weights

| Token | Weight |
|---|---|
| Regular | 400 |
| Medium | 500 |
| Semibold | 600 |
| Bold | 700 |

---

# Spacing System

| Token | Value |
|---|---|
| `space-1` | 4px |
| `space-2` | 8px |
| `space-3` | 12px |
| `space-4` | 16px |
| `space-5` | 20px |
| `space-6` | 24px |
| `space-8` | 32px |
| `space-10` | 40px |

---

# Radius System

| Token | Value |
|---|---|
| `radius-xs` | 8px |
| `radius-sm` | 12px |
| `radius-md` | 16px |
| `radius-lg` | 22px |
| `radius-xl` | 30px |
| `radius-pill` | 999px |

---

# Shadow System

## Soft App Shadow

```css
0 18px 45px rgba(4, 40, 42, 0.08)
```

## Card Shadow

```css
0 12px 28px rgba(4, 40, 42, 0.06)
```

## Inset Highlight

```css
inset 0 1px 0 rgba(255,255,255,0.55)
```

---

# Component System

# Buttons

## Primary Button

### Characteristics
- Dark teal
- Full pill radius
- Bold typography
- Floating shadow

```css
.button-primary {
  height: 38px;
  padding: 0 18px;
  border-radius: 999px;
  background: #04282A;
  color: white;
}
```

---

## Secondary Pill Button

```css
.pill {
  background: rgba(255,255,255,0.38);
  border: 1px solid rgba(4,40,42,0.08);
}
```

---

# Cards

## Metric Cards

### Structure
- Gradient background
- Rounded corners
- Floating analytics decoration
- Strong numeric emphasis

### Layout
```txt
Icon | Menu
Label
Large Number
Trend
Mini chart
```

---

# Navigation

## Sidebar Style
- Frosted background
- Compact nav pills
- Active state = dark teal
- Circular icons

---

## Active Nav State

```css
background: #04282A;
color: white;
```

---

# Inputs

## Search Inputs

### Characteristics
- Pill shape
- Soft transparent fill
- Minimal border
- Embedded icon aesthetic

---

# Tables

## Style
- Minimal borders
- Airy spacing
- Rounded pagination
- Inline quantity steppers

---

# Charts Style Guide

## Donut Charts
Use:
- Pastel segments
- Floating stat bubbles
- Frosted center

---

## Bar Charts
Use:
- Rounded vertical bars
- Pastel fills
- Pattern overlays
- Floating tooltip cards

---

# Layout System

## Desktop Grid

```txt
Sidebar: 210px
Main Content: Flexible
```

---

## Dashboard Grid

```txt
Charts Layout:
0.78fr / 1.22fr
```

---

# Motion Guidelines

## Hover Behavior

### Cards
```css
transform: translateY(-2px);
transition: 220ms ease;
```

### Buttons
```css
filter: brightness(1.04);
```

---

# Responsive Rules

## Tablet
- Hide sidebar
- Stack grids
- Convert topbar to vertical

## Mobile
- Single column cards
- Horizontal table scrolling
- Reduced padding

---

# Design Language Summary

This system can be described as:

> “Pastel enterprise glassmorphism with clinical calmness.”

It combines:
- SaaS dashboard structure
- Healthcare-inspired softness
- Neo-glassmorphism
- Rounded fintech UI patterns
- Modern analytics visualization

---

# Suggested Naming

Possible design system names:
- MintFlow
- FrostMint
- NeoClinic UI
- AquaGlass
- SoftMetrics
- PastelCore
- MintShell

