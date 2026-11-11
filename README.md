# EMS / HRMS — Employee Management & Human Resource Management System

[![Next.js](https://img.shields.io/badge/Next.js-14.2-black?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-18.3-blue?logo=react)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4-38B2AC?logo=tailwind-css)](https://tailwindcss.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-7.6-47A248?logo=mongodb)](https://www.mongodb.com/)
[![License](https://img.shields.io/badge/License-Enterprise-indigo)](#)

An enterprise-grade, multi-tenant Employee Management System (EMS) and Human Resource Management System (HRMS) built with Next.js (App Router), React, TypeScript, Tailwind CSS, and MongoDB Atlas. The platform provides a secure, role-based infrastructure for managing complex workforce operations, multi-tenant organization hierarchies, leave & attendance tracking, payroll processing, performance reviews, private communication, automated notifications, document storage via MongoDB GridFS, and audit logging.

---

## Table of Contents

- [Project Overview](#project-overview)
- [Roles & Permissions](#roles--permissions)
- [Portals Overview](#portals-overview)
- [Feature Modules](#feature-modules)
- [Tech Stack](#tech-stack)
- [System Architecture](#system-architecture)
- [Project Structure](#project-structure)
- [Authentication System](#authentication-system)
- [RBAC & Security Protections](#rbac--security-protections)
- [Manager Panel](#manager-panel)
- [Employee Panel](#employee-panel)
- [Admin / HR Panel](#admin--hr-panel)
- [Super Admin Panel](#super-admin-panel)
- [Database Collections](#database-collections)
- [MongoDB GridFS Storage](#mongodb-gridfs-storage)
- [Representative API Documentation](#representative-api-documentation)
- [Environment Variables](#environment-variables)
- [Getting Started & Local Setup](#getting-started--local-setup)

---

## Project Overview

EMS / HRMS is designed to support enterprise workforce operations across multiple organizations, departments, and management tiers. The architecture relies strictly on real MongoDB Atlas database records, zero hard-coded mock data, and server-side authorization enforcement.

### Key Workflows Supported
- **Multi-Tenant Organization Management**: Super Admin management of organizations, tenant isolation, and tenant-level configurations.
- **Employee Lifecycle**: Recruitment, onboarding, profile management, department & designation assignment, status tracking, and offboarding.
- **Time & Attendance Tracking**: Daily check-in/check-out, working hours calculation, IST timezone formatting (`Asia/Kolkata`), attendance correction requests, and monthly reporting.
- **Leave Management**: Multi-tier approval workflow (Manager → HR), entitlement balances, leave requests, attachments, and real-time status tracking.
- **Payroll & Compensation**: Salary structures, allowances, deductions, tax compliance, payslip generation, and disbursement logging.
- **Performance Appraisals**: Goal assignment, quarterly/annual review evaluations, rating scales, and performance tracking.
- **Private Team & HR Communication**: Encrypted conversation threads between direct reports, managers, and HR, with 10MB GridFS binary file attachments.
- **Helpdesk & Service Requests**: Employee ticketing for HR, IT, payroll, and administrative requests with status transitions and comment threads.
- **Notifications & Audit Trails**: Real-time notification dispatching (system, email SMTP, WhatsApp integration) and comprehensive system audit logging.

---

## Roles & Permissions

The system enforces 5 distinct roles derived from authenticated database sessions (`getAuthContext()`):

| Role | Responsibilities | Scope Boundary |
| :--- | :--- | :--- |
| **Super Admin** | Platform owner managing organizations, global system settings, security policies, global users, and audit logs. | Cross-tenant / Platform-wide |
| **Admin** | Senior organizational administrator managing overall organization settings, high-level HR policies, and department structures. | Organization boundary (`organizationId`) |
| **HR** | Human Resources personnel managing employee onboarding, leave approvals, payroll generation, performance review policies, and recruitment. | Organization boundary (`organizationId`) |
| **Manager** | People manager reviewing performance, approving leave requests, checking daily attendance, messaging direct reports, and inspecting helpdesk tickets. | Direct team boundary (`managerId` / `reportingTo`) within tenant |
| **Employee** | Staff member submitting leave requests, marking attendance, viewing payslips, opening helpdesk tickets, and communicating with HR/Manager. | Personal employee record (`employeeId` / `userId`) |

---

## Portals Overview

The application organizes user interfaces into 4 isolated role portals, each governed by server-side authorization (`AuthGuard`):

```
                               ┌────────────────────────────────┐
                               │       EMS / HRMS Platform      │
                               └───────────────┬────────────────┘
                                               │
         ┌───────────────────┬─────────────────┼───────────────────┬───────────────────┐
         ▼                   ▼                 ▼                   ▼                   ▼
┌──────────────────┐┌─────────────────┐┌───────────────┐┌───────────────────┐┌───────────────────┐
│ Super Admin      ││ Admin Portal    ││ HR Portal     ││ Manager Panel     ││ Employee Panel    │
│ Control Center   ││ (/admin/*)      ││ (/admin/*)    ││ (/manager/*)      ││ (/employee/*)     │
│ (/super-admin/*) ││                 ││               ││                   ││                   │
└──────────────────┘└─────────────────┘└───────────────┘└───────────────────┘└───────────────────┘
```

---

## Feature Modules

1. **Authentication & Session Management**: Multi-factor authentication support, email OTP verification via Nodemailer SMTP, session tokens stored in HTTP-only cookies (`ems_session`), password hashing, and brute-force lockout controls.
2. **Interactive Dashboards**: Role-tailored dashboards displaying real-time KPI metrics, attendance breakdown, pending approvals, and notification widgets.
3. **Employee Directory**: Enterprise employee management featuring advanced filtering, multi-field search, status management, profile picture upload, and departmental hierarchy.
4. **Organization Structure**: Hierarchical structure setup with custom departments, designations, manager assignments, and reporting lines.
5. **Time & Attendance**: Real-time check-in/check-out tracking, automated working hours computation, geolocation metadata, attendance status (Present, Late, Half Day, Absent), and IST formatting.
6. **Leave Management**: Leave types (Sick, Casual, Earned, Maternity, Unpaid), entitlement tracking, multi-tier approval workflows, and attachment inspection.
7. **Payroll Processing**: Custom salary breakdown (Basic, HRA, Special Allowances, PF, ESI, TDS), bulk payroll generation, payslip PDF rendering, and disbursement histories.
8. **Performance Reviews**: Goal setting, manager performance appraisal modals, rating scales (1-5 stars), reviewer comments, and appraisal history.
9. **Document Management**: Secure file upload, GridFS binary storage, employee document classification, expiration tracking, and access authorization.
10. **Recruitment & Hiring**: Candidate tracking system, job openings creation, applicant status pipeline (Applied, Screening, Interview, Offered, Hired, Rejected), and resume downloads.
11. **Private Messaging**: One-on-one conversation threads between employees, managers, and HR staff with inline GridFS file attachments.
12. **Notifications System**: Integrated notification center with unread count badges, category filtering (System, Attendance, Leave, Payroll, Performance, Security), and email dispatching.
13. **Reports & Analytics**: Comprehensive exports and graphical visualizations for attrition rates, attendance trends, leave utilization, and payroll cost breakdown.
14. **HR Helpdesk**: Ticket-based support system with configurable priorities (Low, Medium, High, Urgent), status transitions (Open → Assigned → In Progress → Resolved → Closed), and internal HR notes.
15. **System Settings & Integrations**: Configurable organization branding, attendance rules, leave policies, WhatsApp Meta Graph API integration, Microsoft SSO configuration, and biometric device connectors.
16. **Security Audit Logs**: Immutable audit log records capturing action name, performer, IP address, user agent, target resource, timestamp, and delta changes.

---

## Tech Stack

### Frontend
- **Framework**: [Next.js 14](https://nextjs.org/) (App Router, Server & Client Components)
- **UI Library**: [React 18](https://reactjs.org/)
- **Language**: [TypeScript 5.7](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS 3.4](https://tailwindcss.com/) with PostCSS & Autoprefixer
- **Icons**: [Lucide React](https://lucide.dev/)
- **Data Visualization**: [Recharts](https://recharts.org/)
- **Date Formatting**: `date-fns` & custom centralized IST utilities (`Asia/Kolkata`)

### Backend & API
- **Runtime**: Node.js
- **API Architecture**: Next.js Serverless API Routes (`/api/v1/*`)
- **Authentication**: Custom HTTP-only session cookies & Bearer tokens
- **Email Service**: [Nodemailer](https://nodemailer.com/) with SMTP / Gmail App Password support

### Database & Storage
- **Database**: [MongoDB 7.6](https://www.mongodb.com/) (MongoDB Atlas & local instance support)
- **Database Driver**: Official Node.js `mongodb` driver with connection pooling
- **Binary File Storage**: MongoDB GridFS (`documents` bucket) for secure file uploads

### Infrastructure & Deployment
- **Deployment Target**: [Vercel](https://vercel.com/) / Node.js Server Environment

---

## System Architecture

```
                                ┌───────────────────────────┐
                                │     Client Web Browser    │
                                └─────────────┬─────────────┘
                                              │ HTTP / HTTPS
                                              ▼
                                ┌───────────────────────────┐
                                │   Next.js App Directory   │
                                │   (UI Components & Pages) │
                                └─────────────┬─────────────┘
                                              │ API Calls
                                              ▼
                                ┌───────────────────────────┐
                                │  Next.js Serverless APIs  │
                                │       (/api/v1/*)         │
                                └─────────────┬─────────────┘
                                              │
                      ┌───────────────────────┼───────────────────────┐
                      ▼                       ▼                       ▼
            ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
            │ Authentication   │    │ Organization &   │    │ Manager Team     │
            │ & Session Guard  │    │ Tenant Boundary  │    │ Scope Resolvers  │
            └────────┬─────────┘    └────────┬─────────┘    └────────┬─────────┘
                     │                       │                       │
                     └───────────────────────┼───────────────────────┘
                                             │ Verified Query Filter
                                             ▼
                               ┌───────────────────────────┐
                               │   MongoDB Atlas Cluster   │
                               │  (Collections & GridFS)   │
                               └───────────────────────────┘
```

### Core Architecture Principles
1. **Server-Side Authorization**: Every API route extracts identity via `getAuthContext(req)` and validates permissions with `checkPermissions(auth)`. Client-supplied parameters like `?organizationId=...` or `?employeeId=...` are strictly ignored for authorization purposes.
2. **Organization Isolation**: Data access is scoped to `auth.organizationId`. A user in Organization A can never query or mutate data belonging to Organization B.
3. **Manager Team Boundary**: Manager queries dynamically compute the direct reporting scope:
   ```js
   { organizationId: auth.organizationId, $or: [{ managerId: auth.employeeId }, { reportingTo: auth.employeeId }] }
   ```
4. **GridFS File Security**: Binary document downloads (`/api/v1/documents/[id]/file`) inspect GridFS file metadata and enforce document-level or ticket/conversation-level authorization prior to streaming file bytes.
5. **Internal HR Note Protection**: Internal comments (`isInternal: true`) in helpdesk tickets or employee files are stripped out for `EMPLOYEE` and `MANAGER` roles.

---

## Project Structure

```
Employee_management_system/
├── public/                      # Static assets, branding logos, and favicon
├── src/
│   ├── app/                     # Next.js App Router
│   │   ├── admin/               # HR & Admin Portal Pages
│   │   │   ├── attendance/
│   │   │   ├── audit-logs/
│   │   │   ├── communication/
│   │   │   ├── dashboard/
│   │   │   ├── documents/
│   │   │   ├── employees/
│   │   │   ├── helpdesk/
│   │   │   ├── integrations/
│   │   │   ├── leave/
│   │   │   ├── notifications/
│   │   │   ├── organization/
│   │   │   ├── payroll/
│   │   │   ├── performance/
│   │   │   ├── recruitment/
│   │   │   ├── reports/
│   │   │   └── settings/
│   │   ├── api/                 # Serverless API Routes (/api/v1/*)
│   │   │   ├── cron/            # Scheduled cleanup & retention tasks
│   │   │   └── v1/
│   │   │       ├── admin/
│   │   │       ├── attendance/
│   │   │       ├── auth/
│   │   │       ├── documents/
│   │   │       ├── employees/
│   │   │       ├── hr-requests/
│   │   │       ├── integrations/
│   │   │       ├── leave/
│   │   │       ├── manager/
│   │   │       ├── messages/
│   │   │       ├── notifications/
│   │   │       ├── payroll/
│   │   │       ├── performance/
│   │   │       ├── public/
│   │   │       ├── recruitment/
│   │   │       ├── reports/
│   │   │       ├── settings/
│   │   │       └── super-admin/
│   │   ├── employee/            # Employee Self-Service Portal Pages
│   │   │   ├── attendance/
│   │   │   ├── dashboard/
│   │   │   ├── documents/
│   │   │   ├── helpdesk/
│   │   │   ├── leave/
│   │   │   ├── messages/
│   │   │   ├── notifications/
│   │   │   ├── payroll/
│   │   │   ├── performance/
│   │   │   ├── profile/
│   │   │   └── settings/
│   │   ├── manager/             # Manager Panel Pages & Shared Shell
│   │   │   ├── attendance/
│   │   │   ├── communication/
│   │   │   ├── dashboard/
│   │   │   ├── helpdesk/
│   │   │   ├── layout.tsx
│   │   │   ├── leave/
│   │   │   ├── notifications/
│   │   │   ├── performance/
│   │   │   └── team/
│   │   ├── super-admin/         # Super Admin Platform Control Center
│   │   │   ├── audit-logs/
│   │   │   ├── dashboard/
│   │   │   ├── employees/
│   │   │   ├── integrations/
│   │   │   ├── notifications/
│   │   │   ├── organization-structure/
│   │   │   ├── organizations/
│   │   │   ├── reports/
│   │   │   ├── roles/
│   │   │   ├── security/
│   │   │   ├── settings/
│   │   │   └── users/
│   │   ├── layout.tsx           # Global Root Layout
│   │   └── page.tsx             # Root Redirect Landing Page
│   ├── components/              # Reusable React UI Components
│   │   ├── auth/                # AuthGuard & Permission Wrappers
│   │   ├── layout/              # Shared Shells (AdminLayout, ManagerLayout, Header, Sidebar)
│   │   └── modals/              # Enterprise Modals (Leave, Performance, Ticket, Payslip)
│   ├── lib/                     # Server Helpers & Utilities
│   │   ├── audit.ts             # Audit Trail Logging Utility
│   │   ├── auth.ts              # Authentication & Session Resolver
│   │   ├── dateUtils.ts         # Centralized IST Date Formatting (Asia/Kolkata)
│   │   ├── mailer.ts            # Nodemailer Email & OTP Transporter
│   │   └── mongodb.ts           # Database Client & GridFS Helper
│   ├── store/                   # Client State Management
│   │   ├── authStore.ts         # Authentication & User Session Store
│   │   └── emsStore.ts          # Application State Store
│   └── types/                   # TypeScript Interfaces & Definitions
├── .env.example                 # Environment Variables Template
├── next.config.mjs              # Next.js Configuration
├── package.json                 # Project Dependencies & Scripts
├── tailwind.config.ts           # Tailwind Styling Configuration
└── tsconfig.json                # TypeScript Configuration
```

---

## Authentication System

The authentication layer features password authentication, email OTP verification, session token validation, and brute-force protection:

```
[ User Input ] ---> POST /api/v1/auth/login
                           │
             ┌─────────────┴─────────────┐
             ▼                           ▼
   [ Invalid Credentials ]    [ Valid Credentials ]
             │                           │
  Check Lockout Threshold       Generate OTP (if enabled)
  (5 Failed Attempts = 15m)              │
                                         ▼
                                Send Email via Nodemailer
                                (Gmail SMTP Transport)
                                         │
                                         ▼
                                POST /api/v1/auth/verify-otp
                                         │
                                         ▼
                                Issue HTTP-Only Cookie
                                (`ems_session`) & Session Token
```

### Authentication Features
- **Password Security**: Credentials matched against hashed password database records.
- **Brute-Force Lockout**: 5 consecutive failed login attempts trigger a 15-minute account lockout (`lockoutUntil`).
- **Nodemailer SMTP Transporter**: Outbound email notification and 6-digit OTP delivery via SMTP (`GMAIL_USER` and `GMAIL_APP_PASSWORD`).
- **Session Revocation**: API endpoint `/api/v1/auth/logout` revokes active session documents in the `user_sessions` MongoDB collection and clears cookies.
- **Role-Based Redirects**: Authenticated users are routed to their designated home portal (`/super-admin/dashboard`, `/admin/dashboard`, `/manager/dashboard`, `/employee/dashboard`).

---

## RBAC & Security Protections

1. **Server-Derived Identity**: User identity, role, employee ID, and tenant ID are read from verified server session objects.
2. **Strict Organization Isolation**: All database queries enforce `{ organizationId: auth.organizationId }`.
3. **Manager Team Scope Control**: Managers are strictly bounded to their direct report team (`managerId` or `reportingTo`). Attempting to view or mutate another manager's employee yields a `403 Forbidden` response.
4. **GridFS Binary File Security**: Streamed binary files (`/api/v1/documents/[id]/file`) check user ownership or ticket/conversation participation before piping file streams to the HTTP response.
5. **Data Leak Audit Projections**: Database queries use explicit MongoDB projections to omit sensitive attributes (`passwordHash`, `otpSecret`, `sessionToken`, `internalNotes`).
6. **Audit Trails**: Security actions (logins, status modifications, leave approvals, document updates) trigger `logAuditEvent()` log writes into the `audit_logs` collection.

---

## Manager Panel

The **Manager Panel** provides a private workspace for people managers to oversee their authorized direct reports.

```
┌──────────────────────────────────────────────────────────────────┐
│ Manager Panel Shell (src/app/manager/layout.tsx)                 │
│ ┌───────────────────────┬──────────────────────────────────────┐ │
│ │ Manager Sidebar       │ Manager Header                       │ │
│ │ (bg-slate-950, w-64)  │ (h-16, Breadcrumbs, Notifications)   │ │
│ │                       ├──────────────────────────────────────┤ │
│ │ - Dashboard           │                                      │ │
│ │ - My Team             │ Workspace Page Content Area          │ │
│ │ - Attendance          │                                      │ │
│ │ - Leave               │                                      │ │
│ │ - Performance         │                                      │ │
│ │ - Communication       │                                      │ │
│ │ - Notifications       │                                      │ │
│ │ - Helpdesk            │                                      │ │
│ └───────────────────────┴──────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

### Manager Modules & Routes

#### 1. Dashboard (`/manager/dashboard`)
- Real team metrics: total direct reports, present count today, on leave today, pending leave approvals, and open helpdesk tickets.
- Today's attendance summary table and quick action buttons for leave approvals.

#### 2. My Team (`/manager/team`)
- Direct report employee directory filtered strictly to the manager's team scope.
- Multi-field search (name, email, designation), status filter, pagination, and employee detail inspection modal.

#### 3. Attendance (`/manager/attendance`)
- Daily check-in/check-out logs for team members.
- Date filter, month filter, status filter (Present, Late, Half Day, Absent), and IST timezone formatting (`Asia/Kolkata`).

#### 4. Leave (`/manager/leave`)
- Team leave request management displaying pending, approved, and rejected applications.
- Approve and Reject modals with rejection reason inputs and authorization verification.

#### 5. Performance (`/manager/performance`)
- Performance evaluation workspace for team members.
- Conduct Appraisal modal: 1-5 star ratings, review period selection, goals tracking, reviewer feedback, and historical reviews list.

#### 6. Communication (`/manager/communication`)
- Private 1-on-1 messaging channel with team members.
- Message history stream, new conversation modal, and 10MB GridFS binary file attachment uploads.

#### 7. Notifications (`/manager/notifications`)
- Manager notification center for team events, leave submissions, and performance updates.
- Real-time unread counter badge, single mark-as-read, bulk mark-all-as-read, category filters, and pagination.

#### 8. Helpdesk (`/manager/helpdesk`)
- Support requests submitted by team members or escalated to the manager.
- Status transition selector (`Open` → `Assigned` → `In Progress` → `Resolved` → `Closed`), reply comment stream, attachment downloader, and internal note protection.

*Note on `/manager/employees`: Marked as **obsolete/legacy**. `/manager/team` is the official, secure Team Directory workspace for Managers.*

---

## Employee Panel

The **Employee Panel** empowers staff members with self-service HR operations:

| Route | Feature Summary |
| :--- | :--- |
| `/employee/dashboard` | Personalized summary: attendance stats, leave balances, recent payslips, and announcements. |
| `/employee/attendance` | Personal check-in/check-out button, daily attendance logs, working hours, and IST timestamps. |
| `/employee/leave` | Leave balance breakdown, new leave application modal with attachment upload, and status tracker. |
| `/employee/payroll` | Monthly payslip viewer, breakdown of allowances and deductions, and PDF payslip download. |
| `/employee/performance` | Self-performance view: assigned goals, historical reviews, manager ratings, and review feedback. |
| `/employee/documents` | Personal document library: contract files, tax forms, IDs, and secure file downloader. |
| `/employee/messages` | Direct private conversation channel with assigned Manager and HR team. |
| `/employee/notifications` | Personal notification inbox with category filters and unread status toggles. |
| `/employee/helpdesk` | Support request submission modal, ticket status tracker, and comment stream. |
| `/employee/profile` | Personal profile management: contact details, emergency contacts, and profile photo update. |
| `/employee/settings` | Personal account preferences and password change modal. |

---

## Admin / HR Panel

The **Admin / HR Panel** provides tools for human resource operations and organization management:

| Route | Capabilities |
| :--- | :--- |
| `/admin/dashboard` | Organization-wide KPI metrics, total headcount, overall attendance rates, active leaves, and payroll summary. |
| `/admin/employees` | Complete employee master list, new employee creation modal, status updates, and profile edits. |
| `/admin/organization` | Department & designation structure, reporting manager assignments, and branch locations. |
| `/admin/attendance` | Organization-wide daily attendance records, manual attendance override modal, and attendance report export. |
| `/admin/leave` | Organization leave approval portal, custom leave policy configuration, and annual balance adjustments. |
| `/admin/payroll` | Bulk monthly payroll generation, salary structure configuration, tax deductions, and disbursement approval. |
| `/admin/performance` | Organization performance cycle setup, evaluation forms configuration, and department rating distribution. |
| `/admin/documents` | Organization document repository, company policies distribution, and document expiration tracking. |
| `/admin/recruitment` | Job opening creation, applicant tracking pipeline (ATS), candidate interview scheduling, and offer letters. |
| `/admin/communication` | Broadcast announcements creator, department notification sender, and direct message inbox. |
| `/admin/notifications` | Organization notification dispatch logs and automated event notification triggers. |
| `/admin/reports` | Analytics workspace for attendance, leave trends, headcount growth, attrition, and payroll expenditures. |
| `/admin/helpdesk` | Master support ticket resolution portal, ticket assignment to HR staff, resolution notes, and status management. |
| `/admin/settings` | Organization profile settings, working days/hours rules, leave policies, and email template setups. |
| `/admin/audit-logs` | Organization security audit logs viewer with performer, IP address, action type, and date filters. |
| `/admin/integrations` | External integrations configuration (WhatsApp Meta Graph API, Microsoft SSO, Biometric devices). |

---

## Super Admin Panel

The **Super Admin Panel** allows system owners to control multi-tenant infrastructure:

| Route | Purpose & Capabilities |
| :--- | :--- |
| `/super-admin/dashboard` | Cross-tenant platform metrics: total active organizations, platform users, system health, and storage stats. |
| `/super-admin/organizations` | Tenant organization management: onboarding new organizations, subscription status, and tenant deletion. |
| `/super-admin/organization-structure` | Global organization hierarchy inspector and department template manager. |
| `/super-admin/users` | Platform user accounts directory, global role assignment, password resets, and session revoking. |
| `/super-admin/roles` | Granular Role-Based Access Control (RBAC) permission configuration and custom role definitions. |
| `/super-admin/employees` | Platform-wide employee record inspector across all tenant organizations. |
| `/super-admin/security` | Platform security diagnostic dashboard, global active session revoker, and brute-force lockout controls. |
| `/super-admin/audit-logs` | Master system audit log containing cross-tenant actions, administrative overrides, and system changes. |
| `/super-admin/settings` | Platform system settings, SMTP mail server test suite (`test-smtp`), database connection health check, and system configuration. |
| `/super-admin/integrations` | Global integration connectors and API key management. |
| `/super-admin/notifications` | Platform-wide notification broadcast engine and retention policy manager. |
| `/super-admin/reports` | Global system utilization reports and tenant growth analytics. |

---

## Database Collections

The system utilizes 16 MongoDB collections within the configured database (`ems_hrms`):

```
                                ┌──────────────────────────┐
                                │     MongoDB Database     │
                                └────────────┬─────────────┘
                                             │
      ┌──────────────────────┬───────────────┼───────────────┬──────────────────────┐
      ▼                      ▼               ▼               ▼                      ▼
┌───────────┐          ┌───────────┐   ┌───────────┐   ┌───────────┐          ┌───────────┐
│   users   │          │ employees │   │attendance │   │  leaves   │          │ payroll_  │
└───────────┘          └───────────┘   └───────────┘   └───────────┘          │  records  │
                                                                              └───────────┘
      ┌──────────────────────┬───────────────┼───────────────┬──────────────────────┐
      ▼                      ▼               ▼               ▼                      ▼
┌───────────┐          ┌───────────┐   ┌───────────┐   ┌───────────┐          ┌───────────┐
│performance│          │ hr_       │   │   hr_     │   │ conversa- │          │notifica-  │
│ _reviews  │          │ requests  │   │ request_  │   │  tions    │          │  tions    │
└───────────┘          └───────────┘   │ comments  │   └───────────┘          └───────────┘
                                       └───────────┘
      ┌──────────────────────┬───────────────┼───────────────┬──────────────────────┐
      ▼                      ▼               ▼               ▼                      ▼
┌───────────┐          ┌───────────┐   ┌───────────┐   ┌───────────┐          ┌───────────┐
│audit_logs │          │ documents │   │  jobs     │   │ candidates│          │   user_   │
└───────────┘          └───────────┘   └───────────┘   └───────────┘          │ sessions  │
                                                                              └───────────┘
```

1. `users`: Authentication records, email, hashed passwords, role (`SUPER_ADMIN`, `ADMIN`, `HR`, `MANAGER`, `EMPLOYEE`), `organizationId`, and status.
2. `employees`: Detailed employee profiles, `employeeId`, personal details, department, designation, `managerId`, `reportingTo`, joining date, and status.
3. `attendance`: Daily time tracking records, `employeeId`, date (`YYYY-MM-DD`), `checkInTime`, `checkOutTime`, `workingHours`, `status`, and location metadata.
4. `leaves`: Employee leave applications, `leaveType`, `startDate`, `endDate`, `durationDays`, `reason`, `status` (`Pending`, `Approved`, `Rejected`), `approvedBy`, and attachments.
5. `leave_balances`: Entitlement allocation balances per employee per year for Sick, Casual, and Earned leaves.
6. `payroll_records`: Compensation disbursements, basic salary, allowances, deductions, net pay, payment status, and generated payslips.
7. `performance_reviews`: Performance evaluation records, review period, ratings (1-5), goals list, reviewer feedback, and evaluation date.
8. `hr_requests`: Support tickets, ticket number (`ticketNo`), category, subject, description, priority (`Low`, `Medium`, `High`, `Urgent`), status, and assigned staff.
9. `hr_request_comments`: Threaded comments on support tickets, author details, comment text, `isInternal` flag, and file attachments.
10. `conversations`: Private 1-on-1 messaging threads between employees, managers, and HR, last message snippets, and unread counters.
11. `messages`: Individual chat messages within conversation threads, sender identity, message text, and GridFS attachment URLs.
12. `notifications`: System and user notifications, recipient ID, category, title, message body, `isRead` status, priority, and link.
13. `audit_logs`: Immutable audit trails, action type, performer identity, IP address, user agent, changes payload, and IST timestamp.
14. `documents`: File metadata records, document name, category, GridFS `fileId`, file size, mime type, upload date, and expiration.
15. `jobs`: Recruitment job openings, title, department, employment type, requirements description, salary range, and posting status.
16. `candidates`: Job applicant profiles, applicant name, email, applied position, ATS pipeline status, resume file URL, and interview notes.
17. `user_sessions`: Active authentication session tokens, user ID, IP address, user agent, login timestamp, and expiration.

---

## MongoDB GridFS Storage

The application utilizes **MongoDB GridFS** (`documents.files` and `documents.chunks` buckets) to store binary assets:

### Key Storage Features
- **Binary Storage**: Uploaded files (profile photos, organization logos, support ticket attachments, candidate resumes) are stored in GridFS.
- **File Upload Endpoint**: `POST /api/v1/documents` handles multipart form data, validates file size (maximum 10MB), writes binary buffers into GridFS, and creates a metadata record in the `documents` collection.
- **Streaming Retrieval Endpoint**: `GET /api/v1/documents/[id]/file` retrieves the binary file stream from GridFS and sets appropriate HTTP content-type header (`image/png`, `application/pdf`, etc.).
- **Access Authorization**: The file retrieval endpoint verifies session authentication and inspects file metadata to ensure the requesting user is authorized to download the target file.

---

## Representative API Documentation

Below is a representative overview of core API endpoints available under `/api/v1/*`:

### Authentication APIs
- `POST /api/v1/auth/login`: Authenticate credentials, trigger OTP email, and initiate session.
- `POST /api/v1/auth/verify-otp`: Verify 6-digit OTP code and issue session token/cookie.
- `POST /api/v1/auth/logout`: Terminate active session and clear authentication cookie.
- `POST /api/v1/auth/forgot-password`: Dispatch password reset link/token to user email.
- `POST /api/v1/auth/reset-password`: Execute password reset using valid reset token.

### Employee Management APIs
- `GET /api/v1/employees`: Search and list employee records (filtered by tenant/team).
- `POST /api/v1/employees`: Create new employee record and user login credentials.
- `GET /api/v1/employees/[id]`: Retrieve detailed employee profile information.
- `PATCH /api/v1/employees/[id]`: Update employee designation, department, status, or manager.

### Attendance APIs
- `GET /api/v1/attendance`: Fetch daily attendance records (supports date, month, department filters).
- `POST /api/v1/attendance/check-in`: Record check-in timestamp and geolocation for current user.
- `POST /api/v1/attendance/check-out`: Record check-out timestamp and compute working hours.

### Leave APIs
- `GET /api/v1/leave`: Fetch leave applications with status filtering.
- `POST /api/v1/leave`: Submit a new leave request with optional file attachment.
- `PATCH /api/v1/leave/[id]`: Process leave request status (`Approved`, `Rejected`, `Cancelled`).

### Manager Dedicated APIs
- `GET /api/v1/manager/dashboard`: Retrieve team metrics, today's attendance, and pending leave counts.
- `GET /api/v1/manager/team`: Fetch direct reporting employees for the authenticated manager.
- `GET /api/v1/manager/attendance`: Fetch attendance records for manager's direct reports.
- `GET /api/v1/manager/leave`: Fetch leave requests submitted by manager's team members.

### Performance APIs
- `GET /api/v1/performance`: List performance appraisal reviews (scoped by role/team).
- `POST /api/v1/performance`: Submit or update performance review rating and goals.

### Documents & GridFS APIs
- `POST /api/v1/documents`: Upload file binary buffer to GridFS (10MB limit).
- `GET /api/v1/documents/[id]/file`: Stream binary file from GridFS with content header.

### Messages & Communication APIs
- `GET /api/v1/messages/conversations`: List active conversation threads.
- `POST /api/v1/messages/conversations`: Create new conversation thread with recipient.
- `POST /api/v1/messages/conversations/[id]/messages`: Send reply message with attachment.

### Notifications APIs
- `GET /api/v1/notifications`: List notifications for authenticated user with unread counter.
- `PATCH /api/v1/notifications/[id]/read`: Mark individual notification as read.
- `PATCH /api/v1/notifications/mark-all-read`: Mark all user notifications as read.

### HR Helpdesk APIs
- `GET /api/v1/hr-requests`: List support tickets (scoped by organization/team).
- `POST /api/v1/hr-requests`: Open a new support ticket with subject, category, and priority.
- `GET /api/v1/hr-requests/[id]`: Fetch support ticket details and non-internal comments.
- `POST /api/v1/hr-requests/[id]/comments`: Post comment or internal note to ticket thread.
- `PATCH /api/v1/hr-requests/[id]/status`: Update support ticket status (`Open` → `Resolved`).

---

## Environment Variables

To run the application, configure the following environment variable names in a `.env.local` file:

```env
# Database Configuration
MONGODB_URI=
MONGODB_DB=

# SMTP Email Service (Gmail Transporter)
GMAIL_USER=
GMAIL_APP_PASSWORD=
GMAIL_FROM=
GMAIL_FROM_NAME=
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=

# Security & Encryption
INTEGRATION_ENCRYPTION_KEY=
SUPER_ADMIN_BOOTSTRAP_SECRET=
CRON_SECRET=

# External Integrations (Optional)
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_API_TOKEN=
MICROSOFT_TENANT_ID=
MICROSOFT_CLIENT_ID=
MICROSOFT_ACCESS_TOKEN=
BIOMETRIC_CONNECTOR_URL=
BIOMETRIC_API_KEY=

# Application Mode
NEXT_PUBLIC_DEMO_MODE=
```

---

## Getting Started & Local Setup

### Prerequisites
- **Node.js**: `v18.x` or `v20.x` installed
- **npm**: `v9.x` or `v10.x` installed
- **MongoDB**: Active MongoDB Atlas cluster or local MongoDB instance (`v6.0+` or `v7.0+`)

### Step-by-Step Installation

1. **Clone the Repository**
   ```bash
   git clone https://github.com/your-organization/employee-management-system.git
   cd employee-management-system
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Configure Environment Variables**
   Create a `.env.local` file in the project root:
   ```bash
   cp .env.example .env.local
   ```
   Fill in your `MONGODB_URI` and Nodemailer `GMAIL_USER` / `GMAIL_APP_PASSWORD` credentials.

4. **Run Development Server**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your web browser.

5. **Type Checking & Production Build**
   Validate TypeScript definitions and create an optimized production build:
   ```bash
   # Validate TypeScript types
   npx tsc --noEmit

   # Execute production build
   npm run build

   # Start production server
   npm run start
   ```

---

### License

This project is licensed under Enterprise Proprietary Software License. All rights reserved.
