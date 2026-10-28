@AGENTS.md

## Projeto

Estúdio interno de certificados (Next.js 16, TypeScript, Tailwind v4). Veja README.md para arquitetura.

- Medidas internas em pontos PDF (pt); a interface exibe mm (`src/lib/utils/units.ts`).
- Todo texto é diagramado por `src/lib/render/layout.ts` (fontkit) — use-o tanto no canvas quanto no PDF para manter a fidelidade.
- Persistência via `ProjectRepository` (`src/lib/persistence`); estado do workspace em `src/features/workspace/store.ts` (zustand + zundo + immer). Não use `structuredClone` em rascunhos do immer: use `current()`.
- Verificações: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build && npm run test:e2e`.
