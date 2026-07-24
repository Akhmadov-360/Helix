# PRD — Helix: AI-Native, Project-Based CRM

> **Working name:** Helix _(placeholder — rename freely)_ **Document type:** Product Requirements Document **Version:** 0.1 (Draft) **Status:** For review **Last updated:** 2026-07-19 **Owner:** Product

---

## 1. Overview

### 1.1 The core reframe

Helix is a CRM where **every lead is a project, and every project is a lead**. There is no separate "deals table" that feeds a separate "delivery board." A lead enters as a card in a pipeline, moves through configurable phases, and along the way accumulates its own workspace: pages, a knowledge base, files, contacts, a lightweight task list, and an AI that can answer questions about _that specific project_.

This is deliberately **not** Jira. We are not modeling sprints, story points, or engineering task dependencies. "High-level project management" here means: phases, assignees, due dates, checklists, and status — enough to run a lead from first contact to closed-won without a second tool, and nothing more.

### 1.2 One-line description

> A Kanban-native, AI-augmented CRM where leads are first-class project workspaces, bootstrapped from B2B/B2C blueprints, with per-project RAG chat, RBAC, file handling, email alerts, and a public API.

### 1.3 Why now

Small agencies, studios, real-estate teams, consultancies, and B2C service businesses juggle a CRM, a docs tool, a file store, and a chat-with-your-docs tool. The lead-as-project model collapses these into one surface, and generative AI makes "ask your pipeline" viable as a primary interface rather than a bolt-on.

---

## 2. Goals & Non-Goals

### 2.1 Goals

| #   | Goal                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------- |
| G1  | Let a user spin up a working, opinionated CRM in minutes via **blueprints** (B2B / B2C).                |
| G2  | Treat each lead as a **project workspace** with pages, KB, files, tasks, and contacts.                  |
| G3  | Provide **configurable phases** (Kanban columns) per workspace.                                         |
| G4  | Ship **talk-to-project AI** grounded in that project's own data (RAG + tool use).                       |
| G5  | Enforce **RBAC** at org, workspace, and record level.                                                   |
| G6  | Notify the right people **by email** when leads arrive or change.                                       |
| G7  | Expose a **public REST API + webhooks** so external apps can create/read leads and react to events.     |
| G8  | Run **anywhere** (Docker Compose / any container host) with a **first-class AWS** reference deployment. |
| G9  | Serve both **B2C** (person-centric) and **B2B** (company-and-contacts) use cases from one data model.   |

### 2.2 Non-Goals (v1)

- Deep engineering task management (sub-tasks, dependencies, sprints, burndown). Out of scope by design.
- Full marketing automation / drip campaigns / email sequencing engine.
- Native mobile apps (responsive web only for v1).
- Built-in telephony / dialer / call recording.
- Full accounting / invoicing (we integrate out via API/webhooks instead).
- A public marketplace of third-party plugins.

---

## 3. Personas

| Persona                              | Context                                                                                                           | Primary need                                                  |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| **Studio owner (B2B)** — "Max"       | Runs a software agency / venture studio. Wants leads → discovery → planning → contract in one place, dogfoodable. | Structure, oversight, AI summaries, contracts/files per lead. |
| **Sales manager (B2B/B2C)** — "Dana" | Oversees a small team; assigns and reassigns leads; watches conversion.                                           | RBAC, visibility, reassignment, reporting.                    |
| **Agent / Rep** — "Sam"              | Works individual leads day-to-day.                                                                                | Fast lead entry, phase moves, AI drafts, file uploads.        |
| **Realtor (B2C)** — "Priya"          | Person-centric leads (buyers/sellers), each a "project" from inquiry to close.                                    | Lightweight per-person workspace, KB of listings/process.     |
| **Ops / Admin** — "Leo"              | Configures workspaces, blueprints, integrations, roles.                                                           | Blueprint config, API keys, webhooks, permissions.            |
| **External system**                  | An accounting app, website form, Zapier/n8n flow.                                                                 | Programmatic lead creation + event subscription.              |

---

## 4. Terminology (glossary)

The requirements overload the word "project," so we fix precise terms here. The UI can still surface friendlier labels.

| Term                            | Definition                                                                                                                                                             | UI label options                          |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| **Organization (Org / Tenant)** | The top-level account boundary. All data is isolated per org.                                                                                                          | "Organization"                            |
| **Workspace**                   | A single project-based CRM: one board, one set of phases, its own members, blueprint origin, and settings. An org can have many.                                       | "CRM", "Pipeline", "Board", "Project-CRM" |
| **Phase**                       | A configurable column/stage within a workspace (e.g., _Call Request → Discovery → Planning → Contract_).                                                               | "Phase", "Column", "Stage"                |
| **Project**                     | **A single lead**, rendered as a card in a phase, but backed by a full workspace of pages/KB/files/tasks/AI. This is the "lead-as-project."                            | "Lead", "Project", "Deal"                 |
| **Contact**                     | A person.                                                                                                                                                              | "Contact"                                 |
| **Company**                     | An organization the lead belongs to (B2B).                                                                                                                             | "Company", "Account"                      |
| **Blueprint**                   | A reusable template that instantiates a Workspace (phases + field schema + page templates + seed KB + automations + notification defaults), tagged **B2B** or **B2C**. | "Blueprint", "Template"                   |

