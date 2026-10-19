# Revisão de segurança do Pinhality

Paulo, fiz uma revisão de segurança ao site inteiro (desde o commit `43ac433`). Aqui fica a lista do que
encontrei, o risco de cada coisa e o que mudei. No código deixei comentários a começar por `Paulo:` nos
sítios mais importantes, para perceberes cada alteração no próprio sítio. — Júlio

Gravidade: **Crítica** (qualquer pessoa na Internet consegue estragar ou tomar conta do site),
**Alta**, **Média**, **Baixa**.

## Problemas corrigidos

| # | Problema | Risco | Correção |
|---|---|---|---|
| 1 | **API de administração sem autenticação**: adicionar/apagar fotos, coleções, categorias e sincronizar não pediam login. | Crítica: qualquer pessoa podia apagar a galeria. | Todas as rotas que alteram dados exigem sessão (`requireAdmin`). Testado: as 18 rotas devolvem 401 sem sessão. |
| 2 | **Injeção de comandos**: `rclone` e `exiftool` eram chamados com `exec` e o nome da pasta/ficheiro vindo do pedido dentro da linha de comandos. | Crítica: com um nome como `x"; rm -rf / #` (ou `$(...)` no caminho do `/api/exif`) corria-se qualquer comando no servidor, sem login. | Só `execFile`/`spawn` (sem shell, argumentos separados), nomes validados por lista branca, nada pode começar por `-` (não passa por opção), `--files-from-raw` para listas de ficheiros. |
| 3 | **Path traversal** no `/api/exif` e na pasta `/photos`. | Alta: com `../` lia-se o EXIF de imagens fora da pasta das fotos e o `/photos` servia qualquer tipo de ficheiro que caísse na pasta (incluindo ficheiros escondidos), não só imagens. | Caminhos resolvidos e confirmados dentro da pasta certa; o `/photos` só serve extensões de imagem e ignora ficheiros escondidos; as rotas de miniaturas/originais só aceitam fotos que existem no `manifest.json`. |
| 4 | **Login com variáveis por definir** (versão antiga): sem `ADMIN_USER`/`ADMIN_PASS` era possível entrar. | Crítica. | Sem as duas variáveis o login fica desligado (503). Comparação em tempo constante (`safeEqual`). |
| 5 | **Palavras-passe fracas em produção** (ex.: o `admin/admin` do ambiente de desenvolvimento). | Alta. | Em produção, palavras-passe com menos de 8 caracteres, óbvias ou iguais ao utilizador são recusadas e aparece um aviso no arranque. |
| 6 | **Força bruta no login**. | Alta. | 10 tentativas falhadas em 15 minutos por IP → 429. |
| 7 | **`trust proxy = true`** (da primeira versão para o Coolify): o Express acreditava no `X-Forwarded-For` de qualquer pessoa. | Média: fingir outro IP e fugir ao limite de tentativas. | Só se confia em proxies de redes privadas (o Traefik do Coolify). Configurável com `TRUST_PROXY`. |
| 8 | **Cookie de sessão** sem `Secure`, logout que não invalidava o token, sessões que sobreviviam a uma troca de palavra-passe. | Média. | Cookie `HttpOnly`, `SameSite=Strict` e `Secure` quando chega por HTTPS (`COOKIE_SECURE=auto`). O logout revoga o token; a chave de assinatura depende de `ADMIN_USER`/`ADMIN_PASS`, por isso mudar a palavra-passe termina todas as sessões. |
| 9 | **CSRF** e **GET com efeitos** (`GET /api/sync` sincronizava). | Média: um link ou imagem noutro site podia disparar ações com a tua sessão. | A sincronização passou a `POST /api/sync`; pedidos que alteram dados vindos de outro site (`Sec-Fetch-Site: cross-site`) são recusados (403). O CORS foi retirado (o site e a API estão no mesmo domínio). |
| 10 | **Sem cabeçalhos de segurança** e **Tailwind carregado de um CDN** (`cdn.tailwindcss.com`). | Média: sem CSP, um XSS ou um CDN comprometido corria código no site; o CDN não deve ser usado em produção. | `helmet` com CSP estrita (só o próprio site), `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`, HSTS em HTTPS, `Permissions-Policy`. O Tailwind passou a ser compilado no build (o site já não carrega nada de fora). Visual verificado: capturas de ecrã antes/depois iguais pixel a pixel. |
| 11 | **Validação de dados**: o `POST /api/photos` guardava qualquer JSON; corpo até 50 MB. | Média: lixo ou URLs maliciosos na base de dados; esgotar memória. | Lista branca de campos e tipos, `imageUrl` tem de ser `photos/<coleção>/<ficheiro>`, nomes de coleções/categorias validados, corpo limitado a 1 MB (413). |
| 12 | **Erros internos devolvidos ao browser** (mensagens do `rclone`, caminhos). | Baixa: ajuda um atacante a conhecer o servidor. | Mensagens genéricas para o público; o detalhe fica só nos logs. |
| 13 | **Coordenadas GPS públicas**: o EXIF com a localização aparecia na API e nos originais. | Média (privacidade): revela onde vives/fotografas. | `SHOW_GPS=false` por omissão: o GPS só aparece ao administrador e é retirado dos originais servidos ao público (`exiftool`). O resto do EXIF mantém-se. |
| 14 | **Originais pedidos ao Drive sem limite**. | Média: muitos pedidos em paralelo esgotavam a rede/CPU (DoS). | Máximo de `MAX_ORIGINAL_STREAMS` (4) em simultâneo; acima disso 503 com `Retry-After`. |
| 15 | **Acesso total ao Google Drive**: o `rclone authorize "drive"` dá permissão de escrita a todo o Drive. | Média: se o token vazasse, podiam apagar o teu Drive. | O site usa e recomenda o âmbito só de leitura (`drive.readonly`); o comando no ecrã e no README já pede só leitura. **Tens de reautorizar** (ver abaixo). |
| 16 | **Segredos guardados**: credenciais e segredo da sessão. | Média. | Ficam em `/data/private` (pasta 700, ficheiros 600), nunca são devolvidos ao browser e não vão para o git. |
| 17 | **Contentor a correr como root**. | Média: uma falha na aplicação dava root no contentor. | Corre como `node`. O `entrypoint` corrige o dono dos volumes ao arrancar (migra os volumes antigos sozinho) e depois larga o root. O compose retira as *capabilities* desnecessárias e ativa `no-new-privileges`. O npm não fica na imagem final; `apk upgrade` no build. |
| 18 | **Dependências com vulnerabilidades conhecidas**: express antigo (path-to-regexp, qs, body-parser, cookie, send), sharp com libvips antigo, nodemon (braces). | Alta (algumas com DoS remoto). | express 4.22, helmet 8, sharp 0.35 (libvips 8.18), `cors` e `nodemon` retirados (`node --watch`). `npm audit` do backend: 0 vulnerabilidades. |
| 19 | **`backend/node_modules` no git** (894 ficheiros). | Baixa: repositório pesado e binários que não correspondem ao `package-lock.json`. | Retirado do git (já estava no `.gitignore`). |

