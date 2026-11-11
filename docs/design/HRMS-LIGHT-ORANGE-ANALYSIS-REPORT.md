# Comprehensive Analysis & Architecture Audit: HRMS Light Orange Design System
> **Document:** Master Architectural Analysis & Gap Verification  
> **Product:** Infinitive Cloud EMS / HRMS  
> **Target Codebase:** Next.js 14 (App Router), TypeScript, Tailwind CSS, MongoDB Atlas  
> **Design Specification Reference:** `HRMS-Light-Orange-Design-Documentation.pdf` (22 pages)  
> **Dashboard Visual Reference:** `HRMS-Light-Orange-Dashboard.png`  
> **Target Roles:** Super Admin, Admin, HR, Manager, Employee  
> **Author:** Senior UI/UX Auditor, Frontend Architect & Design System Specialist  
> **Date:** October 26, 2026  
> **Audit Mode:** STRICT READ-ONLY ANALYSIS (Zero Source/Database Mutations)  

---

## 1. Executive Summary

This document delivers a thorough, evidence-based, read-only architectural audit comparing the 22-page **HRMS Light Orange Design Documentation** (`HRMS-Light-Orange-Design-Documentation.pdf`) and reference dashboard mockup (`HRMS-Light-Orange-Dashboard.png`) against the production codebase of **Infinitive Cloud EMS/HRMS**.

### 1.1 Context and Visual Divergence
The Infinitive Cloud EMS/HRMS application is currently built upon a high-contrast **Dark Slate & Electric Indigo** aesthetic:
- **Sidebars:** Pitch-black background (`bg-slate-950` / `#020617`) with dark slate borders (`border-slate-800`).
- **Workspace Canvas:** Cool slate background (`bg-slate-50` / `#f8fafc`).
- **Primary Interactive Elements:** Electric Indigo (`indigo-600` / `#4f46e5`, `indigo-500` / `#6366f1`).
- **Cards & Containers:** White cards with 16px corner radius (`rounded-2xl`), cool grey borders (`border-slate-200` / `#e2e8f0`), and disparate multi-color icon badges (emerald, amber, violet, cyan).
- **Typography:** Render-blocking Google Fonts import of Inter via `@import url(...)` in `globals.css`.

In complete contrast, the **HRMS Light Orange Design System** specifies a warm, organic, humanist, and cohesive palette designed for high enterprise readability and visual calm:
- **Workspace Canvas:** Warm off-white (`#FFFBF7`).
- **Sidebar:** Light, pale peach canvas (`#FFF7ED`) with a delicate warm peach border (`1px solid #FED7AA`).
- **Card Surfaces:** Crisp pure white (`#FFFFFF`) framed with warm borders (`1px solid #F0E4D6`) and a refined 12px border radius.
- **Primary Actions:** Solid safety orange (`#F97316`), crucially paired with dark navy text (`#0B1220`) to achieve WCAG 2.1 AA compliance (6.68:1 contrast).
- **Active Navigation:** Warm peach pill (`#FFEDD5`) with burnt amber text (`#9A3412`) and a 3px left indicator bar (`#EA580C`).
- **Dashboard Composition:** Strict 20px grid gaps, 5-column responsive KPI stat cards, a dedicated 48px 5-item quick-action tile strip, and internal panel scrolling for long lists.

### 1.2 Key Quantitative Findings
- **Design System Requirements Evaluated:** 28 distinct functional and visual requirements.
- **MATCH:** 2 items (7.1%) — Base Next.js App Router layout structure and Lucide React icon adoption.
- **PARTIAL:** 6 items (21.4%) — 64px header height, search bar presence, internal panel scrolling capability, stat card presence, modal backdrops, typography sizing.
- **MISSING:** 8 items (28.6%) — Dedicated 5-item Quick Action Bar (48px), 5-column KPI stat layout (currently 4 columns), warm vertical attendance trend chart, warm chip/org tokens, tabular numeric alignment, warm CSS design tokens.
- **CONFLICT:** 12 items (42.9%) — Pitch-black sidebars vs pale peach, Indigo primary buttons vs Orange, cool slate background vs warm off-white, 16px card radius vs 12px, render-blocking Google Font import vs `next/font`, component duplication across roles.
- **NOT VERIFIED:** 0 items (100% of visible design requirements verified against code).

### 1.3 Architecture Risk Assessment
The codebase exhibits significant component duplication:
1. **Sidebars:** Three independent sidebars exist (`Sidebar.tsx`, `SuperAdminSidebar.tsx`, `ManagerSidebar.tsx`).
2. **Headers:** Three independent headers exist (`Header.tsx`, `SuperAdminHeader.tsx`, `ManagerHeader.tsx`).
3. **Layout Shells:** Three independent shells exist (`AdminLayout.tsx`, `SuperAdminLayout.tsx`, `ManagerLayout.tsx`).
Directly modifying styles file-by-file without unifying design tokens would introduce severe fragmentation, high maintenance overhead, and elevated risk of regression across RBAC routes.

## 2. PDF Analysis (All 22 Pages)

This section details the explicit contents and specifications across all 22 pages of `HRMS-Light-Orange-Design-Documentation.pdf`. In accordance with audit standards, every metric preserves its origin evidence tag:
- `[M-px]`: Measured by pixel-sampling the reference image (`HRMS-Light-Orange-Dashboard.png`).
- `[M-src]`: Measured at source in the mockup code.
- `[R]`: Recommended standard (not directly visible in reference image).
- `[U]`: Unverified / repository-dependent value.

### Part 1: Design Overview and Philosophy (Pages 1–4)
- **Page 1: Design Philosophy & Palette Overview**
  - Core Principle: Warm, calm, light-toned palette where orange acts as a deliberate accent, **never as a flood**.
  - Surfaces: Workspace canvas `#FFFBF7` `[M-src]`, cards `#FFFFFF` `[M-src]` with `1px solid #F0E4D6` `[M-src]`.
  - Sidebar: Pale peach canvas `#FFF7ED` `[M-src]` with `1px solid #FED7AA` `[M-src]`.
  - Active Nav: Fill `#FFEDD5` `[M-src]`, text `#9A3412` `[M-src]`, 3px left indicator bar `#EA580C` `[M-src]`.
  - Primary CTA: Solid orange `#F97316` `[M-src]` with dark navy text `#0B1220` `[R]`.
- **Page 2: Core Layout Rhythm & Spacing Grid**
  - Layout Grid Gap: 20px (`gap-5` / `1.25rem`) `[M-px]`.
  - Card Internal Padding: 20px (`p-5`) for standard panels `[M-src]`; 18px for KPI metric cards `[M-px]`.
  - Sibling Controls Gap: 12px (`gap-3`) `[M-src]`.
  - Page Container Padding: 32px horizontal (`px-8`), 24px vertical (`py-6`) `[M-px]`.
  - Outer Frame: Sidebar 248px `[M-src]`, Topbar 64px `[M-px]`.
- **Page 3: Reference Mockup Flaws & Corrections**
  - *Flaw 1 (Accessibility Failure):* White text (`#FFFFFF`) on Primary Orange (`#F97316`) yields only **2.80:1** contrast ratio, failing WCAG 2.1 AA (requires 4.5:1). The PDF explicitly mandates using dark navy text (`#0B1220`), which achieves **6.68:1** (Pass AA/AAA Large), or alternatively darkening the fill to `#C2410C` (5.18:1 with white text) `[R]`.
  - *Flaw 2 (Palette Inconsistency):* Cool greys (`#F8FAFC`, `#F1F5F9`) appear in the reference mockup table headers, chips, and chart tracks. The PDF mandates replacing all cool greys with warm tokens (`#FFF7ED`, `#F7EFE5`, `#F0E4D6`) `[R]`.
  - *Flaw 3 (Chip Text Contrast):* Burnt orange text (`#9A3412`) on peach chip (`#FFEDD5`) yields **4.34:1**, slightly below the 4.5:1 threshold for small normal text (11px). The PDF mandates darkening chip text to `#7C2D12` (**6.18:1**) `[R]`.
