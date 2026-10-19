# Pinhality

Portfólio fotográfico (React + Vite no frontend, Express no backend) num **só contentor**:
o Express serve a API (`/api`), as fotos (`/photos`) e o site compilado, tudo na porta 3000.

```
Dockerfile               # multi-stage: dev | frontend-build | production
docker-compose.yml       # produção (Coolify)
docker-compose.dev.yml   # desenvolvimento no PC local
scripts/dev.sh           # arranca node --watch + Vite no contentor de desenvolvimento
scripts/entrypoint.sh    # produção: corrige o dono dos volumes e arranca como utilizador node
SEGURANCA.md             # revisão de segurança (problemas encontrados e correções)
backend/server.js        # API
frontend/                # React + Vite
```

## Desenvolvimento (PC local)

Funciona como a produção: não usa pastas fora do repositório. Só o código é montado (hot reload);
dados e fotos ficam em volumes nomeados que começam vazios.

```bash
docker compose -f docker-compose.dev.yml up --build
```

- Site com hot reload: http://localhost:5173 (o Vite encaminha `/api` e `/photos` para a API)
- API: http://localhost:3000
- Login por omissão: **admin / admin** (só em desenvolvimento; em produção palavras-passe fracas são recusadas). Para mudar, crie `./.env` no repositório (já está no `.gitignore`):
  ```
  ADMIN_USER=...
  ADMIN_PASS=...
  ```
- As fotos chegam pela sincronização: **Gerir → 🔑 Ligação ao Drive** (token + pasta), depois **Sincronizar** com
  "Todas as Coleções" e **Atualizar BD**.
- Depois de mudar dependências (ex.: o `sharp`), recrie os `node_modules` do contentor:
  `docker compose -f docker-compose.dev.yml up --build -V`
- O volume de dados começa vazio: galeria vazia, sem coleções, com as categorias por omissão.
  (Em produção, um volume novo recebe os JSON do repositório como dados iniciais.)
- Começar do zero (apaga dados, fotos e credenciais): `docker compose -f docker-compose.dev.yml down -v`

## Produção (Coolify)

1. Novo recurso → **Docker Compose** → este repositório, ficheiro `docker-compose.yml`.
2. Domínio: serviço `app`, porta **3000** (o compose já define `SERVICE_FQDN_APP_3000`).
3. Em **Environment Variables**:

| Variável | Obrigatória | Descrição |
|---|---|---|
| `ADMIN_USER` | sim | utilizador de administração |
| `ADMIN_PASS` | sim | palavra-passe de administração (mínimo 8 caracteres; `admin`, `password`, igual ao utilizador, etc. são recusadas em produção) |
| `SESSION_SECRET` | não | segredo das sessões (mín. 16 caracteres). Se vazio, é gerado e guardado em `/data/private` |
| `GDRIVE_TOKEN` | não | alternativa ao ecrã de credenciais: JSON do token do rclone numa só linha |
| `GDRIVE_ROOT_FOLDER_ID` | não | ID da pasta das fotos (com `GDRIVE_TOKEN`) |
| `GDRIVE_CLIENT_ID` / `GDRIVE_CLIENT_SECRET` | não | só se usou um client ID próprio |
| `GDRIVE_REMOTE` | não | caminho remoto com `GDRIVE_TOKEN` (por omissão `gdrive:fotos-site`; com `GDRIVE_ROOT_FOLDER_ID` use `gdrive:`) |
| `ORIGINAL_CACHE_MB` | não | cache em disco dos originais pedidos ao Drive, em MB (por omissão `0` = sem cache) |
| `ORIGINALS_PUBLIC` | não | `true` (por omissão): qualquer visitante pode abrir o original; `false`: só o administrador |
| `SYNC_CONCURRENCY` | não | imagens processadas em paralelo na sincronização (por omissão `3`) |
| `SHOW_GPS` | não | `false` (por omissão): as coordenadas GPS só aparecem ao administrador e são retiradas dos originais servidos ao público; `true`: públicas |
| `MAX_ORIGINAL_STREAMS` | não | originais servidos em simultâneo (por omissão `4`); acima disso responde 503 |
| `SESSION_TTL_HOURS` | não | duração da sessão de administração em horas (por omissão `168` = 7 dias) |
| `COOKIE_SECURE` | não | `auto` (por omissão: `Secure` quando o pedido chega por HTTPS através do proxy), `true` ou `false` |
| `TRUST_PROXY` | não | proxies em que o Express confia para `X-Forwarded-*` (por omissão `loopback, linklocal, uniquelocal`, que serve o Traefik do Coolify) |

4. **Redeploy** (um restart não aplica variáveis novas). O ficheiro `.env` não é lido pelo Coolify.

O contentor corre como utilizador `node` (não root). Ao arrancar, o `entrypoint` corrige o dono dos volumes
(volumes antigos criados como root são migrados automaticamente). O compose retira todas as *capabilities* exceto as
necessárias para isso (`CHOWN`, `DAC_OVERRIDE`, `FOWNER`, `SETUID`, `SETGID`) e ativa `no-new-privileges`.