> **Mapping to the requested flow.** The requirement _"'New project' → 'Start with blueprint?' → B2C/B2B → general form"_ maps to **creating a new Workspace**, because a blueprint defines _phases_, which are workspace-level. The "general project-specific form" collects the **Workspace** name and a few settings. Individual leads inside that workspace are **Projects**. (A lighter, optional "Project template" concept for pre-filling a single lead is noted in §7.5.4.)

---

## 5. Domain Model

### 5.1 Entities & relationships (conceptual ERD)

```
Organization 1───n User (via Membership, with org role)
Organization 1───n Workspace
Organization 1───n Blueprint (system + custom)
Organization 1───n ApiKey / Webhook

Workspace   1───n Phase (ordered)
Workspace   1───n WorkspaceMember (User + workspace role override)
Workspace   1───n Project           ── each Project has exactly one Phase
Workspace   1───n FieldDefinition   (custom field schema for its Projects)

Project (=Lead) n───1 Phase
Project     1───0..1 Company         (B2B)
Project     n───n Contact            (via ProjectContact)
Project     1───n Page               (rich docs)
Project     1───n Task               (checklist / high-level PM)
Project     1───n Attachment         (files in object storage)
Project     1───n ActivityEvent      (audit / timeline)
Project     1───n AiThread → n Message

Workspace/Org 1───n KBArticle        (KB can be workspace- or org-scoped)

Any(Project|Page|KBArticle|Attachment) 1───n EmbeddingChunk (pgvector) for RAG
```

### 5.2 Key tables (Prisma-style sketch)

```prisma
model Organization { id String @id; name String; plan String; createdAt DateTime @default(now()) }

model User { id String @id; email String @unique; name String; passwordHash String?; ssoSub String? }

model Membership {          // org-level role
  id String @id; orgId String; userId String; role Role   // OWNER|ADMIN|MANAGER|MEMBER|VIEWER
  @@unique([orgId, userId])
}

model Workspace {
  id String @id; orgId String; name String; audience Audience // B2B|B2C|MIXED
  blueprintId String?; settings Json; createdAt DateTime @default(now())
}

model WorkspaceMember {     // per-workspace role override + visibility scope
  id String @id; workspaceId String; userId String; role Role; visibility Visibility // ALL|ASSIGNED
  @@unique([workspaceId, userId])
}

model Phase { id String @id; workspaceId String; key String; name String; order Int; color String?; type PhaseType } // OPEN|WON|LOST

model FieldDefinition { id String @id; workspaceId String; key String; label String; type FieldType; options Json?; required Boolean }

model Project {            // THE LEAD
  id String @id; workspaceId String; phaseId String; title String
  value Decimal?; currency String?; source String?
  companyId String?; ownerId String?     // primary owner
  fields Json                            // custom field values
  status ProjectStatus                    // OPEN|WON|LOST|ARCHIVED
  createdAt DateTime @default(now()); updatedAt DateTime @updatedAt
}

model ProjectAssignee { projectId String; userId String; @@id([projectId, userId]) }
model Contact { id String @id; orgId String; name String; email String?; phone String?; companyId String? }
model Company { id String @id; orgId String; name String; domain String?; industry String? }
model Page { id String @id; projectId String; title String; contentJson Json; updatedAt DateTime @updatedAt }
model Task { id String @id; projectId String; title String; done Boolean; assigneeId String?; dueAt DateTime? }
model Attachment { id String @id; projectId String; key String; filename String; size Int; mime String; scanStatus String }
model KBArticle { id String @id; orgId String; workspaceId String?; title String; contentJson Json; tags String[] }
model ActivityEvent { id String @id; projectId String; actorId String?; type String; payload Json; createdAt DateTime @default(now()) }
model AiThread { id String @id; projectId String; title String }
model Message { id String @id; threadId String; role String; content String; toolCalls Json?; createdAt DateTime @default(now()) }
model EmbeddingChunk { id String @id; orgId String; sourceType String; sourceId String; content String; embedding Unsupported("vector(1536)"); }
model ApiKey { id String @id; orgId String; name String; hashedKey String; scopes String[]; lastUsedAt DateTime? }
model Webhook { id String @id; orgId String; url String; events String[]; secret String; active Boolean }
```

> **Custom fields** are stored as `Project.fields` (JSON) validated against the workspace's `FieldDefinition[]`. This keeps B2C vs B2B field differences data-driven rather than requiring schema migrations.

---

## 6. Functional Requirements

Requirements use `MUST` / `SHOULD` / `MAY` (RFC-2119 sense). IDs are stable references.

### 7.1 Multi-tenancy & Organizations

- **FR-ORG-1 (MUST)** Every record is scoped to an `orgId`; queries are tenant-filtered at the data-access layer (see §11.1).
- **FR-ORG-2 (MUST)** A user can belong to multiple orgs and switch context.
- **FR-ORG-3 (SHOULD)** Org-level settings: default currency, timezone, branding, AI provider/region.

### 7.2 Workspaces (Project-CRMs) & Phases

