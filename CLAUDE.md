# GraphCan — CAN Bus Log Visualizer

## Project Concept

GraphCan is a web application for visualizing CAN (Controller Area Network) bus logs.
The goal is to provide flexible, modular tools for analyzing CAN data: time-series curves,
signal tables, filters, decoders, and more.

### Core Features (roadmap)
- Import CAN log files (CSV, .asc, .blf, .trc formats)
- Parse and decode CAN frames (raw hex → named signals via DBC files)
- Time-series visualization (line charts, scatter plots)
- Signal table with filtering and search
- Multi-panel layout (user can arrange views)
- Zoom, pan, cursor sync across charts
- Export / screenshot

## Tech Stack
- **Framework**: React 18 with TypeScript
- **Build tool**: Vite
- **Charting**: Recharts (beginner-friendly) → migrate to uPlot or D3 if perf needed
- **Styling**: Tailwind CSS
- **State management**: Zustand (lightweight, easy to learn)
- **File parsing**: custom parsers in pure TS

## Pedagogical Approach — IMPORTANT

The user is learning React through this project. Act as a **professor**, not just a coder:

1. **Step by step** — never implement more than one feature at a time without the user's go-ahead.
2. **Explain before coding** — before writing code, briefly explain the React concept being introduced
   (components, props, hooks, state, context, etc.) in plain terms.
3. **Ask before choosing** — when there's a meaningful design decision, present 2-3 options with
   trade-offs and let the user choose.
4. **Point to the learning** — after each feature, summarize what React/TS concept was practiced.
5. **No magic** — avoid advanced patterns (HOCs, render props, complex generics) until the user
   has mastered the basics. Introduce complexity gradually.
6. **Language** — the user communicates in French; respond in French. All code, UI text, comments, and variable names must be in English (portfolio/demo project for job interviews).

## Session Rules
- Always check this file at the start of a session for context.
- Keep CLAUDE.md updated as the project evolves (new features, decisions, stack changes).
- Never scaffold a full app in one shot — build incrementally, feature by feature.
- Prefer small, focused components over large monolithic ones.