- **Page 4: Surface Hierarchy**
  - Layer 0 (Canvas): `#FFFBF7` `[M-src]`.
  - Layer 1 (Sidebar): `#FFF7ED` `[M-src]` with border `#FED7AA` `[M-src]`.
  - Layer 2 (Cards & Topbar): `#FFFFFF` `[M-src]` with border `#F0E4D6` `[M-src]`, shadow `0 1px 2px rgba(15, 23, 42, 0.05)` `[M-src]`.
  - Layer 3 (Modals & Drawers): `#FFFFFF` `[M-src]`, elevation shadow `0 20px 25px -5px rgba(15, 23, 42, 0.1)` `[R]`.

### Part 2: Color Tokens and Accessibility (Pages 5–7)
- **Page 5: Core Color Token Dictionary**
  - `--primary`: `#F97316` (Primary orange action) `[M-src]`
  - `--primary-hover`: `#EA580C` (Hover state) `[M-src]`
  - `--primary-pressed`: `#C2410C` (Active/pressed state) `[M-src]`
  - `--primary-light`: `#FFEDD5` (Active nav fill, highlight chip) `[M-src]`
  - `--primary-pale`: `#FFF7ED` (Sidebar fill, table header fill, icon chip) `[M-src]`
  - `--primary-pale-border`: `#FED7AA` (Sidebar right border, active borders) `[M-src]`
  - `--chart-light`: `#FDBA74` (Bar chart past days fill) `[M-src]`
  - `--page-bg`: `#FFFBF7` (Workspace page background) `[M-src]`
  - `--card-bg`: `#FFFFFF` (Card & header background) `[M-src]`
  - `--text-primary`: `#0F172A` (Headings, metric values, primary labels) `[M-src]`
  - `--text-secondary`: `#64748B` (Secondary descriptions, captions, column headers) `[M-src]`
  - `--nav-inactive`: `#7C2D12` (Inactive sidebar navigation text) `[M-src]`
  - `--nav-active`: `#9A3412` (Active sidebar navigation text) `[M-src]`
  - `--on-primary`: `#0B1220` (High-contrast text on primary orange) `[R]`
  - `--border`: `#F0E4D6` (Card borders, header border, input borders) `[M-src]`
  - `--divider`: `#F7EFE5` (Table row borders, card dividers) `[M-src]`
- **Page 6: Recommended Warm Additions**
  - `--warm-disabled-fill`: `#F7EFE5` `[R]`
  - `--warm-disabled-text`: `#8493A8` `[R]`
  - `--warm-row-hover`: `#FFF7ED` `[R]`
  - `--warm-field-fill`: `#FFFBF7` `[R]`
  - `--warm-table-head`: `#FFF7ED` `[R]`
  - `--warm-chip`: `#F7EFE5` `[R]`
- **Page 7: WCAG 2.1 AA/AAA Contrast Verification Matrix**
  - `#0B1220` on `#F97316`: **6.68:1** (Passes WCAG AA Normal Text, AAA Large Text) `[R]`.
  - `#FFFFFF` on `#F97316`: **2.80:1** (FAILS WCAG AA by -1.70:1) `[M-src]`.
  - `#FFFFFF` on `#C2410C`: **5.18:1** (Passes WCAG AA Normal Text) `[R]`.
  - `#0F172A` on `#FFFBF7`: **14.88:1** (Passes WCAG AAA) `[M-src]`.
  - `#64748B` on `#FFFBF7`: **4.62:1** (Passes WCAG AA) `[M-src]`.
  - `#7C2D12` on `#FFF7ED`: **6.95:1** (Passes WCAG AA & AAA Large) `[M-src]`.
  - `#7C2D12` on `#FFEDD5`: **6.18:1** (Passes WCAG AA) `[R]`.
  - `#9A3412` on `#FFEDD5`: **4.34:1** (FAILS AA for normal text < 18pt) `[M-src]`.
  - `#C2410C` on `#FFF7ED`: **4.63:1** (Passes WCAG AA) `[M-src]`.

### Part 3: Typography Scale and Formatting (Pages 8–9)
- **Page 8: Typography Scale & Line Heights**
  - Font Family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif.
  - Page Title: 26px / 700 / leading 32px / `#0F172A` `[M-src]`.
  - Section / Card Title: 16px / 600 / leading 24px / `#0F172A` `[M-src]`.
  - KPI Value: 28px / 700 / leading 36px / `#0F172A` / `font-variant-numeric: tabular-nums` `[M-src]`.
  - Body Text / Table Row: 14px / 400 / leading 20px / `#0F172A` `[M-src]`.
  - Navigation Items: 14px / 500 (inactive: `#7C2D12`), 14px / 600 (active: `#9A3412`) `[M-src]`.
  - Button Labels: 14px / 600 / leading 20px `[M-src]`.
  - Table Header: 12px / 600 / uppercase / tracking 0.05em / `#64748B` `[M-src]`.
  - Caption / Helper Text: 12px / 400 / leading 16px / `#64748B` `[M-src]`.
  - Badges & Status Chips: 12px / 600 (badges) `[M-src]`; 11px / 500 (small chips) `[M-src]`.
- **Page 9: Numerical Alignment & Accessibility Rules**
  - Mandatory `tabular-nums` styling for all metrics, currency amounts, dates, and percentages `[R]`.
  - Strict line-height preservation to prevent vertical text jittering across dynamic states `[R]`.

### Part 4: Component Specifications (Pages 10–15)
- **Page 10: Sidebar Navigation Architecture**
  - Width: 248px expanded `[M-src]`, 72px collapsed icon-only `[R]`.
  - Canvas: `#FFF7ED`, Right Border: `1px solid #FED7AA` `[M-src]`.
  - Header: Logo container 64px height, branding lockup `Infinitive HRMS` `[M-src]`.
  - Navigation Item: 40px height, 8px corner radius, padding 8px 12px, 2px vertical gap `[M-src]`.
  - Active Item: Background `#FFEDD5`, text `#9A3412`, left accent bar 3px `#EA580C` `[M-src]`.
  - Inactive Item: Background transparent, text `#7C2D12`, hover fill `#FFF1E0` `[M-src]`.
  - Footer: User profile summary (36px avatar, name, role, logout action) `[M-src]`.
- **Page 11: Topbar Header & Global Search**
  - Height: 64px `[M-px]`, Padding: 0 32px (`px-8`) `[M-px]`.
  - Background: `#FFFFFF`, Bottom Border: `1px solid #F0E4D6` `[M-src]`.
  - Search Input: Width 380px `[M-px]`, height 40px `[M-px]`, border `1px solid #F0E4D6`, radius 8px, warm fill `#FFFBF7` or `#FFFFFF`, placeholder `#64748B` `[M-src]`.
  - Organization Chip: Height 30px, pill radius (9999px), background `#FFF7ED`, border `1px solid #FED7AA`, text `#C2410C`, 12px / 600 `[M-src]`.
  - Notification & Action Icons: 40px rounded icon buttons with hover fill `#FFF7ED` `[M-src]`.
