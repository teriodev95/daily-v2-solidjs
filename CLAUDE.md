# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Daily Check - A modern daily report management application built with SolidJS, TypeScript, Tailwind CSS, and local storage. The app allows users to create structured daily reports with auto-save functionality and PDF export capabilities.

**Working Directory**: The actual application code is in `solidjs-daily-app/` subdirectory, not the root.

## Development Commands

All commands should be run from the `solidjs-daily-app/` directory:

```bash
cd solidjs-daily-app

# Development
npm run dev          # Start dev server (http://localhost:3000)
npm start            # Alternative to npm run dev

# Build
npm run build        # Build for production (outputs to dist/)
npm run serve        # Preview production build
```

## Architecture

### Core Technologies
- **SolidJS** - Reactive framework (JSX uses `preserve` mode, import source is `solid-js`)
- **TypeScript** - Strict mode enabled, ESNext target
- **Vite** - Build tool and dev server
- **Tailwind CSS + DaisyUI** - Styling with custom iOS theme
- **jsPDF** - PDF generation for reports

### Data Storage
- **LocalStorage** - Primary storage mechanism via `utils/database.ts`
- **Key**: `solidjs-daily-report`
- All data persists in browser localStorage with auto-save every 1.5 seconds after user stops typing

### Project Structure
```
solidjs-daily-app/src/
├── App.tsx                   # Root component with header, theme management
├── components/
│   ├── DailyForm.tsx         # Main form with drag-and-drop, auto-save
│   └── ui/                   # Reusable UI components (Button, Card, Modal, etc.)
├── features/
│   └── formatos-pdf/         # PDF generation feature
│       ├── components/       # FormatosPDFModal, FormatoCard
│       ├── services/         # PDF generation services (pruebaSolimPDF.ts)
│       ├── templates/        # PDF templates
│       └── types/            # Feature-specific types
├── types/
│   └── index.ts              # Core types (DailyReport, WeekGoal, AppState)
└── utils/
    ├── database.ts           # LocalStorage operations
    ├── dateUtils.ts          # Date formatting, week calculations
    ├── formatUtils.ts        # Report formatting, clipboard
    └── pdfGenerator.ts       # PDF generation utilities
```

### Key Data Structures

**DailyReport** (types/index.ts):
- `date`: Formatted date string
- `weekNumber`: Calculated week of year
- `completedYesterday`: Array of completed tasks
- `todayTasks`: Array of today's tasks
- `weekGoals`: Array of WeekGoal objects (text + completed status)
- `learning`: Learning notes
- `impediments`: Blockers/impediments
- `createdAt`, `updatedAt`: Timestamps

### Important Patterns

1. **Auto-save**: DailyForm uses debounced auto-save (1.5s delay) triggered on input changes, with immediate save on blur
2. **Drag-and-drop**: Tasks in `completedYesterday` and `todayTasks` support drag-and-drop reordering
3. **Dynamic inputs**: Textareas are created programmatically via `createTextarea()` function, not through Solid's reactive system
4. **Theme**: Fixed iOS theme (`data-theme="ios"`) with custom Tailwind config for iOS-style colors and shadows

### PDF Generation

- Two main PDF formats: Daily Objectives (`generateDailyObjectivesPDF`) and Daily Template (`generateDailyTemplatePDF`)
- SOLIM format feature in development (see `prompt.md` for requirements)
- PDF export accessible via header buttons

### Styling Approach

- Custom iOS-inspired design system with specific color palette (ios-gray, ios-blue, ios-green)
- System font stack: `-apple-system, BlinkMacSystemFont, San Francisco, Helvetica Neue`
- Responsive design with mobile/tablet/desktop layouts
- DaisyUI components with custom iOS theme configuration

### State Management

- Uses SolidJS signals and stores
- No external state management library
- Local component state for form data
- LocalStorage for persistence

## Development Notes

- Vite dev server runs on port 3000
- TypeScript uses `preserve` JSX mode specific to SolidJS
- Build target is ESNext (modern browsers only)
- No testing framework currently configured
- No linting commands available (README mentions them but not in package.json)
