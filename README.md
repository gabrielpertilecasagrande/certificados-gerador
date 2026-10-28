# Estúdio de Certificados

Ferramenta interna para transformar uma arte de certificado pronta (PDF, PNG, JPG, WEBP ou SVG) em centenas ou milhares de certificados personalizados a partir de uma planilha.

Fluxo: **criar projeto → importar a arte → posicionar campos (`{{nome}}`, `{{evento}}`…) → importar planilha → conferir → exportar** (ZIP de PDFs, PDF único, PNG/JPG).

## Principais recursos

- **Arte como fundo fixo**: PDFs são incorporados como página vetorial no arquivo final (sem rasterizar); imagens mantêm a resolução original. Fundo bloqueado por padrão, com enquadramento (página/conter/cobrir), troca e remoção.
- **Editor visual** (Konva): campos variáveis, textos compostos, logotipos, assinaturas, linhas/retângulos/círculos; arrastar, redimensionar, rotacionar, alinhar/distribuir, agrupar, camadas, bloquear/ocultar, copiar/colar, encaixe magnético, guias e margens, coordenadas em mm e atalhos de teclado.
- **Tipografia**: 15 famílias livres (OFL/Apache) com acentuação completa, peso, itálico, tamanho, cor, opacidade, espaçamento, altura de linha, maiúsculas/minúsculas, alinhamento horizontal e vertical, margem interna.
- **Ajuste automático de nomes longos**: reduzir somente se necessário, quebrar em até N linhas, proporcional (maior tamanho entre mín. e máx.) ou fixo. Nomes curtos mantêm o tamanho configurado; quando nem o mínimo cabe, o certificado é **sinalizado** — o texto nunca é cortado.
- **Variáveis**: colunas da planilha, dados fixos (iguais para todos), derivadas (`primeiro_nome`, `sobrenome`) e filtros (`{{nome|upper}}`, `|lower`, `|title`, `|first`, `|last`).
- **Participantes**: importação XLSX/CSV/colar com prévia, mapeamento de colunas e validação (vazios, duplicados); tabela virtualizada com edição na célula, navegação por teclado, copiar/colar do Excel, busca, filtro, ordenação e seleção múltipla; edição em massa (definir valor, localizar e substituir, preencher vazios, padronizar texto) com prévia do número de registros afetados.
- **Edição individual**: “Editar somente este certificado” grava exceções separadas do modelo (posição, tamanho, ajuste, texto), com “Restaurar configuração global”.
- **Pré-visualização**: certificado a certificado (“Certificado 42 de 650”), galeria virtualizada e diagnóstico (nomes que não couberam, campos vazios, variáveis sem correspondência, elementos fora da página, modelo sem fundo, duplicidades) com acesso direto ao certificado.
- **Exportação em massa** num Web Worker: ZIP de PDFs individuais, PDF consolidado, PNG/JPG (150/300 DPI); todos/selecionados/filtrados/sem erros; nomes dinâmicos (`Certificado_{{nome}}`) com sanitização e sem sobrescrita; ZIP em uma pasta ou por coluna (ex.: categoria); progresso, cancelamento e “repetir falhas”. Em navegadores com File System Access API o ZIP pode ser gravado direto no disco.
- **Persistência**: salvamento automático no navegador (IndexedDB), desfazer/refazer, recuperação após recarregar/fechar, backup e restauração do projeto em arquivo `.certproj`.

## Arquitetura

```
src/
  app/                    rotas (login, projetos, workspace) e API de autenticação
  proxy.ts                protege todas as páginas e APIs (exceto /login e arquivos estáticos públicos)
  lib/
    model/                modelo de documento (Project, Template, Element, Participant, overrides…)
    variables/            motor de variáveis, filtros e nomes de arquivo
    render/               layout de texto (fontkit), resolução modelo+participante, desenho em canvas, pdf.js
    export/               compositor PDF (pdf-lib), worker, ZIP em streaming, orquestração
    import/               artes (PDF/imagens) e planilhas (XLSX/CSV/colar), validação
    participants/         operações de edição em massa
    persistence/          ProjectRepository (interface) + IndexedDB, backup .certproj
    auth/                 sessão JWT, senha, limite de tentativas
  features/               interface: projetos, editor, participantes, pré-visualização, exportação
```

