---
name: EvalScope Console
colors:
  accent: "#2563eb"
  accent-dark: "#1d4ed8"
  accent-dim: "rgba(37, 99, 235, 0.14)"
  purple: "#818cf8"
  bg: "#09090b"
  bg-deep: "#0d0d0f"
  bg-card: "#111113"
  bg-card2: "#1b1b1f"
  surface-glass: "rgba(17, 17, 19, 0.88)"
  text: "#f4f4f5"
  text-muted: "#a1a1aa"
  text-dim: "#71717a"
  on-filled: "#ffffff"
  border: "#27272a"
  border-md: "#3f3f46"
  border-strong: "#52525b"
  success: "#10b981"
  warning: "#f59e0b"
  danger: "#ef4444"
  info: "#60a5fa"
  pass: "rgb(45,104,62)"
  fail: "rgb(151,31,44)"
  bg-light: "#f8fafc"
  bg-deep-light: "#f4f6f8"
  bg-card-light: "#ffffff"
  bg-card2-light: "#f1f5f9"
  surface-glass-light: "rgba(255, 255, 255, 0.90)"
  accent-light: "#1d4ed8"
  accent-dim-light: "rgba(29, 78, 216, 0.09)"
  text-light: "#0f172a"
  text-muted-light: "#475569"
  text-dim-light: "#64748b"
  border-light: "#e2e8f0"
  border-md-light: "#cbd5e1"
  border-strong-light: "#94a3b8"
  compare-0: "#818cf8"
  compare-1: "#34d399"
  compare-2: "#fbbf24"
  bubble-user: "#818cf8"
  bubble-bot: "#34d399"
  bubble-tool: "#fbbf24"
  bubble-reasoning: "#34d399"
  bubble-system: "rgba(148,163,184,1)"
typography:
  display-xl:
    fontFamily: System Sans
    fontSize: 24px
    fontWeight: 700
    letterSpacing: -0.02em
    lineHeight: 1.2
  title-md:
    fontFamily: System Sans
    fontSize: 16px
    fontWeight: 700
    letterSpacing: normal
    lineHeight: 1.25
  body-sm:
    fontFamily: System Sans
    fontSize: 14px
    fontWeight: 400
    letterSpacing: normal
    lineHeight: 1.5
  body-sm-strong:
    fontFamily: System Sans
    fontSize: 14px
    fontWeight: 500
    letterSpacing: normal
    lineHeight: 1.5
  body-xs:
    fontFamily: System Sans
    fontSize: 12px
    fontWeight: 400
    letterSpacing: normal
    lineHeight: 1.5
  label-xs:
    fontFamily: System Sans
    fontSize: 12px
    fontWeight: 600
    letterSpacing: 0.05em
    textTransform: uppercase
    lineHeight: 1.4
  table-xs:
    fontFamily: System Sans
    fontSize: 12px
    fontWeight: 600
    letterSpacing: 0.05em
    textTransform: uppercase
    lineHeight: 1.4
  caption-mono:
    fontFamily: System Mono
    fontSize: 12px
    fontWeight: 400
    letterSpacing: normal
    lineHeight: 1.4
  code:
    fontFamily: System Mono
    fontSize: 13px
    fontWeight: 400
    letterSpacing: normal
    lineHeight: 1.5
  button-sm:
    fontFamily: System Sans
    fontSize: 12px
    fontWeight: 500
    letterSpacing: normal
    lineHeight: 1.4
  button-md:
    fontFamily: System Sans
    fontSize: 14px
    fontWeight: 500
    letterSpacing: normal
    lineHeight: 1.4
  button-lg:
    fontFamily: System Sans
    fontSize: 16px
    fontWeight: 500
    letterSpacing: normal
    lineHeight: 1.4
fontFamily:
  sans: '"Avenir Next", "PingFang SC", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif'
  mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", "DejaVu Sans Mono", "Courier New", monospace'
rounded:
  none: 0px
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 20px
  2xl: 24px
  3xl: 32px
  4xl: 48px
  5xl: 64px
shadows:
  sm: "0 1px 2px rgba(0, 0, 0, 0.32)"
  md: "0 8px 24px rgba(0, 0, 0, 0.34)"
  lg: "0 18px 48px rgba(0, 0, 0, 0.42)"
  glow: "0 0 0 3px rgba(37, 99, 235, 0.18)"
  glow-soft: "0 0 0 2px rgba(37, 99, 235, 0.14)"
  sm-light: "0 1px 2px rgba(15, 23, 42, 0.06)"
  md-light: "0 8px 24px rgba(15, 23, 42, 0.08)"
  lg-light: "0 18px 48px rgba(15, 23, 42, 0.14)"
  glow-light: "0 0 0 3px rgba(29, 78, 216, 0.14)"
  glow-soft-light: "0 0 0 2px rgba(29, 78, 216, 0.10)"
