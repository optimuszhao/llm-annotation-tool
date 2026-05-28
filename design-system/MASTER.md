# LLM Annotation Tool Design System

> Purpose: Project-level UI/UX rules for building the annotation tool.

## Product Type

This product is a data-dense AI evaluation and annotation workbench.

Primary user goal:

- Import scenario resources
- Configure datasets and prompts
- Run large annotation jobs
- Inspect row-level results
- Find errors and improve prompts

Primary screen type:

- Enterprise data cockpit
- Heavy table workspace
- Real-time task monitor

## Visual Direction

Recommended style:

- Data-Dense Dashboard
- Real-Time Monitoring
- Minimalism & Swiss Style
- Soft UI Evolution

The UI should feel precise, calm, and premium. The baseline direction is a refined data cockpit: light surface, compact controls, fixed workflow navigation, metric strip, dense list area, and clear TP/TN/FP/FN status badges.

## Layout Rules

- Use one app shell with three top workflow tabs: `开始使用工具`, `数据集与方案管理`, `标注工作台`.
- Keep the top navigation fixed.
- Treat `标注工作台` as the main product surface.
- Give the data table the largest area on the page.
- Keep metrics directly above the table.
- Keep bulk actions and filters close to the table.
- Use right-side drawers for row detail, resource detail, and editing flows.
- Use modal lists for resource cards in the scenario management page.

## Scenario Management Page

The second workflow tab uses scenario-first organization.

Structure:

- Secondary scenario tabs below the main page heading.
- Empty state asks the user to add the first scenario.
- The right side of scenario tabs contains a plus button for quick scenario creation.
- Each scene shows four resource cards: dataset, Prompt, knowledge base, error set.
- Clicking a card opens a modal list for that resource type.
- Clicking a list item opens detail or edit mode.

Card behavior:

- Show count, last updated time, and current status.
- Provide one primary action per card.
- Use compact secondary actions.
- Show import progress inside the card when a resource is being imported.

## Annotation Workbench

The workbench is optimized for thousands of rows.

Table rules:

- Use Tabulator for the main table.
- Enable remote pagination or remote virtual scrolling.
- Keep the action column pinned to the right.
- Keep status visually scannable with compact badges.
- Show large fields as previews in the table.
- Load full large fields only in the detail drawer.
- Update rows incrementally from SSE events.

Default status colors:

- TP: green success badge
- TN: blue neutral badge
- FP: amber warning badge
- FN: red error badge
- Running: amber animated state
- Pending: gray badge
- Failed: red badge

## Motion

Use motion only for workflow clarity.

Allowed motion:

- Drawer slide in/out
- Modal enter/exit
- Metric number changes
- Row status transition
- Task progress movement

Motion timing:

- Fast UI feedback: 120-180ms
- Drawer/modal motion: 220-300ms
- Progress and live status: calm continuous motion

Respect `prefers-reduced-motion`.

## Components

Core components:

- Top workflow tabs
- Scenario tabs
- Resource summary cards
- Resource list modal
- Detail drawer
- Metric strip
- Bulk action bar
- Tabulator data table
- Status badge
- Task confirmation modal
- Import progress indicator

## Typography

Use compact, legible typography.

Recommended local font strategy:

- Use local bundled font files when available.
- Use system fallback only as backup.
- Keep table text at 12-14px.
- Keep metric labels small and uppercase-style.
- Keep page headings restrained.

## Accessibility Checklist

Before delivery:

- Interactive elements have visible hover states.
- Keyboard focus states are visible.
- Text contrast reaches WCAG AA for core content.
- Buttons and tabs have accessible labels.
- Modal and drawer close actions are clear.
- Loading and task states are visible without relying only on color.
- Table remains usable at 1366px width.
- Core pages remain readable at tablet width.

## Implementation Constraints

The project uses a no Node/npm build path.

Frontend stack:

- HTML
- Tailwind CSS as local CSS
- Tabulator
- GSAP
- Optional Vue 3 Global

Runtime stack:

- FastAPI serves frontend static files.
- SQLite stores imported data.
- Backend owns parsing, filtering, pagination, metrics, and annotation tasks.
- Frontend renders current views and receives incremental SSE updates.