**Fidelidade tela × arquivo**: um único motor de layout (`src/lib/render/layout.ts`) mede o texto com as métricas reais das fontes TTF — exatamente como o pdf-lib calcula larguras — e decide quebra de linha, tamanho final e posição de cada linha. O canvas do editor/pré-visualização e o PDF desenham esse mesmo resultado. Um teste E2E compara o PDF exportado (renderizado pelo poppler) com a pré-visualização: diferença ≤ 1 px.

**Dados**: nesta fase os projetos ficam no **IndexedDB do navegador** (por dispositivo/navegador). Use “Baixar backup (.certproj)” para guardar uma cópia ou levar o projeto a outro computador. A camada `ProjectRepository` permite trocar por Supabase (PostgreSQL + Storage privado) sem alterar a interface.

## Desenvolvimento

Requisitos: Node.js 20.9+.

```bash
npm install            # também copia o worker do pdf.js para public/pdfjs
cp .env.example .env.local
# defina ADMIN_PASSWORD e AUTH_SECRET (openssl rand -base64 48)
npm run dev
```

Scripts:

| Comando | O que faz |
|---|---|
| `npm run dev` | servidor de desenvolvimento |
| `npm run build` / `npm start` | build e servidor de produção |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript (`tsc --noEmit`) |
| `npm test` | testes unitários (Vitest): variáveis, layout/auto-ajuste, importação, edição em massa, PDF (1, 10, 100 e 1.000 páginas) |
| `npm run test:e2e` | testes de ponta a ponta (Playwright, requer `npm run build` antes) |
| `npm run fonts` | baixa novamente as fontes TTF para `public/fonts` |

Os testes E2E sobem `next start` com uma senha própria e cobrem: acesso sem autenticação, senha incorreta e limite de tentativas, cookie HttpOnly, token adulterado, fluxo completo (PDF → campo nome → CSV de 100 linhas → edição de célula → edição em massa → ajuste individual → ZIP → PDF único → recarregar e conferir persistência), PDF vertical, PNG/JPG como fundo, XLSX, ZIP por categoria com acentos, sinalização de nomes que não cabem, editor (arrastar, desfazer, atalhos, bloqueio), fidelidade tela × PDF (requer `pdftoppm`) e 1.000 participantes (≈ 17 s para gerar 1.000 PDFs).

## Implantação na Vercel

1. Importe o repositório na Vercel (framework detectado: Next.js). Nenhuma configuração de build adicional é necessária.
2. Em **Settings → Environment Variables**, defina para *Production* (e *Preview*, se usar):
   - `ADMIN_PASSWORD` — senha única de acesso (validada só no servidor, nunca enviada ao navegador).
   - `AUTH_SECRET` — segredo com **32+ caracteres** para assinar a sessão (`openssl rand -base64 48`). Trocar este valor encerra todas as sessões.
3. Faça o deploy. Ao acessar a URL, qualquer página ou API sem sessão válida redireciona para `/login` (APIs respondem 401).

Detalhes de segurança:

- Sessão em cookie `HttpOnly`, `SameSite=Lax`, `Secure` em produção, expira em 12 horas; logout apaga o cookie.
- A senha é comparada em tempo constante; o login aceita até 5 tentativas erradas por IP a cada 15 minutos. O contador fica na memória de cada instância serverless — suficiente para uma ferramenta interna; para um limite global use um armazenamento compartilhado (ex.: Upstash Redis).
- Artes, planilhas e projetos não são enviados ao servidor: ficam no armazenamento do navegador de quem usa a ferramenta, isolado por origem. A geração de PDFs também ocorre no navegador, então não há funções serverless de longa duração.
- Fontes (OFL) e o worker do pdf.js são servidos como arquivos públicos estáticos.

## Limitações conhecidas e próximos passos

- Projetos são locais ao navegador (use o backup `.certproj`); sincronização via Supabase é o próximo passo natural.
- O modelo de dados já suporta vários modelos por projeto (participante → `templateId`, filtros e exportação por modelo); a interface para criar/gerenciar modelos adicionais e regras de associação por categoria vem na próxima fase.
- Ainda não implementados: réguas e guias arrastáveis, importação de fontes personalizadas, histórico de versões do modelo.
- Planilhas `.xls` (formato antigo) não são lidas: salve como `.xlsx` ou `.csv`.