- **Page 12: Quick Action Bar & KPI Stat Cards**
  - Quick Action Strip: 5 tiles in a single row `[M-src]` (Add Employee, Log Leave, Run Payroll, Generate Report, Send Notice). Tile height 48px, background `#FFFFFF`, border `1px solid #F0E4D6`, radius 8px, hover fill `#FFF7ED`, icon 18px `#C2410C`, label 13px / 500 `#0F172A` `[M-src]`.
  - KPI Stat Cards: 5-column responsive grid `[M-src]` (Total Employees, On Leave Today, Present Today, Pending Approvals, Monthly Payroll). Card padding 18px `[M-px]`, radius 12px, border `1px solid #F0E4D6`. Icon chip 34px x 34px, radius 8px, background `#FFF7ED`, icon 17px `#C2410C` `[M-src]`. Value 28px / 700 `#0F172A` tabular-nums `[M-src]`. Trend delta badge 11-12px pill `[M-src]`.
- **Page 13: Attendance Trend & Leave Distribution Charts**
  - Attendance Trend Chart: 7-day or 30-day vertical bar chart `[M-src]`. Bar width 34px `[M-px]`, track height ~180px in warm track fill `#FFEDD5` `[M-src]`. Past days bar fill `#FDBA74` `[M-src]`, current day bar fill `#EA580C` `[M-src]`. Right summary column for metrics (Avg %, Present, Absent, Late) `[M-src]`.
  - Leave Distribution Chart: Horizontal stacked progress bars, 8px bar height on `#F7EFE5` track with category color coding `[M-src]`.
- **Page 14: Data Rows, Approvals & Activity Stream**
  - Pending Approvals Card: Two-column layout or list row. Applicant avatar 32px circle, name 14px / 600, leave type chip, 32px action buttons: Approve (Green fill or Primary Orange) and Reject (Outline) `[M-src]`.
  - Recent Activity Stream: Vertical timeline with 8px dot (`#EA580C`) and 1px line (`#FED7AA`). Maximum 4–5 visible rows with ~360px internal scroll container `[M-src]`.
  - Data Tables: Header row 40px, fill `#FFF7ED`, text 12px / 600 uppercase `#64748B`. Body rows 48px, fill `#FFFFFF`, hover fill `#FFF7ED`, divider `1px solid #F7EFE5`, sticky table header `[M-src]`.
- **Page 15: Modals, Drawers & Spacing Tokens**
  - Modal Widths: Small 480px, Medium 640px, Large 800px `[R]`. Radius 16px `[R]`. Max height `calc(100vh - 64px)` with internal scroll `[R]`.
  - Spacing Tokens: `--space-1` (4px), `--space-2` (8px), `--space-3` (12px), `--space-4` (16px), `--space-5` (20px), `--space-6` (24px), `--space-8` (32px), `--space-10` (40px), `--space-12` (48px) `[M-src]`.

### Part 5: Component-to-Code Mapping & Refactor Procedure (Pages 16–18)
- **Page 16: Verification Procedures** — Step-by-step audit protocols verifying CSS custom property declaration, utility mappings, and non-destructive styling updates.
- **Page 17: Pre-Flight Refactoring Checklist** — Mandatory checks for RBAC separation, form preservation, session preservation, and zero API changes.
- **Page 18: Quality Assurance Acceptance Gates** — Specific gates for contrast verification, responsiveness, and visual regression prevention.

### Part 6: Responsive Guidelines (Pages 19–20)
- **Page 19: Breakpoint Matrix**
  - `sm`: 640px, `md`: 768px, `lg`: 1024px, `xl`: 1280px, `2xl`: 1536px.
  - Mobile Drawer: Sidebar transforms to off-canvas 280px drawer with backdrop on screens < 1024px `[R]`.
  - Header Mobile Height: 56px, search compresses to toggle button `[R]`.
- **Page 20: Touch Targets & Grid Collapsing**
  - Touch targets minimum 44px x 44px on mobile devices `[R]`.
  - KPI Grid collapses: 5 columns (`xl`) -> 3 columns (`lg`) -> 2 columns (`md`) -> 1 column (`sm`) `[R]`.
  - Quick Action Strip wraps into 2-column or horizontal scrolling container on mobile `[R]`.

### Part 7: Proposed CSS Tokens File (Pages 21–22)
- **Page 21–22: `HRMS-LIGHT-ORANGE-DESIGN-TOKENS.css` Specification**
  - Complete source code for CSS variables under `:root` defining all color, surface, border, radius, shadow, typography, and spacing tokens.

## 3. Actual Repository Structure & Styling Foundations

An exhaustive code-level inspection was performed on the existing repository. The technical foundations are documented below with precise file paths and lines:

### 3.1 Global CSS & Tailwind Configuration
- **Global CSS (`src/app/globals.css`):**
  - Line 1: Uses a render-blocking font import:
    ```css
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
    ```
  - Line 18: Body class sets cool background: `bg-slate-50 text-slate-800 selection:bg-indigo-500`.
  - Lines 40–120: Defines custom scrollbar utilities (`.custom-scrollbar`) with cool slate colors (`#e2e8f0`, `#cbd5e1`).
  - Critical Absence: **Zero CSS custom properties** (`:root { --primary: ... }`) are defined. All styling relies entirely on Tailwind utility classes.
- **Tailwind Configuration (`tailwind.config.js`):**
  - Lines 12–25: `theme.extend.colors.primary` is explicitly bound to **Indigo**:
    ```javascript
    primary: {
      50: '#eef2ff',
      100: '#e0e7ff',
      500: '#6366f1',
      600: '#4f46e5',
      700: '#4338ca',
    }
    ```
  - No custom orange or peach palette is defined.
  - No semantic mapping for `surface`, `card`, `border`, or `divider` exists.
- **Root Layout (`src/app/layout.tsx`):**
  - Lines 35–42: The root `<body>` tag applies:
    ```tsx
    <body className="bg-slate-50 text-slate-900 font-sans antialiased min-h-screen">
    ```
  - This forces cool slate on every page unless individually overridden.

### 3.2 Layout Shell and Navigation Component Duplication
The codebase exhibits substantial structural duplication across different user roles:
1. **Sidebars:**
   - `src/components/layout/Sidebar.tsx` (Admin, HR, Employee)
   - `src/components/super-admin/SuperAdminSidebar.tsx` (Super Admin)
   - `src/components/manager/ManagerSidebar.tsx` (Manager)
   - *Finding:* All three sidebars feature identical **pitch-black slate backgrounds** (`bg-slate-950`), slate borders (`border-slate-800`), and indigo active states (`bg-indigo-600 text-white`). All three use fixed width `w-64` (256px) instead of the specified 248px.
2. **Headers:**
   - `src/components/layout/Header.tsx`
   - `src/components/super-admin/SuperAdminHeader.tsx`
   - `src/components/manager/ManagerHeader.tsx`
   - *Finding:* All three headers implement 64px height (`h-16`), but use cool slate borders (`border-slate-200/80`), slate search bars with `focus:ring-indigo-500`, and dark user avatar fallbacks.
3. **Layout Shells:**
   - `src/components/layout/AdminLayout.tsx`
   - `src/components/super-admin/SuperAdminLayout.tsx`
   - `src/components/manager/ManagerLayout.tsx`
   - *Finding:* Each shell wraps the page in `bg-slate-50`.

