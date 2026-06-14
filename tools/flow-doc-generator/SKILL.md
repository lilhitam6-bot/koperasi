# Flow Doc Generator

Use this when an agent must evaluate an app's data flows, user flows, documentation gaps, and produce a PDF report with Mermaid diagrams.

## Inputs

- A working repo.
- A clear audit scope, such as auth, role isolation, data lifecycle, storage, deploy, or QA readiness.
- Existing docs, schema/migrations, and app code.

## Workflow

1. Inspect evidence with fast local search.
   - Use `rg --files` to find docs, migrations, app routes, components, and tests.
   - Read only files needed for the requested flows.
2. Build a flow inventory.
   - List actors.
   - List data stores.
   - List role boundaries.
   - Mark each flow as complete, partial, or missing.
3. Write the audit Markdown.
   - Put the report under `docs/flow-audit/`.
   - Include one Mermaid diagram per important flow.
   - Include a formal completeness table.
   - Include a prioritized documentation backlog.
4. Render PDF.
   - Create or update a config JSON like `docs/flow-audit/flow-doc-config.json`.
   - Run `npm run docs:flows`.
   - If using another config, run `node scripts/generate-flow-docs.mjs path/to/config.json`.
5. Verify output.
   - Confirm the HTML and PDF files exist.
   - Confirm the PDF size is nonzero.
   - Open the HTML/PDF if visual inspection is needed.

## Report Shape

Recommended sections:

- Ringkasan eksekutif
- Sistem dan aktor
- Data flow diagrams
- User flow diagrams
- Role and RLS/access matrix
- Documentation completeness audit
- QA/release gates
- Prioritized backlog

## Mermaid Patterns

Use `flowchart TD` for data flow, `sequenceDiagram` for actor/system interactions, `stateDiagram-v2` for lifecycle state, and `journey` for user journey.

## Quality Bar

- Every diagram must correspond to code, schema, or a documented requirement.
- Call out implementation/documentation mismatch explicitly.
- Do not invent backend behavior. Mark uncertain behavior as a gap.
- Keep the report useful for PM, FE, BE, and QA/DevOps readers.