- **FR-WS-1 (MUST)** Users with permission can create a Workspace, optionally **from a Blueprint** (§7.5).
- **FR-WS-2 (MUST)** Each Workspace has an ordered list of **Phases**; users can add, rename, reorder (drag-drop), recolor, and delete phases.
- **FR-WS-3 (MUST)** Phases have a `type`: `OPEN`, `WON`, `LOST`. Moving a Project into a `WON`/`LOST` phase sets its `status` and fires events.
- **FR-WS-4 (MUST)** Deleting a phase requires reassigning its Projects to another phase (no orphans).
- **FR-WS-5 (SHOULD)** Per-phase automations (e.g., "on enter _Contract_, create task 'Send DocuSign'").
- **FR-WS-6 (SHOULD)** WIP limits and per-phase required-fields (a Project can't leave _Discovery_ until required fields are filled).

### 7.3 Projects (Leads) & high-level PM

- **FR-PRJ-1 (MUST)** Create a Project (lead) manually, via blueprint prefill, or via the public API.
- **FR-PRJ-2 (MUST)** A Project lives in exactly one Phase and can be moved via drag-drop or API. Every move logs an `ActivityEvent`.
- **FR-PRJ-3 (MUST)** A Project has: title, value/currency, source, owner, assignees, custom fields, status.
- **FR-PRJ-4 (MUST)** **High-level PM:** each Project has a **Task checklist** (title, assignee, due date, done). No sub-tasks/dependencies in v1.
- **FR-PRJ-5 (MUST)** Each Project has a **timeline/activity feed** aggregating moves, edits, files, tasks, emails, AI actions.
- **FR-PRJ-6 (SHOULD)** Due dates & overdue indicators on Projects and Tasks; filterable board.
- **FR-PRJ-7 (SHOULD)** Board views: Kanban (default), Table, and a per-Project detail view ("project page shell").
- **FR-PRJ-8 (MAY)** Saved filters and simple pipeline reports (count/value by phase, conversion, cycle time).

### 7.4 Contacts & Companies (B2C / B2B)

- **FR-CC-1 (MUST)** **B2C mode:** a Project links directly to one or more **Contacts** (people). Company optional.
- **FR-CC-2 (MUST)** **B2B mode:** a Project links to a **Company** plus one or more **Contacts** at that company (roles: decision-maker, champion, etc.).
- **FR-CC-3 (MUST)** The Workspace `audience` (B2B/B2C/MIXED) drives which fields and link UIs appear; the underlying model supports both simultaneously.
- **FR-CC-4 (SHOULD)** De-duplication hints on contact email/phone and company domain.

### 7.5 Blueprints — "Start with a blueprint"

- **FR-BP-1 (MUST)** Ship a library of **system blueprints**, each tagged **B2B** or **B2C**, each with a **preview** (phases, sample fields, sample pages).

- **FR-BP-2 (MUST)** Blueprint creation flow (matching the requested UX):

  ```
  New Workspace
    └─ "Start with a blueprint?"
         ├─ No  → blank workspace (define phases yourself)
         └─ Yes → choose "B2C" or "B2B"
                    └─ pick a blueprint (grid of cards with previews)
                         └─ "General form": Workspace name, currency, timezone, members
                              └─ Instantiate: phases + field schema + page templates
                                 + seed KB + automations + notification defaults
  ```

- **FR-BP-3 (MUST)** Instantiating a blueprint is a **copy**, not a live link — later edits to the blueprint don't mutate existing workspaces.

- **FR-BP-4 (SHOULD)** Users can **save any existing Workspace as a custom blueprint** (org-private).

- **FR-BP-5 (MAY)** Per-lead **Project templates** (a lighter blueprint that pre-fills a single Project's pages/tasks/fields on creation).

**Sample system blueprints**

| Audience | Blueprint                       | Phases                                                     |
| -------- | ------------------------------- | ---------------------------------------------------------- |
| B2B      | Software Agency Client Pipeline | Call Request → Discovery → Planning → Contract → Won/Lost  |
| B2B      | SaaS Sales                      | Inbound → Qualify → Demo → Proposal → Negotiation → Closed |
| B2B      | Consulting Engagement           | Intro Call → Scoping → SOW → Kickoff → Delivery            |
| B2C      | Real Estate Buyer               | Inquiry → Pre-qualified → Viewing → Offer → Closing        |
| B2C      | Home Services                   | Request → Quote → Scheduled → In Progress → Paid           |
| B2C      | Coaching / Wellness             | Lead → Consult → Package → Onboarding → Active             |

**Sample blueprint definition (excerpt)**

```json
{
  "id": "bp_b2b_software_agency",
  "audience": "B2B",
  "name": "B2B — Software Agency Client Pipeline",
  "preview": { "thumbnail": "…", "summary": "Lead-gen for dev shops." },
  "phases": [
    { "key": "call_request", "name": "Call Request", "order": 1, "type": "OPEN" },
    { "key": "discovery", "name": "Discovery", "order": 2, "type": "OPEN" },
    { "key": "planning", "name": "Planning", "order": 3, "type": "OPEN" },
    { "key": "contract", "name": "Contract", "order": 4, "type": "OPEN" },
    { "key": "won", "name": "Won", "order": 5, "type": "WON" },
    { "key": "lost", "name": "Lost", "order": 6, "type": "LOST" }
  ],
  "projectFields": [
    { "key": "budget", "label": "Budget", "type": "currency" },
    { "key": "tech_stack", "label": "Preferred Stack", "type": "multiselect", "options": ["TS", "Python", "Go"] },
    { "key": "timeline", "label": "Target Start", "type": "date" }
  ],
  "pageTemplates": [
    { "title": "Discovery Notes", "contentJson": { "…": "…" } },
    { "title": "Proposal Draft", "contentJson": { "…": "…" } }
  ],
  "kbSeed": [{ "title": "Our Delivery Process", "contentJson": { "…": "…" } }],
  "automations": [
    {
      "on": "phase.enter",
      "phase": "contract",
      "do": "task.create",
      "with": { "title": "Send contract for signature" }
    }
  ],
  "notificationDefaults": { "newLead": { "email": true, "recipients": ["workspace_owner", "assignees"] } }
}
```

### 7.6 RBAC

- **FR-RBAC-1 (MUST)** Roles at **two scopes**: **org role** (baseline) and optional **per-workspace role override**.
- **FR-RBAC-2 (MUST)** Default roles: **Owner, Admin, Manager, Member, Viewer** (matrix in Appendix B).
- **FR-RBAC-3 (MUST)** **Record-level visibility:** a workspace member's `visibility` is `ALL` or `ASSIGNED` (can only see leads they own/are assigned to).
- **FR-RBAC-4 (SHOULD)** **Custom roles** defined as permission bundles (subject × action).
- **FR-RBAC-5 (MUST)** Permissions enforced **server-side** on every endpoint (policy guards), not just hidden in the UI.
- **FR-RBAC-6 (MUST)** API keys carry **scopes** independent of any user (e.g., `leads:write` only).

### 7.7 Project Pages & Knowledge Base

- **FR-PG-1 (MUST)** Each Project has **Pages**: rich-text documents (headings, lists, tables, embeds, file references) via a block editor (TipTap/ProseMirror JSON).
- **FR-PG-2 (MUST)** A **Knowledge Base** of articles, scoped **org-wide** or **per-workspace**, with tags and search.
- **FR-PG-3 (MUST)** Pages and KB articles are **indexed for RAG** (§7.8) so the AI can cite them.
- **FR-PG-4 (SHOULD)** Page templates (from blueprint) auto-created on Project creation.
- **FR-PG-5 (SHOULD)** Comments/mentions on pages; version history.

### 7.8 Talk-to-Project AI

- **FR-AI-1 (MUST)** Per-Project chat ("Talk to this project") answering questions grounded in **that project's** pages, KB, files, contacts, fields, and activity via **RAG** over scoped embeddings.
- **FR-AI-2 (MUST)** Responses **stream** (SSE) and include **citations** back to the source page/file/KB article.
- **FR-AI-3 (MUST)** **Tool use / actions** (with permission checks): the assistant can propose/perform _move phase_, _create task_, _update field_, _draft email_, _summarize files_. Side-effecting actions require the acting user's permission and are logged.
- **FR-AI-4 (SHOULD)** Higher scopes: **Talk-to-Workspace** ("Which deals are stuck in Discovery >14 days?") and **Talk-to-Org**.
- **FR-AI-5 (SHOULD)** One-tap generative helpers: _summarize this project_, _draft follow-up email_, _next best action_, _extract fields from an uploaded doc_.
- **FR-AI-6 (MUST)** **Provider abstraction:** pluggable LLM/embedding backends — Anthropic API, OpenAI, or **Amazon Bedrock (Claude)** for AWS deployments — configurable per org/region.
- **FR-AI-7 (MUST)** AI never crosses tenant boundaries; retrieval is filtered by `orgId` + scope, enforced server-side.

### 7.9 File Attachments

- **FR-FILE-1 (MUST)** Upload files to a Project via **presigned URLs** to object storage (S3 / S3-compatible MinIO).
- **FR-FILE-2 (MUST)** Metadata stored (filename, size, mime, uploader, scan status); download via short-lived presigned URLs.
- **FR-FILE-3 (SHOULD)** Text-extractable files (PDF, docx, txt, md) are **ingested into RAG** so the AI can reference them.
- **FR-FILE-4 (SHOULD)** Optional async **virus scan** (e.g., ClamAV worker) gating downloads.
- **FR-FILE-5 (MUST)** File access is permission-checked; no public object URLs.

### 7.10 Notifications (email)

- **FR-NOTIF-1 (MUST)** On **new lead** (created via UI or API), email the workspace's configured recipients (owner, assignees, or explicit list).
- **FR-NOTIF-2 (SHOULD)** Notify on phase change, assignment, @mention, task due, won/lost.
- **FR-NOTIF-3 (MUST)** Emails sent **asynchronously** via a queue (BullMQ) with retries; provider is **AWS SES** (primary) or SMTP/SendGrid (fallback), behind a mailer abstraction.
- **FR-NOTIF-4 (SHOULD)** Per-user notification preferences and **daily/weekly digests**.
- **FR-NOTIF-5 (MUST)** Templated, branded HTML emails with deep links back to the Project.

### 7.11 Public API & Integrations

- **FR-API-1 (MUST)** Versioned **REST API** (`/v1/...`) with **OpenAPI/Swagger** docs (NestJS Swagger).
- **FR-API-2 (MUST)** **API-key auth** with scopes; keys are org-scoped, hashed at rest, revocable, with `lastUsedAt`.
- **FR-API-3 (MUST)** **Lead intake endpoint** (`POST /v1/public/leads`) for website forms / external systems → creates a Project + fires notifications.
- **FR-API-4 (MUST)** **Outbound webhooks** with HMAC signatures for events: `lead.created`, `lead.phase_changed`, `lead.won`, `lead.lost`, `task.created`, `file.uploaded`, etc. Retries with backoff; delivery log.
- **FR-API-5 (SHOULD)** Rate limiting per key; idempotency keys on create endpoints.
- **FR-API-6 (SHOULD)** First-party recipes for **Zapier / Make / n8n** built on the public API + webhooks.

### 7.12 Search

- **FR-SEARCH-1 (SHOULD)** Full-text search across Projects, Contacts, Pages, KB (Postgres FTS in v1; OpenSearch as a later option).
- **FR-SEARCH-2 (MAY)** Semantic search reusing the RAG embedding index.

---

## 7. Use Cases

Format: **Actor → Preconditions → Flow → Outcome.**

**UC-1 — Bootstrap a CRM from a B2B blueprint** _Actor:_ Admin. _Pre:_ Org exists. _Flow:_ New Workspace → "Start with blueprint?" Yes → B2B → "Software Agency Client Pipeline" (preview) → name it, set currency/members → instantiate. _Outcome:_ Workspace with 6 phases, custom fields, 2 page templates, seed KB, "new lead" email on.

**UC-2 — Capture an inbound lead via API** _Actor:_ Website form (API key `leads:write`). _Flow:_ `POST /v1/public/leads` with contact + message → Project created in first phase → `lead.created` webhook fires → SES email to recipients. _Outcome:_ New card on the board; team notified within seconds.

**UC-3 — Advance a lead through phases** _Actor:_ Rep. _Flow:_ Drag card _Discovery → Planning_. Required-field guard passes; automation creates task "Prepare estimate"; `ActivityEvent` + `lead.phase_changed` webhook fire. _Outcome:_ Lead advanced, task queued, integrations notified.

**UC-4 — Ask the project a question** _Actor:_ Rep. _Flow:_ Open Project → "Talk to this project" → "What did we agree on in the discovery call and what's outstanding?" → RAG retrieves Discovery Notes page + uploaded transcript → streamed answer with citations. _Outcome:_ Grounded summary without hunting through docs.

**UC-5 — AI performs an action** _Actor:_ Rep. _Flow:_ "Draft a follow-up email and mark discovery complete." → assistant drafts email (user confirms send) and proposes _create task 'Send proposal'_ + _move to Planning_; permission checked; actions logged. _Outcome:_ Assistant acts as a scoped agent.

**UC-6 — Attach and reason over a contract** _Actor:_ Manager. _Flow:_ Upload signed PDF → async text extraction + embedding → ask "What are the payment terms?" → cited answer. _Outcome:_ Files become queryable knowledge.

**UC-7 — Restricted visibility** _Actor:_ Rep with `visibility=ASSIGNED`. _Flow:_ Board shows only their leads; API returns 403 for others; AI can't retrieve chunks outside scope. _Outcome:_ Record-level RBAC holds across UI, API, and AI.

**UC-8 — External integration on won** _Actor:_ Accounting app. _Flow:_ Subscribes to `lead.won` webhook → on won, receives signed payload → creates an invoice. _Outcome:_ Downstream automation with no polling.

**UC-9 — B2C person-centric flow** _Actor:_ Realtor. _Pre:_ B2C "Real Estate Buyer" workspace. _Flow:_ New lead links a **Contact** (no company); moves Inquiry → Viewing; KB holds listing/process docs the AI cites. _Outcome:_ Same engine, person-centric shape.

**UC-10 — Save a workspace as a blueprint** _Actor:_ Admin. _Flow:_ Tune a workspace, "Save as blueprint" → org-private blueprint appears in the New-Workspace picker. _Outcome:_ Repeatable org playbooks.

---

## 8. User Scenarios (narrative)

**Scenario A — Max runs his agency pipeline.** Max creates a workspace from _Software Agency Client Pipeline_. A website inquiry hits `POST /v1/public/leads`; a card lands in _Call Request_ and Max gets an SES email. He opens it, links the company and two contacts, and drags it to _Discovery_. After the call he pastes notes into the "Discovery Notes" page and uploads the recording transcript. Later he asks the project, _"Summarize scope and flag risks,"_ and gets a cited summary. Satisfied, he moves it to _Contract_; the automation creates "Send contract," and when he drags it to _Won_, a `lead.won` webhook triggers his accounting tool to draft an invoice.

**Scenario B — Priya, a solo realtor (B2C).** Priya picks _Real Estate Buyer_. Each buyer is a Project linked to a person. A lead comes in for a 2-bed condo; she checks the workspace KB ("Financing FAQ", "Closing Checklist") and asks the AI to _draft a first-touch email referencing our first-time-buyer guide_. She confirms and sends. Over two weeks the lead moves Inquiry → Viewing → Offer, each move timestamped on the timeline she can screenshot for her broker.

**Scenario C — Dana manages a five-rep team.** Dana is Manager; reps are Members with `ASSIGNED` visibility. She sees the whole board; each rep sees only their leads. She asks the **workspace-level** AI, _"Which deals have sat in Discovery over 14 days?"_ and reassigns two stale ones — the new owners get notified, the old ones lose access, and every change is on the audit trail.

**Scenario D — Leo wires up integrations.** Leo (Admin) mints an API key scoped `leads:write`, embeds it in the marketing site's form handler, and registers a webhook for `lead.created` → n8n → Slack. He tests intake, sees the signed payload verify against the HMAC secret, and turns on a weekly digest for the sales channel.

---

## 9. Non-Functional Requirements

| Category          | Requirement                                                                                   |
| ----------------- | --------------------------------------------------------------------------------------------- |
| **Performance**   | Board loads < 1.5s for ≤500 cards; AI first token < 2s (streamed).                            |
| **Scalability**   | Stateless API horizontally scalable; queues absorb email/AI/ingest spikes.                    |
| **Availability**  | Target 99.9% for API; graceful degradation if the AI provider is down (core CRM unaffected).  |
| **Reliability**   | Async jobs are retried with backoff and dead-letter queues; webhooks retried ≥5×.             |
| **Portability**   | Runs via Docker Compose on any host; no hard AWS lock-in (abstractions for storage/email/AI). |
| **Observability** | Structured logs, request tracing, metrics, error tracking (§13).                              |
| **Accessibility** | WCAG 2.1 AA for core flows; keyboard-navigable Kanban.                                        |
| **i18n**          | Locale-ready; RTL-capable; multi-currency. (English first; architecture supports RU/UZ etc.)  |
| **Cost control**  | Configurable AI model tiers; caching of embeddings; token budgets per org.                    |

---

## 10. Security & Compliance

### 11.1 Tenancy isolation

- **MUST** enforce `orgId` filtering at the **data-access layer** (Prisma middleware / repository guards), not only in controllers. Optionally back with **Postgres Row-Level Security** for defense-in-depth.
- **MUST** scope all RAG retrieval by `orgId` + record scope; embeddings carry `orgId`.

### 11.2 AuthN / AuthZ

- **MUST** short-lived JWT access tokens + rotating refresh tokens (httpOnly cookies for web); optional SSO/OIDC.
- **MUST** policy-based authorization (e.g., **CASL**) evaluated in guards; UI hiding is cosmetic only.
- **MUST** API keys hashed at rest (argon2/bcrypt), scoped, revocable, rate-limited.

### 11.3 Data protection

- **MUST** encrypt in transit (TLS) and at rest (RDS/S3 encryption, KMS).
- **MUST** presigned, expiring URLs for files; no public buckets.
- **SHOULD** field-level handling for PII (B2C contacts are personal data): export & delete-on-request tooling for **GDPR-style** obligations; configurable data-retention.
- **SHOULD** secrets in AWS Secrets Manager / SSM (never in env files in prod).

### 11.4 Auditing & abuse

- **MUST** immutable `ActivityEvent` audit trail for record changes, permission changes, AI actions, and API-key use.
- **SHOULD** webhook HMAC signatures + timestamp to prevent replay; idempotency keys on intake.
- **SHOULD** per-org AI token budgets and prompt-injection guardrails on tool-use (server validates every proposed action against RBAC before executing).

---

## 11. Technical Architecture

### 12.1 Monorepo (Turborepo)

```
helix/
├─ apps/
│  ├─ api/                 # NestJS (REST + webhooks + jobs)
│  └─ web/                 # Vite + React (CRM UI)
├─ packages/
│  ├─ db/                  # Prisma schema + client + migrations
│  ├─ types/               # shared DTOs / zod schemas
│  ├─ api-client/          # typed client generated from OpenAPI
│  ├─ ui/                  # shared React design system (shadcn-based)
│  ├─ ai/                  # prompts, RAG helpers, provider adapters
│  ├─ config/             # env schema (zod), constants
│  ├─ eslint-config/
│  └─ tsconfig/
├─ turbo.json              # pipeline: build, lint, test, typecheck, dev
├─ package.json            # pnpm workspaces
└─ docker-compose.yml
```

- **Package manager:** pnpm workspaces. **Task graph & caching:** Turborepo (`build`, `lint`, `typecheck`, `test`, `dev`) with remote cache in CI.
- **Type sharing:** `packages/types` (zod → inferred TS) shared by API DTOs and the web client; `api-client` generated from the API's OpenAPI so the frontend is fully typed.

### 12.2 Backend — NestJS (`apps/api`)

- **Modules:** `Auth`, `Orgs`, `Users/Rbac`, `Workspaces`, `Phases`, `Projects`, `Contacts`, `Companies`, `Pages`, `Kb`, `Files`, `Ai`, `Notifications`, `Integrations` (ApiKeys + Webhooks), `Blueprints`, `Search`, `Jobs`.
- **Patterns:** DTO validation (class-validator/zod), policy guards (CASL), interceptors for tenant context + audit, global exception filter.
- **Data:** Prisma + **PostgreSQL** with **pgvector**. Redis for cache + **BullMQ** (email, embeddings/ingest, webhook delivery, AI async tasks).
- **Files:** S3 SDK (works against S3 or MinIO) with presigned URL issuance.
- **Realtime:** SSE for AI streaming; optional WebSocket gateway for board live-updates.
- **Docs:** `@nestjs/swagger` → OpenAPI powering `packages/api-client`.

### 12.3 Frontend — Vite + React (`apps/web`)

- **Core:** React + TypeScript, React Router, **TanStack Query** (server state), Zustand (local UI state).
- **UI:** Tailwind + shadcn/ui (from `packages/ui`); **dnd-kit** for Kanban drag-drop; **TipTap** for Pages/KB block editing.
- **AI chat:** streaming via SSE with inline citation chips and action-confirmation UI.
- **Auth:** cookie-based session; org switcher; permission-aware rendering (backed by real server enforcement).

### 12.4 AI / RAG pipeline

```
Ingest (page save | file upload | KB edit)
  → BullMQ job → extract text → chunk → embed (provider) → upsert EmbeddingChunk (pgvector, orgId+scope)

Query (Talk-to-Project)
  → embed question → similarity search (filtered by orgId + project/workspace scope)
  → assemble context → LLM (Anthropic | OpenAI | Bedrock) with tool schema
  → stream tokens (SSE) + citations
  → if tool call: validate against RBAC → execute → log ActivityEvent
```

- **Provider adapter** in `packages/ai` selects backend per org/region (**Bedrock Claude** for AWS).
- **Scoping is a hard filter**, not a prompt instruction.

### 12.5 Async & jobs (BullMQ)

Queues: `email`, `ingest-embeddings`, `webhook-delivery`, `ai-tasks`, `virus-scan`. Each with retries, backoff, DLQ, and a small admin view of job health.

---

## 12. Deployment

### 13.1 Deploy anywhere (portable baseline)

- Everything containerized. **`docker-compose.yml`** brings up: `api`, `web` (static via nginx or the API), **PostgreSQL+pgvector**, **Redis**, **MinIO** (S3-compatible), and an SMTP catcher (MailHog) for local email.
- Any container host works: **Railway**, Render, Fly.io, DigitalOcean App Platform, or self-hosted **Kubernetes** (Helm chart as a follow-up). Env-driven config keeps it cloud-agnostic.

### 13.2 AWS reference architecture (the "big plus")

| Concern               | AWS service                                                                    |
| --------------------- | ------------------------------------------------------------------------------ |
| Frontend hosting      | **S3 + CloudFront** (or Amplify Hosting)                                       |
| API compute           | **ECS Fargate** (or App Runner for simplicity; EKS at scale)                   |
| Database              | **RDS PostgreSQL** (pgvector enabled) or Aurora PostgreSQL                     |
| Cache / queues        | **ElastiCache for Redis**                                                      |
| Object storage        | **S3** (SSE-KMS, presigned URLs)                                               |
| Email                 | **Amazon SES**                                                                 |
| AI / LLM + embeddings | **Amazon Bedrock** (Claude) — VPC-private, region-pinned                       |
| Secrets               | **Secrets Manager / SSM Parameter Store**                                      |
| Networking            | VPC, private subnets for RDS/Redis, ALB in front of Fargate                    |
| Observability         | CloudWatch logs/metrics/alarms; X-Ray tracing                                  |
| IaC                   | **AWS CDK** or **Terraform**                                                   |
| CI/CD                 | **GitHub Actions** → build → **ECR** → deploy Fargate; DB migrations as a task |

```
[CloudFront] → S3 (web static)
       │
   [ALB] → [ECS Fargate: api] ── Bedrock (Claude, embeddings)
                 │  │  │
                 │  │  └── SES (email)
                 │  └───── ElastiCache Redis (cache + BullMQ)
                 └──────── RDS Postgres (+ pgvector)  •  S3 (files, KMS)
```

### 13.3 CI/CD & environments

- Environments: `dev` → `staging` → `prod`. Turborepo caching + affected-package builds keep CI fast.
- Pipeline: typecheck → lint → test → build images → push ECR → run migrations → deploy.

---

## 13. Analytics & Observability

- **Product analytics:** activation (first workspace, first lead, first AI query), conversion by phase, AI adoption, time-in-phase.
- **App observability:** structured logs (pino), request tracing, metrics (queue depth, AI latency/cost, webhook success), error tracking (Sentry), uptime checks.
- **AI cost telemetry:** tokens/embeddings per org for budgeting.

---

## 14. Roadmap / Milestones

| Milestone                           | Scope                                                                                                                                   |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **M0 — Foundation**                 | Turborepo scaffold, auth, orgs/tenancy, Prisma+pgvector, Docker Compose, CI.                                                            |
| **M1 — Core CRM (MVP)**             | Workspaces, phases, Projects (leads-as-projects), Kanban drag-drop, contacts/companies (B2C+B2B), tasks, activity feed, **basic RBAC**. |
| **M2 — Blueprints + Notifications** | Blueprint library + "Start with blueprint" flow, custom fields, SES email on new lead (BullMQ).                                         |
| **M3 — Pages, KB & Files**          | TipTap pages, KB, S3/MinIO attachments, text extraction + embedding ingest.                                                             |
| **M4 — Talk-to-Project AI**         | RAG chat with citations (SSE), provider adapter incl. Bedrock, one-tap helpers.                                                         |
| **M5 — API & Integrations**         | Public REST + OpenAPI, API keys/scopes, lead-intake endpoint, signed webhooks, rate limiting.                                           |
| **M6 — Hardening**                  | Record-level visibility, custom roles, audit trail, RLS, AWS reference deploy (CDK/Terraform), observability.                           |
| **v2 (post-launch)**                | AI tool-use actions, workspace/org-level AI, digests, saved reports, semantic search, k8s Helm chart, mobile-optimized PWA.             |

---

## 15. Open Questions & Assumptions

**Open questions**

1. Do we need **hierarchies of workspaces** (portfolios/teams) in v1, or is a flat list per org enough?
2. Are **AI tool-use actions** (agent moving phases/creating tasks) in MVP or v2? (Assumed v2.)
3. Is **inbound email → lead** (parse an inbox into leads) required, or is form/API intake sufficient for v1?
4. Contract **e-signature**: integrate (DocuSign) or leave to external API/webhook? (Assumed external.)
5. Billing model — is a metered **AI-usage** component needed at launch?

**Assumptions**

- Single primary datastore (Postgres) with pgvector is sufficient for RAG at launch; dedicated vector DB deferred.
- Anthropic/Bedrock Claude is the default AI backend; others behind the adapter.
- Web-only (responsive) for v1; no native mobile.
- Org sizes small-to-mid (dozens of users, thousands of leads/workspace) shape early scaling choices.

---

## Appendix A — Sample API surface (`/v1`)

| Method | Path                          | Auth                  | Purpose                                     |
| ------ | ----------------------------- | --------------------- | ------------------------------------------- |
| POST   | `/v1/workspaces`              | user                  | Create workspace (optionally `blueprintId`) |
| GET    | `/v1/workspaces/:id`          | user                  | Get workspace + phases                      |
| POST   | `/v1/workspaces/:id/phases`   | user                  | Add phase                                   |
| PATCH  | `/v1/phases/:id`              | user                  | Rename/reorder/recolor                      |
| GET    | `/v1/workspaces/:id/projects` | user                  | List leads (RBAC/visibility filtered)       |
| POST   | `/v1/projects`                | user/key              | Create lead                                 |
| POST   | `/v1/public/leads`            | api-key `leads:write` | Public intake → lead + notify               |
| POST   | `/v1/projects/:id/move`       | user                  | Move to phase (fires events)                |
| POST   | `/v1/projects/:id/files`      | user                  | Get presigned upload URL                    |
| POST   | `/v1/projects/:id/ai/chat`    | user                  | Talk-to-project (SSE)                       |
| GET    | `/v1/blueprints?audience=B2B` | user                  | List blueprints w/ previews                 |
| POST   | `/v1/api-keys`                | admin                 | Mint scoped key                             |
| POST   | `/v1/webhooks`                | admin                 | Register webhook + events                   |

**Webhook events:** `lead.created`, `lead.updated`, `lead.phase_changed`, `lead.won`, `lead.lost`, `task.created`, `task.completed`, `file.uploaded`, `contact.created`.

## Appendix B — Default permission matrix

Subjects × actions (✔ = allow · △ = own/assigned only, subject to visibility scope · — = deny):

| Capability                             | Owner | Admin | Manager |  Member   |  Viewer  |
| -------------------------------------- | :---: | :---: | :-----: | :-------: | :------: |
| Org settings / billing                 |   ✔   |   —   |    —    |     —     |    —     |
| Manage members & roles                 |   ✔   |   ✔   |    —    |     —     |    —     |
| Manage blueprints                      |   ✔   |   ✔   |    —    |     —     |    —     |
| Manage API keys / webhooks             |   ✔   |   ✔   |    —    |     —     |    —     |
| Create / configure workspaces & phases |   ✔   |   ✔   |    ✔    |     —     |    —     |
| View leads                             |   ✔   |   ✔   | ✔ (all) | △ (scope) | ✔ (read) |
| Create / edit leads                    |   ✔   |   ✔   |    ✔    |     △     |    —     |
| Move phases                            |   ✔   |   ✔   |    ✔    |     △     |    —     |
| Reassign leads                         |   ✔   |   ✔   |    ✔    |     —     |    —     |
| Upload files / edit pages              |   ✔   |   ✔   |    ✔    |     △     |    —     |
| Use AI (read)                          |   ✔   |   ✔   |    ✔    |     ✔     |    ✔*    |
| AI actions (side-effecting)            |   ✔   |   ✔   |    ✔    |     △     |    —     |
| Export data                            |   ✔   |   ✔   |    ✔    |     —     |    —     |

- Viewer AI access is read-only and can be disabled per org.

## Appendix C — Custom field types

`text · longtext · number · currency · date · datetime · select · multiselect · boolean · url · email · phone · contact-ref · company-ref · user-ref`

---