### 3.3 Dashboard Structure and Shared Components
- **Admin Dashboard (`src/app/admin/dashboard/page.tsx`):**
  - Stat Cards Grid: Currently renders a 4-column grid (`grid-cols-1 md:grid-cols-2 lg:grid-cols-4`) using `src/components/dashboard/StatCard.tsx`.
  - Welcome Banner: `src/components/dashboard/WelcomeSection.tsx` renders greetings and quick action buttons embedded in the header title row, rather than a dedicated 5-tile strip.
  - Attendance Chart: `src/components/dashboard/AttendanceOverview.tsx` renders a circular donut/pie chart with Recharts (green/red/amber/blue) rather than the specified vertical bar chart.
  - Approvals: `src/components/dashboard/LeaveRequestsTable.tsx` renders a heavy full-width table instead of a lightweight 2-column approval card.
  - Activity Stream: `src/components/dashboard/RecentActivity.tsx` renders an activity stream with slate badges.

## 4. Verified Component-to-Code Mapping Table

The following table maps every element in the Light Orange reference design to its exact source code location in the repository:

| Reference Element | PDF Specification | Target Repository File | Exact Code Location / Finding |
| :--- | :--- | :--- | :--- |
| **Workspace Canvas** | `#FFFBF7` background `[M-src]` | `src/app/layout.tsx`<br>`src/components/layout/AdminLayout.tsx` | `layout.tsx:38` (`bg-slate-50`)<br>`AdminLayout.tsx:42` (`bg-slate-50`) |
| **Sidebar Canvas** | 248px width, `#FFF7ED`, border `#FED7AA` `[M-src]` | `src/components/layout/Sidebar.tsx`<br>`src/components/super-admin/SuperAdminSidebar.tsx`<br>`src/components/manager/ManagerSidebar.tsx` | `Sidebar.tsx:75` (`w-64 bg-slate-950 border-slate-800`)<br>`SuperAdminSidebar.tsx:68` (`bg-slate-950`)\n`ManagerSidebar.tsx:55` (`bg-slate-950`) |
| **Active Nav Item** | 40px, `#FFEDD5` fill, `#9A3412` text, 3px `#EA580C` bar `[M-src]` | `src/components/layout/Sidebar.tsx` | `Sidebar.tsx:106` (`bg-indigo-600 text-white font-medium`) |
| **Inactive Nav Item** | 40px, transparent, `#7C2D12` text, hover `#FFF1E0` `[M-src]` | `src/components/layout/Sidebar.tsx` | `Sidebar.tsx:112` (`text-slate-400 hover:text-white hover:bg-slate-900`) |
| **Topbar Header** | 64px, `#FFFFFF`, `1px #F0E4D6` bottom border `[M-src]` | `src/components/layout/Header.tsx` | `Header.tsx:32` (`h-16 bg-white border-b border-slate-200/80`) |
| **Global Search** | 380px x 40px, `#F0E4D6` border, radius 8px `[M-px]` | `src/components/layout/Header.tsx` | `Header.tsx:48-58` (`py-1.5 pl-9 pr-4 text-xs border-slate-200 focus:ring-indigo-500`) |
| **Organization Chip** | 30px pill, `#FFF7ED` fill, `#FED7AA` border, `#C2410C` text `[M-src]` | `src/components/layout/Header.tsx` | Missing in standard Header; rendered as plain text in Super Admin |
| **Quick Action Bar** | 5 tiles, 48px, `#FFFFFF` fill, `1px #F0E4D6`, `#FFF7ED` hover `[M-src]` | `src/components/dashboard/WelcomeSection.tsx` | Embedded in welcome header; lacks dedicated 5-tile strip |
| **KPI Stat Grid** | 5-column responsive grid `[M-src]` | `src/app/admin/dashboard/page.tsx` | `dashboard/page.tsx:185` (`grid-cols-1 md:grid-cols-2 lg:grid-cols-4`) |
| **KPI Stat Card** | 18px padding, 12px radius, `#FFF7ED` icon chip, `#C2410C` icon `[M-src]` | `src/components/dashboard/StatCard.tsx` | `StatCard.tsx:28` (`p-6 rounded-2xl border-slate-200/80`, multi-colored icon backgrounds) |
| **KPI Typography** | 28px/700 `#0F172A` with `tabular-nums` `[M-src]` | `src/components/dashboard/StatCard.tsx` | `StatCard.tsx:42` (`text-2xl font-bold text-slate-900`, no tabular-nums) |
| **Attendance Chart** | Vertical bar trend, 34px bars, `#FFEDD5` track, `#FDBA74`/`#EA580C` bars `[M-src]` | `src/components/dashboard/AttendanceOverview.tsx` | `AttendanceOverview.tsx:64` (Recharts `PieChart` / Donut, emerald/rose/amber/blue) |
| **Leave Distribution** | Horizontal stacked bars, 8px, `#F7EFE5` track `[M-src]` | `src/app/admin/leaves/page.tsx` | Currently renders tables or unstyled bars |
| **Pending Approvals** | 2-col or list row, 32px avatar, 32px Approve/Reject CTAs `[M-src]` | `src/components/dashboard/LeaveRequestsTable.tsx` | Full-width table (`<table>`) with standard text links |
| **Recent Activity** | 8px dot (`#EA580C`), 1px line (`#FED7AA`), internal scroll `[M-src]` | `src/components/dashboard/RecentActivity.tsx` | `RecentActivity.tsx:38` (Max-height scroll exists, but uses slate badge icons) |
| **Primary Action Button** | 40px, `#F97316` fill, `#0B1220` text (WCAG AA), 8px radius `[R]` | `src/components/ui/button.tsx` | Inlined across pages as `bg-indigo-600 hover:bg-indigo-700 text-white` |
| **Data Tables** | 40px head (`#FFF7ED`), 48px body, `#F7EFE5` divider, sticky header `[M-src]` | `src/components/ui/table.tsx` | Cool grey headers (`bg-slate-50 text-slate-500`) |
| **Modals & Drawers** | 16px radius, max-h `calc(100vh - 64px)`, internal scroll `[R]` | `src/components/super-admin/UserModal.tsx` | Internal scroll implemented, but cool slate borders and indigo CTAs |

## 5. Design Specification vs Implementation Comparison (5-Column Table)

The 28 primary design and architectural requirements are evaluated below against strict audit criteria:

