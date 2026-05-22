# Álbum Copa 2026 — Controle de Figurinhas com IA

App web completo para controle de figurinhas da Copa do Mundo 2026, com sistema inteligente de trocas baseado em IA.

## Funcionalidades

### Grátis
- 980 figurinhas (48 seleções + especiais FWC e CC)
- Controle por toque (1× = tenho, 2-5× = repetida, volta a 0)
- Progresso por seleção, grupo e total
- Compartilhar faltantes/repetidas via WhatsApp
- PWA — instale no celular
- Exportar/importar código

### Com Cadastro (Grátis)
- Identificação por nome + telefone (WhatsApp)
- Sincronização na nuvem
- **Motor de IA para Trocas Inteligentes:**
  - Encontra automaticamente parceiros de troca
  - Identifica "trocas perfeitas" (ambos têm o que o outro precisa)
  - Ranqueia por compatibilidade
  - Contato direto via WhatsApp

### Premium (R$ 19,90/mês)
- Sync multi-device
- Grupos de troca
- Ranking nacional
- Sem anúncios

---

## Setup — Supabase (Banco de Dados)

1. Crie uma conta gratuita em [supabase.com](https://supabase.com)
2. Crie um novo projeto
3. Vá em **SQL Editor** e execute o conteúdo de `supabase-setup.sql`
4. Copie as credenciais em **Settings > API**:
   - `Project URL` → será o `SUPABASE_URL`
   - `service_role key` → será o `SUPABASE_SERVICE_KEY`

---

## Setup — Netlify (Deploy)

### Variáveis de Ambiente

Configure em **Site settings > Environment variables**:

| Variável | Valor | Descrição |
|----------|-------|-----------|
| `STRIPE_SECRET_KEY` | `sk_live_...` | Chave secreta do Stripe |
| `STRIPE_PRICE_ID` | `price_1TZshFBIgVJukZADFVCvZnvN` | ID do preço da assinatura |
| `SUPABASE_URL` | `https://xxx.supabase.co` | URL do projeto Supabase |
| `SUPABASE_SERVICE_KEY` | `eyJ...` | Service role key do Supabase |

### Deploy

1. Conecte o repositório GitHub no Netlify
2. Configure as variáveis de ambiente acima
3. Deploy automático!

---

## Arquitetura

```
Frontend (HTML/JS)
    ↓
Netlify Functions (Serverless)
    ↓
Supabase (PostgreSQL)
```

### Funções Backend

| Função | Endpoint | Descrição |
|--------|----------|-----------|
| `auth.js` | `POST /.netlify/functions/auth` | Cadastro, verificação e login |
| `sync-stickers.js` | `GET/POST /.netlify/functions/sync-stickers` | Sincronizar figurinhas |
| `find-trades.js` | `GET /.netlify/functions/find-trades` | Motor de IA para trocas |
| `create-checkout.js` | `POST /.netlify/functions/create-checkout` | Checkout Stripe Premium |

### Motor de IA — Como Funciona

1. Usuário marca figurinhas → dados sincronizam com Supabase
2. Ao abrir "Trocas IA", o sistema:
   - Busca todos os outros usuários cadastrados
   - Cruza **repetidas do usuário A** com **faltantes do usuário B** (e vice-versa)
   - Calcula score de compatibilidade: `min(pode_me_dar, posso_dar) × 10 + total`
   - Prioriza **trocas perfeitas** (ambos ganham)
   - Retorna top 50 matches ranqueados
3. Exibe painel com nome, resumo da troca e botão WhatsApp direto

---

## Teste Local

```bash
npm install
npx netlify dev
```

Acesse `http://localhost:8888`

---

## Tecnologias

- HTML5 / CSS3 / JavaScript (vanilla)
- Netlify Functions (Node.js serverless)
- Supabase (PostgreSQL + API)
- Stripe (pagamentos)
- PWA (Progressive Web App)
