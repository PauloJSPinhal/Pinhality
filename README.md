# Pinhality

Portfólio fotográfico (React + Vite no frontend, Express no backend) num **só contentor**:
o Express serve a API (`/api`), as fotos (`/photos`) e o site compilado, tudo na porta 3000.

```
Dockerfile               # multi-stage: dev | frontend-build | production
docker-compose.yml       # produção (Coolify)
docker-compose.dev.yml   # desenvolvimento no PC local
scripts/dev.sh           # arranca nodemon + Vite no contentor de desenvolvimento
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
- Login por omissão: **admin / admin**. Para mudar, crie `./.env` no repositório (já está no `.gitignore`):
  ```
  ADMIN_USER=...
  ADMIN_PASS=...
  ```
- As fotos chegam pela sincronização: **Gerir → 🔑 Ligação ao Drive** (token + pasta), depois **Sincronizar** com
  "Todas as Coleções" e **Atualizar BD**.
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
| `ADMIN_PASS` | sim | palavra-passe de administração |
| `SESSION_SECRET` | não | segredo das sessões (mín. 16 caracteres). Se vazio, é gerado e guardado em `/data/private` |
| `GDRIVE_TOKEN` | não | alternativa ao ecrã de credenciais: JSON do token do rclone numa só linha |
| `GDRIVE_ROOT_FOLDER_ID` | não | ID da pasta das fotos (com `GDRIVE_TOKEN`) |
| `GDRIVE_CLIENT_ID` / `GDRIVE_CLIENT_SECRET` | não | só se usou um client ID próprio |
| `GDRIVE_REMOTE` | não | caminho remoto com `GDRIVE_TOKEN` (por omissão `gdrive:fotos-site`; com `GDRIVE_ROOT_FOLDER_ID` use `gdrive:`) |

4. **Redeploy** (um restart não aplica variáveis novas). O ficheiro `.env` não é lido pelo Coolify.

Volumes persistentes:
- `pinhality-data` → `/data`: JSON da base de dados e `private/` (credenciais do rclone e segredo da sessão, permissões 600)
- `pinhality-privado` → `/dados_privados`: `fotos_gdrive/<coleção>/...`

## Ligação ao Google Drive (área de administração)

Depois de iniciar sessão: **Gerir → 🔑 Ligação ao Drive**. O ecrã mostra o estado
(configurado / não configurado, origem e resultado do último teste) e permite:

- **Token OAuth (JSON)**: num computador com o [rclone](https://rclone.org/install/), corra
  `rclone authorize "drive"`, inicie sessão com a conta Google (uma conta normal serve) e cole o JSON
  `{"access_token": ...}` que aparece no terminal.
- **ID ou URL da pasta**: abra a pasta das fotos no Google Drive e copie o URL
  (`https://drive.google.com/drive/folders/1AbC...xyz`) ou só a parte final (`1AbC...xyz`).
  Dentro dessa pasta deve haver uma subpasta por coleção.
- **Caminho** (opcional), **client ID/secret**, **âmbito** e **Drive partilhada** (opções avançadas).
- **Testar ligação**: corre `rclone lsd` e mostra as pastas encontradas.

Os segredos ficam só no servidor e nunca são devolvidos ao browser. Campos secretos vazios
mantêm o valor guardado. Se tentar **Sincronizar** sem credenciais (ou com um token recusado),
o ecrã abre automaticamente para as introduzir.

**Sincronizar** com uma coleção selecionada copia só essa pasta; com "Todas as Coleções" a pasta
local passa a ser igual à pasta do Drive. Depois, a base de dados é atualizada (**Atualizar BD**).

Prioridade da configuração: ecrã de administração → variáveis `GDRIVE_*` → `rclone.conf` antigo em `/dados_privados` (só produção antiga).

## Segurança

- O login devolve um token assinado (HMAC) e guarda-o num cookie `httpOnly` (`SameSite=Strict`), válido 7 dias.
- Todas as operações de escrita (fotos, coleções, categorias, definições, sincronizações, credenciais) exigem sessão.
- `rclone` e `exiftool` correm com `execFile` (sem shell) e com caminhos validados dentro da pasta das fotos.