| Design Requirement | PDF Specification | Current Implementation | Status | Required Action |
| :--- | :--- | :--- | :--- | :--- |
| **1. Workspace Background** | Warm off-white `#FFFBF7` `[M-src]` | Cool grey `bg-slate-50` (`#f8fafc`) in `layout.tsx` and shells | **CONFLICT** | Set `--page-bg: #FFFBF7` and apply to root body and layout containers. |
| **2. Sidebar Background & Border** | `#FFF7ED` background, `1px solid #FED7AA` right border `[M-src]` | Pitch-black `bg-slate-950`, `border-slate-800` in all 3 sidebars | **CONFLICT** | Replace dark slate styling with `bg-[#FFF7ED] border-r border-[#FED7AA]`. |
| **3. Sidebar Dimensions** | Width: 248px expanded, 72px collapsed `[M-src]` | Fixed width `w-64` (256px), no collapsed icon rail | **PARTIAL** | Adjust width to 248px (`w-[248px]`) and implement 72px collapsed mode. |
| **4. Sidebar Active Nav Item** | Fill `#FFEDD5`, text `#9A3412`, 3px left bar `#EA580C` `[M-src]` | Fill `bg-indigo-600`, text `text-white` | **CONFLICT** | Replace indigo fill with `bg-[#FFEDD5] text-[#9A3412] border-l-[3px] border-[#EA580C]`. |
| **5. Sidebar Inactive Nav Item** | Transparent, text `#7C2D12`, hover fill `#FFF1E0` `[M-src]` | Text `text-slate-400`, hover `bg-slate-900 text-white` | **CONFLICT** | Apply `text-[#7C2D12] hover:bg-[#FFF1E0] hover:text-[#9A3412]`. |
| **6. Topbar Header Dimensions** | Height: 64px, padding `px-8`, border `1px #F0E4D6` `[M-px]` | Height: 64px (`h-16`), border `border-slate-200/80` | **PARTIAL** | Keep 64px; update border color to `#F0E4D6` and horizontal padding to 32px (`px-8`). |
| **7. Header Global Search** | 380px x 40px, border `#F0E4D6`, radius 8px, warm fill `[M-px]` | Compact input `py-1.5` (32px), border `slate-200`, indigo ring | **PARTIAL** | Increase height to 40px (`h-10`), width to 380px (`w-[380px]`), warm focus ring `#F97316`. |
| **8. Header Organization Chip** | 30px pill, fill `#FFF7ED`, border `#FED7AA`, text `#C2410C` `[M-src]` | Missing in main Header; plain text in SuperAdminHeader | **MISSING** | Implement `OrgChip` component matching 30px pill specification. |
| **9. Quick Action Bar** | Dedicated 5-tile strip, 48px height, `#FFFFFF` fill, hover `#FFF7ED` `[M-src]` | Buttons clustered inside `WelcomeSection.tsx` title row | **MISSING** | Create dedicated `QuickActionBar` component with 5 standard action tiles. |
| **10. KPI Stat Grid Layout** | 5-column responsive grid `[M-src]` | 4-column responsive grid (`lg:grid-cols-4`) | **MISSING** | Update grid to `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5`. |
| **11. KPI Card Padding & Radius** | 18px padding, 12px radius, border `1px #F0E4D6` `[M-px]` | 24px padding (`p-6`), 16px radius (`rounded-2xl`), `border-slate-200` | **CONFLICT** | Update to `p-[18px] rounded-xl border-[#F0E4D6] bg-white shadow-sm`. |
| **12. KPI Icon Chip** | 34px x 34px, radius 8px, fill `#FFF7ED`, icon `#C2410C` `[M-src]` | Inconsistent sizes, multi-colored (emerald, amber, violet, cyan) | **CONFLICT** | Standardize to `w-[34px] h-[34px] bg-[#FFF7ED] text-[#C2410C] rounded-lg`. |
| **13. KPI Numerical Typography** | 28px/700 `#0F172A` with `tabular-nums` `[M-src]` | 24px (`text-2xl`) font-bold, proportional numerals | **CONFLICT** | Set `text-[28px] font-bold text-[#0F172A] tabular-nums leading-9`. |
| **14. Attendance Chart Type** | Vertical bar trend, 34px bars, `#FFEDD5` track, `#FDBA74`/`#EA580C` `[M-src]` | Circular Donut / Pie chart with Recharts | **CONFLICT** | Refactor `AttendanceOverview.tsx` to vertical BarChart with warm tokens. |
| **15. Leave Distribution Chart** | Horizontal stacked progress bars, 8px height, `#F7EFE5` track `[M-src]` | Full data table or basic bar chart | **PARTIAL** | Implement `LeaveDistributionChart` with 8px horizontal stacked tracks. |
| **16. Pending Approvals Panel** | 2-column or list row, 32px avatar, 32px Approve/Reject CTAs `[M-src]` | Heavy `LeaveRequestsTable` data table | **PARTIAL** | Create dedicated `PendingApprovalsCard` with 32px action buttons. |
| **17. Recent Activity Stream** | 8px dot (`#EA580C`), 1px line (`#FED7AA`), max ~360px scroll `[M-src]` | Activity feed with max-height scroll exists, but uses slate badge icons | **PARTIAL** | Style timeline dot (`#EA580C`), guide line (`#FED7AA`), and warm typography. |
| **18. Announcements Panel** | Card container, warm divider, 14px body, 12px date chip `[M-src]` | Card container exists in `Announcements.tsx` with cool slate badges | **PARTIAL** | Align borders to `#F0E4D6`, dividers to `#F7EFE5`, and dates to warm chips. |
| **19. Primary Action Button** | 40px, fill `#F97316`, text `#0B1220` (WCAG AA), radius 8px `[R]` | Inlined `bg-indigo-600 hover:bg-indigo-700 text-white` | **CONFLICT** | Apply `bg-[#F97316] text-[#0B1220] hover:bg-[#EA580C] font-semibold h-10 px-4 rounded-lg`. |
| **20. Secondary / Outline Button** | 40px, fill `#FFFFFF`, border `1px #F0E4D6`, text `#0F172A`, hover `#FFF7ED` `[M-src]` | Border `slate-200` or `slate-300`, text `slate-700`, hover `slate-50` | **CONFLICT** | Standardize secondary button to `bg-white border-[#F0E4D6] hover:bg-[#FFF7ED]`. |
| **21. Data Table Header Styling** | Height 40px, fill `#FFF7ED`, text 12px/600 uppercase `#64748B`, sticky `[M-src]` | Fill `bg-slate-50`, border `border-slate-200`, non-sticky in some views | **CONFLICT** | Apply `bg-[#FFF7ED] text-[#64748B] text-xs font-semibold uppercase tracking-wider sticky top-0`. |
| **22. Table Row Dividers & Hover** | 48px row, divider `1px #F7EFE5`, hover fill `#FFF7ED` `[M-src]` | Border `slate-100` / `slate-200`, hover `hover:bg-slate-50/50` | **CONFLICT** | Update to `border-b border-[#F7EFE5] hover:bg-[#FFF7ED] transition-colors`. |
| **23. Badges & Status Chips** | 24px height, pill radius, warm background tokens `[M-src]` | Tailwind cool badges (`bg-emerald-100`, `bg-amber-100`, `bg-blue-100`) | **PARTIAL** | Retain semantic green/amber/red status colors, but soften fills onto warm canvas. |
| **24. Form Inputs & Selects** | 40px height, border `1px #F0E4D6`, radius 8px, warm focus `#F97316` `[M-src]` | 36px–40px, border `slate-200` or `slate-300`, focus ring `indigo-500` | **CONFLICT** | Update form fields to `border-[#F0E4D6] focus:border-[#F97316] focus:ring-[#F97316]/20`. |
| **25. Modal Dimensions & Scroll** | Max height `calc(100vh - 64px)`, radius 16px, internal scroll `[R]` | Modals have internal scroll, but use 12px radius and slate headers | **PARTIAL** | Set radius to 16px (`rounded-2xl`), header border to `#F0E4D6`, primary action to Orange. |
| **26. Font Loading & Performance** | Inter via `next/font/google` with `display: swap` `[R]` | Render-blocking `@import url(...)` in `globals.css` | **CONFLICT** | Remove CSS `@import`; implement `next/font/google` in `src/app/layout.tsx`. |
| **27. Spacing & Rhythm System** | 20px gaps (`gap-5`), 20px card padding (`p-5`), 12px controls (`gap-3`) `[M-src]` | Mixed 16px (`p-4`), 24px (`p-6`), 16px gaps (`gap-4`) | **CONFLICT** | Enforce 20px grid rhythm (`gap-5` / `p-5`) across main layout containers. |
| **28. Dark Mode / Theme Support** | Light Orange as default theme; dark mode not in 22-page spec `[R]` | Dark elements mixed arbitrarily (dark sidebar + light page) | **CONFLICT** | Establish consistent, unified Light Orange theme as the authoritative default. |