## O que não corrigi (e porquê)

- **Avisos do `npm audit` no frontend** (braces, micromatch, chokidar, postcss-selector-parser): vêm do Tailwind 3 e
  só existem no build, nunca chegam ao site publicado. A correção é o Tailwind 4, que deixou de ter as classes
  `bg-opacity-*` que o site usa e mudaria o aspeto. Fica para quando quisermos migrar.
- **Escritas dos JSON não atómicas**: se o servidor cair a meio de uma gravação, o ficheiro pode ficar estragado.
  Risco baixo com um só administrador; a solução certa é mudar para SQLite.
- **Limite de tentativas e lista de tokens revogados em memória**: perdem-se num restart (um token revogado volta a
  valer até expirar, no máximo 7 dias). Aceitável para um site com um administrador.
- **Contentor de desenvolvimento continua root**: precisa de escrever nos `node_modules` montados; não é usado em produção.
- **Um único utilizador administrador definido por variáveis**: suficiente para o uso atual; sem 2FA.

## O que tens de fazer no Coolify

1. **`ADMIN_PASS`** com pelo menos 8 caracteres e não óbvia (senão o login fica desligado e aparece um aviso nos logs).
2. Variáveis novas (todas opcionais): `SHOW_GPS` (por omissão `false`), `MAX_ORIGINAL_STREAMS` (`4`),
   `SESSION_TTL_HOURS` (`168`), `COOKIE_SECURE` (`auto`), `TRUST_PROXY` (por omissão serve o Traefik).
3. **Redeploy**. Os volumes antigos (criados como root) passam para o utilizador `node` automaticamente no arranque.
4. **Reautorizar o Drive só de leitura**: num computador com o rclone corre
   `rclone authorize "drive" "eyJzY29wZSI6ImRyaXZlLnJlYWRvbmx5In0"` e cola o token em **Gerir → 🔑 Ligação ao Drive**,
   com o âmbito "Só leitura". Depois podes retirar o acesso antigo em <https://myaccount.google.com/permissions>.