gradients:
  brand: "linear-gradient(135deg, #2563eb 0%, #0f766e 100%)"
  accent: "linear-gradient(135deg, #0F9C7E 0%, #06b6d4 100%)"
  surface: "linear-gradient(135deg, rgba(37,99,235,0.08) 0%, rgba(15,118,110,0.04) 100%)"
  nav-hairline: "linear-gradient(90deg, transparent 0%, #2563eb 50%, transparent 100%)"
transition:
  fast: "150ms cubic-bezier(0.4, 0, 0.2, 1)"
  base: "250ms cubic-bezier(0.4, 0, 0.2, 1)"
  slow: "400ms cubic-bezier(0.4, 0, 0.2, 1)"
breakpoints:
  sm: 640px
  md: 768px
  lg: 1024px
  xl: 1280px
container:
  max-width: 1600px
  page-padding-x: 16px
  page-padding-y: 20px
score-formula:
  foreground: "hsl(score * 120, var(--score-fg-s), var(--score-fg-l))  # dark: 70%/45%, light: 85%/32%"
  background: "RGB-interpolated translucent companion, alpha * var(--score-bg-a-mul)  # dark: x1, light: x1.6"
  description: "0 -> red, 0.5 -> yellow, 1 -> green. Theme-scoped saturation, lightness and alpha keep every score legible."
---

# EvalScope Console Design System

## Principles {#principles}

EvalScope v6 is a local-first Chinese evaluation workbench. Its interface should feel like a mature observability product: compact, predictable and optimized for scanning runs, traces and metrics. Langfuse is an information-architecture and interaction reference only. EvalScope does not copy Langfuse source code, branding or enterprise-only implementation.

The v6 hierarchy is project-first:

`项目列表 -> 项目 -> 总览 / 执行轨迹 / 评测对象 / 数据集 / 评估器 / 评测任务 / 接入与设置`

Only implemented routes may appear as normal navigation items. Future capabilities remain hidden or carry an explicit `设计中` or `Demo` label. A visible empty route must never imply that a backend capability exists.

### Page hierarchy

- Every route renders exactly one `h1` in the shared page header.
- Major content regions use `h2`; card names and table groups use `h3` only when nested under a region.
- Breadcrumbs express location and never duplicate the page title as a second heading.
- The page header owns the title, one concise description and the primary action.
- Evaluation quality and performance are task semantics within `评测任务`, not competing top-level products.

### Visual posture

- Light mode uses a cool slate canvas, white working surfaces and concrete neutral borders.
- Dark mode uses neutral zinc surfaces. It is not a purple-tinted theme.
- Cobalt is reserved for primary actions, keyboard focus and the active navigation edge.
- Semantic colors represent data meaning. Decorative gradients must not carry navigation hierarchy.
- Motion is restrained to route entry, drawers and state transitions; dense rows do not lift or bounce.

## Design Tokens {#tokens}

Runtime CSS custom properties in `evalscope/web/src/index.css` are the source of truth. Run `npm run design:tokens` after changing token values and `npm run drift` before merging.

### Color

| Role | Dark | Light | Usage |
|---|---|---|---|
| Canvas | `#09090b` | `#f8fafc` | Application background |
| Working surface | `#111113` | `#ffffff` | Cards, tables, dialogs |
| Sunken surface | `#0d0d0f` | `#f4f6f8` | Inputs and nested wells |
| Primary text | `#f4f4f5` | `#0f172a` | Headings and body |
| Muted text | `#a1a1aa` | `#475569` | Secondary labels |
| Border | `#27272a` | `#e2e8f0` | Default hairline |
| Accent | `#2563eb` | `#1d4ed8` | Action, focus, active edge |

Do not use `purple` as the global action color. Purple remains available only for existing compare slots and domain-specific visualization accents.

### Typography

The Chinese-first local stack is:

`"Avenir Next", "PingFang SC", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif`

Technical values use the local monospace stack. No remote font request is allowed. Page titles use 24px/700, section titles 16px/700, body text 14px and supporting text 12px. Uppercase labels are reserved for compact technical metadata; Chinese section headings stay sentence case.

### Spacing and density

- Global top bar: 48px.
- Expanded sidebar: 236px; collapsed sidebar: 68px.
- Desktop page content: maximum 1600px with 20px vertical rhythm.
- Standard controls: at least 36px high; compact table controls: at least 32px.
- Cards use 12px radius. Buttons use 8px radius by default.
- Prefer borders and spacing over large shadows for separation.

## Components {#components}

### Workbench shell