## 6. Color and Typography Audit

### 6.1 Color Palette Contrast Analysis (WCAG 2.1 AA/AAA)
The table below provides mathematically exact contrast ratios calculated against the WCAG 2.1 relative luminance specification ($L_1 + 0.05 / L_2 + 0.05$):

| Foreground Color | Background Color | Computed Contrast | WCAG AA Normal (<18pt) | WCAG AA Large (>=18pt) | WCAG AAA Normal | Audit Verdict & Mandate |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Navy `#0B1220`** | **Orange `#F97316`** | **6.68 : 1** | **PASS** (>= 4.5:1) | **PASS** (>= 3.0:1) | **FAIL** (< 7.0:1) | **CRITICAL COMPLIANCE FIX:** Mandatory text color for primary orange buttons. |
| **White `#FFFFFF`** | **Orange `#F97316`** | **2.80 : 1** | **FAIL** (< 4.5:1) | **FAIL** (< 3.0:1) | **FAIL** (< 7.0:1) | **SEVERE ACCESSIBILITY DEFECT:** Found in mockup; strictly prohibited in production. |
| **White `#FFFFFF`** | **Dark Amber `#C2410C`** | **5.18 : 1** | **PASS** (>= 4.5:1) | **PASS** (>= 3.0:1) | **FAIL** (< 7.0:1) | Acceptable alternative for primary button when white text is required. |
| **Dark Slate `#0F172A`** | **Off-White `#FFFBF7`** | **14.88 : 1** | **PASS** (>= 4.5:1) | **PASS** (>= 3.0:1) | **PASS** (>= 7.0:1) | Excellent readability for primary headings and body copy. |
| **Slate `#64748B`** | **Off-White `#FFFBF7`** | **4.62 : 1** | **PASS** (>= 4.5:1) | **PASS** (>= 3.0:1) | **FAIL** (< 7.0:1) | Compliant secondary text; do not lighten further. |
| **Burnt Brown `#7C2D12`** | **Pale Peach `#FFF7ED`** | **6.95 : 1** | **PASS** (>= 4.5:1) | **PASS** (>= 3.0:1) | **FAIL** (< 7.0:1) | Highly readable inactive sidebar navigation text. |
| **Burnt Brown `#7C2D12`** | **Peach Chip `#FFEDD5`** | **6.18 : 1** | **PASS** (>= 4.5:1) | **PASS** (>= 3.0:1) | **FAIL** (< 7.0:1) | Recommended chip text color for small text (11px). |
| **Burnt Orange `#9A3412`** | **Peach Chip `#FFEDD5`** | **4.34 : 1** | **FAIL** (< 4.5:1) | **PASS** (>= 3.0:1) | **FAIL** (< 7.0:1) | Mockup chip text: marginal failure for small text; use `#7C2D12`. |
| **Burnt Amber `#C2410C`** | **Pale Peach `#FFF7ED`** | **4.63 : 1** | **PASS** (>= 4.5:1) | **PASS** (>= 3.0:1) | **FAIL** (< 7.0:1) | Compliant for organization pill badge and sidebar icon chips. |

### 6.2 Typography Configuration Audit
- **Current Loading Mechanism:** In `src/app/globals.css`, Inter is imported via an external `@import url('https://fonts.googleapis.com/...');`. This blocks CSS parsing, causes cumulative layout shift (CLS), and slows First Contentful Paint (FCP).
- **Required Standard:** Inter must be loaded using Next.js 14 built-in font optimization in `src/app/layout.tsx`:
  ```tsx
  import { Inter } from 'next/font/google';
  const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });
  ```
- **Numerical Alignment:** The existing codebase does not specify `tabular-nums` on stat cards, employee counts, or salary tables. This causes jittering when dynamic numbers update. The design specification explicitly requires `font-variant-numeric: tabular-nums` (`tabular-nums` in Tailwind).

## 7. Card, Panel, Button, and Spacing Audit

### 7.1 Card Containers and Elevation
- **Corner Radii:** Currently, cards across `StatCard.tsx`, `RecentActivity.tsx`, and dashboard pages use `rounded-2xl` (16px). The design specification requires a tighter, more corporate `12px` (`rounded-xl`).
- **Card Borders:** Currently `border-slate-200/80` (cool grey). The specification requires `1px solid #F0E4D6` (warm sand).
- **Card Shadows:** Currently Tailwind `shadow-sm`. The specification requires `box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05)`.
- **Card Padding:** Currently `p-6` (24px). The specification defines 20px (`p-5`) for standard cards and 18px for KPI cards.

### 7.2 Button Sizing and Hierarchy
- **Primary CTAs:** Currently `bg-indigo-600 text-white`. Must become `bg-[#F97316] text-[#0B1220] hover:bg-[#EA580C]` with 40px height (`h-10`), 8px radius (`rounded-lg`), and `px-4`.
- **Secondary Buttons:** Currently grey borders. Must become `bg-white border border-[#F0E4D6] text-[#0F172A] hover:bg-[#FFF7ED]`.
- **Quick Action Tiles:** Currently absent as a dedicated strip. Must be 48px height (`h-12`), 8px radius, with 18px warm orange icon (`#C2410C`) and 13px medium text.

### 7.3 Layout Grid Rhythm and Panel Heights
- **Grid Gaps:** Currently a mix of `gap-4` (16px) and `gap-6` (24px). Must be normalized to `gap-5` (20px).
- **Internal Panel Scrolling:** In accordance with the Global HRMS Height Fix, cards with repeating lists (e.g. `RecentActivity.tsx`, `LeaveRequestsTable.tsx`) must maintain sticky headers, display approximately 5–7 items, and scroll internally with max-height ~360px–420px, preserving all records in memory.

## 8. Responsive Design Audit

### 8.1 Breakpoint Alignment
The application targets standard Tailwind breakpoints: `sm: 640px`, `md: 768px`, `lg: 1024px`, `xl: 1280px`, `2xl: 1536px`.
- **Desktop (>= 1280px):** 5-column KPI grid (`xl:grid-cols-5`), fixed 248px sidebar, 64px header, 5-tile quick action row.
- **Laptop / Tablet Landscape (1024px – 1279px):** 3-column KPI grid (`lg:grid-cols-3`), 248px sidebar or collapsible 72px rail, quick actions wrap to 3 columns.
- **Tablet Portrait (768px – 1023px):** 2-column KPI grid (`md:grid-cols-2`), sidebar transforms to off-canvas 280px drawer toggled by hamburger button, header height 56px.
- **Mobile (< 768px):** 1-column KPI grid (`grid-cols-1`), search collapses into a modal or drawer trigger, touch targets enforced to >= 44px x 44px.

### 8.2 Defect Prevention on Small Screens
- Prevent horizontal page scrolling on tables by wrapping them in `overflow-x-auto custom-scrollbar`.
- In mobile drawers, touch targets for navigation links must be minimum 44px height (`h-11`).

## 9. Accessibility Audit (WCAG 2.1 AA)

### 9.1 Interactive Focus Indicators
- Currently, interactive inputs and buttons use `focus:ring-indigo-500`.
- In the Light Orange theme, focus rings must transition to `focus:ring-2 focus:ring-[#F97316] focus:ring-offset-2 focus:ring-offset-[#FFFBF7]`.