Volumes persistentes:
- `pinhality-data` → `/data`: JSON da base de dados e `private/` (credenciais do rclone e segredo da sessão, permissões 600)
- `pinhality-privado` → `/dados_privados`: `derivados/<coleção>/thumb|web/*.webp` + `manifest.json` (e `fotos_gdrive/` no formato antigo)

## Ligação ao Google Drive (área de administração)

Depois de iniciar sessão: **Gerir → 🔑 Ligação ao Drive**. O ecrã mostra o estado
(configurado / não configurado, origem e resultado do último teste) e permite:

- **Token OAuth (JSON)**: num computador com o [rclone](https://rclone.org/install/), corra
  `rclone authorize "drive" "eyJzY29wZSI6ImRyaXZlLnJlYWRvbmx5In0"` (pede acesso **só de leitura**, `drive.readonly`),
  inicie sessão com a conta Google (uma conta normal serve) e cole o JSON
  `{"access_token": ...}` que aparece no terminal.
- **ID ou URL da pasta**: abra a pasta das fotos no Google Drive e copie o URL
  (`https://drive.google.com/drive/folders/1AbC...xyz`) ou só a parte final (`1AbC...xyz`).
  Dentro dessa pasta deve haver uma subpasta por coleção.
- **Caminho** (opcional), **client ID/secret**, **âmbito** e **Drive partilhada** (opções avançadas).
- **Testar ligação**: corre `rclone lsd` e mostra as pastas encontradas.

Os segredos ficam só no servidor e nunca são devolvidos ao browser. Campos secretos vazios
mantêm o valor guardado. Se tentar **Sincronizar** sem credenciais (ou com um token recusado),
o ecrã abre automaticamente para as introduzir.

**Sincronizar** com uma coleção selecionada trata só essa pasta; com "Todas as Coleções" trata todas.
A sincronização corre em segundo plano e o progresso aparece no canto do ecrã. No fim, a base de dados
é atualizada automaticamente.

## Miniaturas, versões web e originais

Para poupar espaço, o servidor **não guarda os originais**. Em cada sincronização, para cada imagem do Drive
(`.jpg`, `.png`, `.webp`, `.tif`) nova ou alterada:

1. descarrega-a para uma pasta temporária;
2. lê o EXIF (data, hora, câmara, objetiva, ISO, abertura, ...) e preenche os campos vazios da foto no `photos.json`
   (o que foi editado à mão não é alterado);
3. gera uma miniatura WebP de ~400 px (grelha) e uma versão WebP de ~1600 px (detalhe e ecrã inteiro);
4. apaga o original temporário.

Fotos sem alterações no Drive (mesmo hash/tamanho/data) são saltadas; fotos apagadas do Drive perdem as
miniaturas e saem do site. Se o Drive não devolver nenhuma pasta, nada é apagado.

O **original** em resolução completa abre-se no detalhe da foto (**Ver original** / **Descarregar**) e vem do Drive
a pedido (`/photos/original/<coleção>/<ficheiro>`). Com `ORIGINAL_CACHE_MB` os originais pedidos ficam em cache
(os mais antigos saem quando se passa o limite).

Formato antigo: originais que ainda estejam em `fotos_gdrive/<coleção>/` continuam a aparecer. Na sincronização
seguinte, os que existem no Drive são convertidos e o original local é apagado.

URLs: `photos/thumb/<coleção>/<ficheiro>.webp`, `photos/web/<coleção>/<ficheiro>.webp`, `photos/original/<coleção>/<ficheiro>`.
O `imageUrl` das fotos continua a ser `photos/<coleção>/<ficheiro>` (e devolve a versão web).

Prioridade da configuração: ecrã de administração → variáveis `GDRIVE_*` → `rclone.conf` antigo em `/dados_privados` (só produção antiga).

## Segurança

Resumo (os detalhes e o porquê de cada alteração estão em [SEGURANCA.md](SEGURANCA.md)):

- O login devolve um token assinado (HMAC) num cookie `httpOnly`, `SameSite=Strict` e `Secure` (em HTTPS).
  O logout invalida o token; mudar `ADMIN_USER`/`ADMIN_PASS` invalida todas as sessões. 10 tentativas falhadas
  em 15 minutos bloqueiam o IP.
- Todas as operações de escrita (fotos, coleções, categorias, definições, sincronizações, credenciais) exigem sessão,
  são `POST`/`PUT`/`DELETE` (a sincronização é `POST /api/sync`) e pedidos vindos de outros sites são recusados.
- Cabeçalhos de segurança (CSP estrita, HSTS, `nosniff`, `frame-ancestors 'none'`, `Referrer-Policy`).
  O Tailwind é compilado com o site (sem CDN): o site não carrega nada de servidores externos.
- `rclone` e `exiftool` correm sem shell e com nomes/caminhos validados.
