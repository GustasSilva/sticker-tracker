# Sticker Tracker – Copa 2026

Tracker de figurinhas com login Google (via Supabase Auth), progresso salvo no
Supabase (Postgres) e deploy na Vercel.

## 1. Banco de dados (Supabase)

1. Abra o seu projeto Supabase → **SQL Editor**.
2. Cole o conteúdo do arquivo `supabase/schema.sql` e execute.
   - Isso cria as tabelas `stickers` (catálogo fixo com as 994 figurinhas) e
     `user_progress` (progresso de cada usuário), além das políticas de RLS
     (cada pessoa só vê/edita a própria coleção).

## 2. Autenticação Google

No Supabase → **Authentication → Providers → Google**, confirme que está
ativado com o Client ID/Secret do Google Cloud Console (já configurado).

Em **Authentication → URL Configuration**:
- **Site URL**: a URL final do app na Vercel (ex: `https://seu-app.vercel.app`)
- **Redirect URLs**: adicione `https://seu-app.vercel.app/auth/callback`
  (e, se quiser testar localmente, `http://localhost:3000/auth/callback`)

No **Google Cloud Console**, na credencial OAuth, adicione também essa URL de
produção em "URIs de redirecionamento autorizados" (além da do Supabase que já
foi configurada).

## 3. Variáveis de ambiente

Copie `.env.local.example` para `.env.local` e preencha com os valores do seu
projeto Supabase (Project Settings → API). Na Vercel, essas variáveis já devem
estar preenchidas automaticamente pela integração com o Supabase — confira em
**Project Settings → Environment Variables**.

## 4. Rodar localmente (opcional)

```bash
npm install
npm run dev
```

## 5. Deploy

```bash
git add .
git commit -m "Sticker tracker - versão inicial"
git push
```

A Vercel faz o deploy automaticamente a cada push.

## 6. Compartilhar com outras pessoas

Qualquer pessoa com uma conta Google pode entrar no app pela tela de login —
cada uma terá sua própria coleção isolada (graças ao RLS). Se o provedor
Google ainda estiver em modo "Teste" no Google Cloud Console, só os e-mails
adicionados em "Usuários de teste" conseguirão logar. Para liberar para
qualquer pessoa, publique o app OAuth no Google Cloud Console (Tela de
consentimento → "Publicar app").