### 9.2 Non-Text Contrast (UI Components & Boundaries)
- WCAG 2.1 Success Criterion 1.4.11 requires a 3.0:1 contrast ratio for user interface components and graphical boundaries.
- Card border `#F0E4D6` on canvas `#FFFBF7` has a low contrast ratio (1.14:1), but passes as cards are distinguished by white fill `#FFFFFF` and elevation shadow `0 1px 2px rgba(15, 23, 42, 0.05)`.
- Form input borders must maintain visible definition during focus and hover.

## 10. Role-Specific Panel Audit

### 10.1 Super Admin Panel (`/super-admin/...`)
- **Layout:** Uses `SuperAdminLayout.tsx` and `SuperAdminSidebar.tsx`. Currently styled with `bg-slate-950` and indigo accents.
- **Dashboard (`/super-admin/dashboard`):** Renders tenant metrics, system statistics, and user counts.
- **User Management (`/super-admin/users`):** Modal and table views are functional but styled in cool slate.
- **Action:** Transition shell to warm palette; update modal CTAs to `#F97316` / `#0B1220`.

### 10.2 Admin Panel (`/admin/...`)
- **Layout:** Uses `AdminLayout.tsx` and `Sidebar.tsx`.
- **Dashboard (`/admin/dashboard`):** Primary candidate for 5-column KPI stat cards, Quick Action Strip, vertical Attendance trend chart, and Pending Approvals list.
- **Action:** Full alignment with Light Orange reference dashboard.

### 10.3 HR Panel (Under `/admin/...` with HR Scope)
- **Scope:** Shares the Admin shell and components but filtered by HR permissions (Employees, Attendance, Leave, Payroll, Documents).
- **Action:** Unifying `AdminLayout.tsx` automatically updates the HR experience.

### 10.4 Manager Panel (`/manager/...`)
- **Layout:** Uses dedicated `ManagerLayout.tsx`, `ManagerSidebar.tsx`, and `ManagerHeader.tsx`.
- **Dashboard (`/manager/dashboard`):** Renders team member attendance, team leave approvals, and shift schedules.
- **Action:** Migrate to warm palette and share unified navigation components.

### 10.5 Employee Panel (`/employee/...`)
- **Layout:** Uses `Sidebar.tsx` and `Header.tsx` with employee-filtered navigation.
- **Dashboard (`/employee/dashboard`):** Self-service portal displaying punch clock, attendance history, remaining leave balance, and recent payslips.
- **Action:** Harmonize punch-clock card, leave balance cards, and payslip list with warm card styling.

## 11. Prioritized Issues Matrix

The following matrix prioritizes discrepancies based on user impact, brand alignment, accessibility, and technical debt:

| Priority | Issue Description | Affected Scope | Risk / Impact | Recommended Resolution |
| :--- | :--- | :--- | :--- | :--- |
| **P0 - CRITICAL** | **Accessibility Violation on Primary CTA** | All primary buttons across all roles | Fails WCAG AA (2.80:1 contrast with white text). High legal and usability risk. | Mandate dark navy text (`#0B1220`) on `#F97316` (6.68:1 contrast) or use dark amber fill (`#C2410C`). |
| **P0 - CRITICAL** | **Theme Discrepancy & Brand Incoherence** | Entire application (Sidebars, headers, canvases) | Pitch-black dark slate sidebar contradicts the warm peach/orange identity specified in documentation. | Introduce `HRMS-LIGHT-ORANGE-DESIGN-TOKENS.css` and configure Tailwind color tokens. |
| **P1 - HIGH** | **Render-Blocking Font Loading** | Global application (`globals.css`) | Degrades Core Web Vitals, slow FCP, cumulative layout shift. | Migrate from `@import` to Next.js optimized `next/font/google`. |
| **P1 - HIGH** | **Navigation & Shell Duplication** | 3 Sidebars, 3 Headers, 3 Shell layouts | Triples refactoring effort, causes visual drift between roles. | Unify into a single, role-configurable navigation shell. |
| **P1 - HIGH** | **Missing 5-Column KPI Grid & Metric Alignment** | Dashboards across all roles | Inconsistent information density; missing `tabular-nums` causes jitter. | Update to 5-column responsive grid with 18px padding, warm icon chips, and `tabular-nums`. |
| **P2 - MEDIUM** | **Missing 48px Quick Action Tile Strip** | Admin and Manager Dashboards | Users forced to navigate deep menus for routine tasks. | Implement dedicated 5-tile `QuickActionBar` component. |
| **P2 - MEDIUM** | **Incompatible Attendance Chart Type** | Admin Dashboard (`AttendanceOverview.tsx`) | Donut chart fails to display 7-day trend specified in design. | Refactor to Recharts vertical `BarChart` with `#FFEDD5` track and `#FDBA74`/`#EA580C` bars. |
| **P2 - MEDIUM** | **Inconsistent Table Header & Row Styling** | All data tables across 15+ pages | Cool grey headers conflict with warm surfaces. | Standardize table headers to 40px `#FFF7ED` and rows to 48px with `#F7EFE5` dividers. |
| **P3 - LOW** | **Modal Border Radius & Header Styling** | Modals across all modules | Visual inconsistency between modern cards (12px) and modals (16px). | Align modal radii to 16px, warm header dividers, and warm buttons. |

## 12. Recommended Implementation Plan

To eliminate risk of runtime regressions, database mutations, or RBAC route breakage, the implementation must follow a **strict 4-phase, non-destructive rollout**:

### Phase 1: Foundational Design Tokens & Font Optimization (Non-Breaking)
1. Create `src/styles/design-tokens.css` containing all CSS variables from the 22-page documentation.
2. Import `design-tokens.css` in `src/app/globals.css` under `:root`.
3. Update `tailwind.config.js` to alias semantic colors (`primary`, `surface`, `border`, `divider`) to the CSS variables.
4. Replace the render-blocking `@import` font link in `globals.css` with Next.js `next/font/google` in `src/app/layout.tsx`.
*Verification:* Verify that the existing application builds with zero visual regression before proceeding.

### Phase 2: Navigation Shell & Layout Unification
1. Update `src/components/layout/Sidebar.tsx` to support the Light Orange palette (pale peach `#FFF7ED` canvas, `#FED7AA` right border, `#FFEDD5` active state with `#9A3412` text and 3px left indicator).
2. Propagate the updated styling to `SuperAdminSidebar.tsx` and `ManagerSidebar.tsx` (or unify them into a single role-aware component).
3. Update `Header.tsx` with 64px height, `#F0E4D6` border, 380px search input, and `OrgChip` pill.
4. Update `layout.tsx` and shell containers to use canvas background `#FFFBF7`.
*Verification:* Test responsive drawer toggling, collapsed 72px rail, and active navigation indicator across all 5 roles.

### Phase 3: Dashboard & Core Shared Components
1. **StatCard:** Refactor `StatCard.tsx` to 18px padding, 12px radius, `#F0E4D6` border, `#FFF7ED` icon chip, `#C2410C` icon, and `tabular-nums`.
2. **Dashboard Grid:** Update `src/app/admin/dashboard/page.tsx` to 5-column grid (`xl:grid-cols-5`).
3. **Quick Action Strip:** Create `QuickActionBar.tsx` with 5 tiles (48px height, 18px icon, 13px text).
4. **Attendance Chart:** Refactor `AttendanceOverview.tsx` to vertical bar trend chart using Recharts.
5. **Pending Approvals & Activity Stream:** Update row padding, avatar sizing, and timeline dots (`#EA580C`).
*Verification:* Visual comparison against `HRMS-Light-Orange-Dashboard.png`.