The shell consists of a persistent project-aware sidebar, a 48px breadcrumb top bar and one scrollable content region. Desktop navigation is fixed; mobile navigation moves into a dismissible drawer. The project selector sits above project navigation and sends users back to `/projects` without losing the mental model of the current workspace.

### Page header

The shared page header is the only owner of the route `h1`. It contains a short description and, when available, one real primary action. Secondary actions belong in the content toolbar, not beside the title unless they apply to the whole page.

### Sidebar navigation

Navigation is grouped by user workflow: `观察`, `评测`, `优化`, `接入`. The active item uses a neutral surface plus a cobalt leading edge. Color-filled pills, oversized cards and promotional copy are prohibited in the primary navigation.

### Data table

Tables use sticky headers where useful, 12px essential labels, row-level status, worker-backed pagination for large collections and a detail drawer or route for drill-down. Never render an unbounded 100,000-row collection into the DOM.

### Path bar `{components.path-bar}`

The path bar identifies the local project run directory and exposes only valid filesystem actions. Once project storage is wired, it must resolve from the current project instead of a global browser preference.

### KPI strip `{components.kpi-strip}`

KPI values share a neutral surface. Color belongs to status or metric meaning, not to arbitrary per-card decoration. The strip collapses to a two-column grid on narrow screens.

### Empty state `{components.empty-state}`

An empty state names the missing resource, explains the next useful action and links to a real route or opens a working dialog. It must not advertise an unavailable API.

### Dialog and drawer

Destructive or costly actions require explicit confirmation. Two-step imports and project creation show a preview before commit. Drawers support `Escape`, focus restoration and a visible close control.

### Score badge `{components.score-badge}` and score ring `{components.score-ring}`

Scores from 0 to 1 use the shared red-to-yellow-to-green formula. Boolean pass/fail uses semantic tokens. A score component always exposes its numeric value in text and must not rely on color alone.

### Chat bubble `{components.chat-bubble}`

Trace roles use stable domain colors for user, assistant, tool, reasoning, environment and system records. Role color is secondary to the textual role label and sequence order.

## Metrics {#metrics}

### Score semantics

- `0` means failing or fully incorrect.
- `0.5` means partial or uncertain.
- `1` means passing or fully correct.
- Missing values display as missing, never as zero.
- Aggregates state their denominator and excluded records.

### Run status

The shared status vocabulary is `待运行`, `运行中`, `暂停中`, `已完成`, `失败`, `已取消`. Progress includes completed count, total count and failures. Resuming a run preserves accepted records and schedules only remaining records.

### Performance metrics

Latency, TTFT, TPOT and token usage retain distinct chart colors. Quality scores and performance measures must not be mixed into one unlabeled aggregate.

## Responsive and Accessibility

- At widths below 768px, the sidebar becomes a drawer and the page action may expand to full width.
- All interactive controls are keyboard reachable and show a 2px accent focus outline.
- Normal text targets WCAG AA contrast; essential labels never use the dim token.
- Dialogs have accessible names, trap focus and restore focus on close.
- Charts expose a table or textual summary.
- Reduced-motion preferences disable non-essential transitions.

## Decisions {#decisions}

### DR-001: Project-first routes

All workbench routes use `/project/:projectId/...`. Legacy global routes redirect to the first valid local project or `/projects`. Project identity must eventually scope both UI navigation and filesystem data.

### DR-002: Honest capability visibility

Routes and actions appear as available only when their backing behavior exists and has a testable acceptance path. This prevents demo chrome from becoming a false product baseline.

### DR-003: Langfuse as interaction reference

Use the compact sidebar, project switcher, breadcrumbs, title/action header, tabs and drill-down patterns as reference. Do not copy source, brand assets or enterprise-only code. Record every upstream source and license boundary in `docs/upstream-sources.md`.

### DR-004: Local-first storage boundary

The browser stores lightweight preferences only. Datasets, traces, runs and artifacts live in a project filesystem directory through the service layer. Large collections use streaming, pagination and worker-backed execution rather than IndexedDB or full in-memory rendering.

### DR-005: Cost safety

Preview and confirmation precede imports, generation and AI judging. Tests and CI use mocks. No paid model evaluation starts without an explicit user action.

### DR-006: Evidence before status

A capability may be marked `已验证` only when it has code evidence, automated test evidence and a user-path acceptance artifact such as a screenshot or Playwright trace.

### Do

- Keep one clear H1 and use H2 for major sections.
- Preserve project context through every internal link.
- Use neutral surfaces for dense data and cobalt for actions.
- Test real source files and real browser paths.
- Keep local data paths visible and reversible.

### Do not

- Do not restore the v5 warm-cream and violet-glow visual language.
- Do not expose blank future routes as finished navigation.
- Do not put full datasets or secrets in URLs, logs or browser storage.
- Do not start evaluation automatically after import.
- Do not use color as the only carrier of state.