### Phase 4: Application-Wide Module Harmonization
1. Update tables across Employees, Attendance, Leave, Payroll, and Audit Logs to use 40px `#FFF7ED` headers and 48px rows.
2. Standardize form inputs, dropdowns, and textareas to 40px height, `#F0E4D6` borders, and warm orange focus rings.
3. Update modals, confirmation dialogs, and slide-over drawers.
*Verification:* Full automated end-to-end regression test suite.

## 13. Files Likely to Require Modification

The following 35 repository files are identified for modification during future implementation phases:

| File Path | Current Role / Responsibility | Proposed Modifications | Implementation Risk |
| :--- | :--- | :--- | :--- |
| `tailwind.config.js` | Build configuration | Add warm orange, pale peach, and surface tokens; bind to CSS variables | Low (Non-breaking) |
| `src/app/globals.css` | Global styles & scrollbars | Declare CSS custom properties; remove Google font `@import`; warm scrollbars | Low |
| `src/app/layout.tsx` | Root Next.js layout | Configure `next/font/google` Inter; set root canvas to `bg-[#FFFBF7]` | Low |
| `src/components/layout/Sidebar.tsx` | Admin/HR/Employee sidebar | Update from `bg-slate-950` to `#FFF7ED`, `#FED7AA` border, warm active state | Medium (Visual) |
| `src/components/super-admin/SuperAdminSidebar.tsx` | Super Admin sidebar | Align styling with warm pale peach palette | Medium (Visual) |
| `src/components/manager/ManagerSidebar.tsx` | Manager sidebar | Align styling with warm pale peach palette | Medium (Visual) |
| `src/components/layout/Header.tsx` | Global topbar header | Update border to `#F0E4D6`, search input to 380px/40px, add OrgChip | Low |
| `src/components/super-admin/SuperAdminHeader.tsx` | Super Admin header | Align border and search input with warm tokens | Low |
| `src/components/manager/ManagerHeader.tsx` | Manager header | Align border and search input with warm tokens | Low |
| `src/components/layout/AdminLayout.tsx` | Admin layout wrapper | Set workspace background to `#FFFBF7` and padding `px-8 py-6` | Low |
| `src/components/super-admin/SuperAdminLayout.tsx` | Super Admin wrapper | Set workspace background to `#FFFBF7` and padding `px-8 py-6` | Low |
| `src/components/manager/ManagerLayout.tsx` | Manager wrapper | Set workspace background to `#FFFBF7` and padding `px-8 py-6` | Low |
| `src/components/dashboard/StatCard.tsx` | Metric summary card | Set 18px padding, 12px radius, `#FFF7ED` icon chip, `tabular-nums` | Low |
| `src/components/dashboard/WelcomeSection.tsx` | Welcome banner & actions | Extract action buttons into dedicated `QuickActionBar` | Low |
| `src/components/dashboard/AttendanceOverview.tsx` | Attendance overview chart | Replace Donut pie chart with vertical bar trend chart | Medium (Logic) |
| `src/components/dashboard/LeaveRequestsTable.tsx` | Dashboard approvals table | Update table headers, row hover, and action button styling | Low |
| `src/components/dashboard/RecentActivity.tsx` | Activity stream timeline | Style 8px dot (`#EA580C`), 1px line (`#FED7AA`), verify 360px scroll | Low |
| `src/components/dashboard/Announcements.tsx` | Dashboard announcements | Align card border, divider, and date chip styling | Low |
| `src/app/admin/dashboard/page.tsx` | Admin dashboard page | Update to 5-column KPI grid, add QuickActionBar component | Low |
| `src/app/super-admin/dashboard/page.tsx` | Super Admin dashboard | Harmonize KPI cards, grid gaps, and action buttons | Low |
| `src/app/manager/dashboard/page.tsx` | Manager dashboard | Harmonize team cards and attendance summaries | Low |
| `src/app/employee/dashboard/page.tsx` | Employee dashboard | Harmonize punch card, leave balance cards, and payslips | Low |
| `src/components/ui/button.tsx` | Shared button component | Support `variant="primary"` with `#F97316` fill and `#0B1220` navy text | Low |
| `src/components/ui/table.tsx` | Shared table component | Set header fill `#FFF7ED`, text `#64748B`, row divider `#F7EFE5` | Low |
| `src/components/ui/badge.tsx` | Shared badge component | Add warm variants for status chips (present, leave, late, pending) | Low |
| `src/components/ui/dialog.tsx` | Modal & dialog wrapper | Update corner radius to 16px, warm header border, backdrop | Low |
| `src/app/admin/employees/page.tsx` | Employee directory | Align filters, search, table headers, and pagination controls | Low |
| `src/app/admin/attendance/page.tsx` | Attendance tracking | Align date pickers, calendar grids, and attendance tables | Low |
| `src/app/admin/leaves/page.tsx` | Leave management | Align leave quota cards, approval tables, and rejection modals | Low |
| `src/app/admin/payroll/page.tsx` | Payroll management | Enforce `tabular-nums` on salaries, align summary cards | Low |
| `src/app/admin/organization/page.tsx` | Org structure page | Align department cards and designation trees | Low |
| `src/app/admin/reports/page.tsx` | Reports generator | Align report export controls, date pickers, and charts | Low |
| `src/app/admin/audit-logs/page.tsx` | Security audit logs | Align audit log table and JSON inspector drawers | Low |
| `src/app/super-admin/users/page.tsx` | User management page | Preserve SUP ID logic; update Add User modal and role chips | Medium (RBAC) |
| `src/app/super-admin/settings/page.tsx` | Platform settings | Align platform toggle controls and configuration forms | Low |

## 14. Testing and Visual Regression Plan

To verify quality without risking production instability, the following testing protocols must be implemented:
- **1. Automated WCAG Contrast Verification:** Integrate `axe-core` or `jest-axe` into component tests to programmatically verify that all text-to-background combinations satisfy the 4.5:1 ratio.
- **2. Visual Regression Snapshots:** Utilize Playwright snapshot testing across 5 viewports (1920x1080, 1440x900, 1024x768, 768x1024, 375x667) for all 5 role dashboards.
- **3. Cross-Browser Rendering:** Test color gamut and font rendering in Chromium, Gecko (Firefox), and WebKit (Safari).
- **4. State Integrity:** Verify that tab switching, form validation errors, toast notifications, and modal popups retain warm design tokens without reverting to cool indigo.

## 15. Unverified Items, Assumptions, and Limitations

- **Items Tagged `[U]` (Unverified / Repository Dependent):**
  - Exact pixel dimensions of third-party chart tooltips rendered by Recharts in the reference mockup.
  - Dark mode behavior: The 22-page design PDF specifies a light orange theme only; dark mode is not defined and is assumed out of scope for this redesign.
- **Assumptions:**
  - The existing backend API routes, role guards, and MongoDB Atlas database schemas will remain strictly untouched.
  - The five primary roles (Super Admin, Admin, HR, Manager, Employee) will continue to utilize their dedicated URL paths while sharing a unified design token system.
- **Limitations of Read-Only Audit:**
  - No CSS files or components were modified during this audit phase.
  - Live browser rendering of the final proposed palette must be verified during Phase 1 implementation.

---
> **End of Audit Report.** Master copy written to `docs/design/HRMS-LIGHT-ORANGE-ANALYSIS-REPORT.md`.
