> **Aviso:** este documento é o texto técnico longo da primeira versão e está
> **parcialmente desatualizado** (por exemplo: o cálculo de escore hoje usa
> escore-z + metade de acertos em vez de min-max; o Jogo 1 tem 30 rodadas e só
> palavras incongruentes; o Jogo 3 sorteia a regra a cada pergunta, com meta de
> 30 acertos). A referência atual de uso e configuração é o `README.md` da raiz.

# Trilha Mágica — Documentação Técnica

Ferramenta lúdica de avaliação de funções executivas (controle
inibitório, memória de trabalho e flexibilidade cognitiva) em crianças
de 7 a 9 anos, desenvolvida como instrumento de coleta de dados para
TCC. Este documento descreve a arquitetura completa da aplicação — a
construção lógica e sintática de cada camada — para servir de
referência técnica e apoio à escrita da metodologia.

> Este documento foi revisado para refletir exatamente o estado atual
> do código-fonte (backend Java + frontend estático), incluindo o
> sistema multi-tenant por professor, a autenticação de administrador/
> desenvolvedor, o suporte a PostgreSQL/SQLite e os ajustes mais
> recentes nas regras de pontuação e na interface descritos na seção
> "Alterações mais recentes" abaixo.

---

## Alterações mais recentes

- **Jogos 1 e 3 — penalidade fixa de tempo em respostas erradas**: no
  cálculo do tempo de reação/resposta médio, uma resposta errada (ou
  que estourou o tempo da rodada) passou a contar como **3500 ms**
  fixos no cálculo da média (`WRONG_RT_PENALTY_MS`), em vez do tempo
  limite inteiro da rodada (20000 ms). Um acerto continua usando o
  tempo real de reação. Ver seções 10 e 12.
- **Jogo 2 — taxa de acerto 0% zera a nota final**: quando a taxa de
  acerto (`taxa_acerto`) de uma sessão é exatamente 0% (a criança não
  completou nenhuma sequência corretamente), o `ScoringService` zera a
  nota de memória de trabalho (`Smem`) daquela sessão, independente do
  resultado das demais métricas normalizadas do jogo. Ver seção 5.
- **Jogo 1 — acertos passam a entrar na nota final**: a nota de
  controle inibitório (`Sinib`) agora também considera o número de
  acertos (`AC`, além de `EI`/`OM`/`TR1`). O valor usado é o mesmo
  armazenado em dobro pelo frontend (`acertos: correct.length * 2`),
  o que não distorce o resultado (normalização min-max é invariante a
  um fator de escala uniforme); as telas do usuário e do admin
  continuam mostrando a contagem real, dividida por 2 (ex.: `20/20`,
  nunca `40/20`). Ver seções 5 e 10.
- **Jogo 3 — sequência de exemplo acima das opções**: a tela do Jogo 3
  agora mostra, acima da grade de opções, uma **sequência lógica** com
  duas cartas ligadas por uma seta (ex.: `■■■ › ▲▲▲▲`): a carta de
  referência (a mesma usada para julgar a resposta) e uma carta
  "exemplo" gerada especificamente para ilustrar a regra vigente —
  compartilhando com a referência **apenas** a dimensão da regra atual
  (cor, forma ou quantidade) e diferindo nas outras duas. A mecânica de
  resposta (4 opções abaixo, regra secreta que muda periodicamente) não
  mudou. Ver seção 12.
- **Remoção de emojis em toda a interface**: todos os emojis
  decorativos (ícones de tela de intro, botões do painel do
  administrador/desenvolvedor, indicadores de tempo, feedback de
  acerto/erro etc.) foram removidos do frontend. Onde um emoji fazia
  parte de um ícone funcional (ex.: botão de fechar modal), ele foi
  substituído por um caractere tipográfico neutro (`×`); símbolos que
  são conteúdo do próprio jogo — as formas do Jogo 3 (`■ ● ▲ ★`) e a
  seta da nova sequência de exemplo (`›`) — foram mantidos, pois não
  são emojis decorativos e sim elementos da mecânica visual. Ver seção
  15.

---

## Sumário

1. [Visão geral da arquitetura](#1-visão-geral-da-arquitetura)
2. [Pré-requisitos e execução](#2-pré-requisitos-e-execução)
3. [Estrutura de pastas](#3-estrutura-de-pastas)
4. [Backend — camada de banco de dados](#4-backend--camada-de-banco-de-dados)
5. [Backend — camada de domínio (scoring)](#5-backend--camada-de-domínio-scoring)
6. [Backend — camada HTTP e autenticação](#6-backend--camada-http-e-autenticação)
7. [Backend — utilitário JSON](#7-backend--utilitário-json)
8. [Contrato da API REST](#8-contrato-da-api-rest)
9. [Frontend — fluxo geral, multi-tenant e estado de sessão](#9-frontend--fluxo-geral-multi-tenant-e-estado-de-sessão)
10. [Frontend — Jogo 1 (Cores Mágicas / Stroop)](#10-frontend--jogo-1-cores-mágicas--stroop)
11. [Frontend — Jogo 2 (Caminho do Tesouro / Corsi)](#11-frontend--jogo-2-caminho-do-tesouro--corsi)
12. [Frontend — Jogo 3 (Regra da Magia / WCST)](#12-frontend--jogo-3-regra-da-magia--wcst)
13. [Frontend — efeitos sonoros](#13-frontend--efeitos-sonoros)
14. [Frontend — painel do administrador](#14-frontend--painel-do-administrador)
15. [Frontend — painel do desenvolvedor e estilo visual](#15-frontend--painel-do-desenvolvedor-e-estilo-visual)
16. [Convenções de código adotadas](#16-convenções-de-código-adotadas)

---

## 1. Visão geral da arquitetura

A aplicação segue uma arquitetura **cliente-servidor de 3 camadas**,
com separação explícita de responsabilidades:

```
┌───────────────────────────────┐
│   FRONTEND (navegador)        │  HTML + CSS + JavaScript puro (sem
│   public/                     │  frameworks) — telas dos jogos,
│                                │  painel do administrador e do
│                                │  desenvolvedor
└──────────────┬─────────────────┘
               │ HTTP (fetch / JSON)
┌──────────────▼─────────────────┐
│   BACKEND (com.trilhamagica)   │  Java puro (JDK), servidor HTTP
│   src/                         │  nativo, sem frameworks externos
│                                 │
│   ┌───────────────────────┐    │
│   │ ApiHandler              │    │  camada HTTP / roteamento + auth
│   ├───────────────────────┤    │
│   │ AdminAuthService         │    │  hash de senha, tokens, sessões
│   ├───────────────────────┤    │
│   │ ScoringService            │    │  camada de domínio (regras de negócio)
│   ├───────────────────────┤    │
│   │ SessionRepository          │    │  DAO das sessões/resultados dos jogos
│   │ AdminUserRepository        │    │  DAO dos administradores (professores)
│   │ DevUserRepository          │    │  DAO dos desenvolvedores
│   ├───────────────────────┤    │
│   │ Database                    │    │  conexão JDBC (SQLite ou Postgres)
│   └───────────────────────┘    │
└──────────────┬─────────────────┘
               │ JDBC
┌──────────────▼─────────────────┐
│  BANCO DE DADOS RELACIONAL      │  SQLite (arquivo local) ou
│  data/trilha_magica.db          │  PostgreSQL (Heroku, via
│  ou Postgres (DATABASE_URL)     │  DATABASE_URL), 6 tabelas
└─────────────────────────────────┘
```

**Decisões arquiteturais e por quê:**

| Decisão | Justificativa |
|---|---|
| Java sem Spring | Evita dependência de internet/repositório para compilar localmente; roda com `javac` puro + drivers JDBC. O `pom.xml` existe apenas para o buildpack Java do Heroku conseguir empacotar a aplicação. |
| `com.sun.net.httpserver.HttpServer` | Servidor HTTP nativo do JDK — zero dependência de framework web |
| SQLite (local) / PostgreSQL (Heroku) | `Database.java` escolhe automaticamente: se a variável de ambiente `DATABASE_URL` existir, conecta via PostgreSQL (produção); caso contrário, usa um arquivo SQLite local. O mesmo SQL (DDL + upserts `ON CONFLICT`) funciona nos dois bancos. |
| JSON escrito à mão (`Json.java`) | Evita depender de Gson/Jackson (que exigiriam Maven Central) |
| Frontend sem framework (JS puro) | Nenhuma etapa de build (webpack/babel) — os arquivos em `public/` são servidos como estão |
| Cálculo de escore no backend | Centraliza a regra de negócio (normalização min-max, classificação, regras especiais) num único lugar, testável e reutilizável |
| Autenticação própria (hash+salt SHA-256, sem JWT/OAuth) | Evita dependências externas; sessões de login ficam em memória (`ConcurrentHashMap`), com expiração deslizante de 30 minutos |

---

## 2. Pré-requisitos e execução

- **JDK 17+** (definido em `pom.xml`/`maven-compiler-plugin`). Não é
  necessário Maven, Node.js ou qualquer banco de dados externo para
  rodar localmente.
- Compilar: `./build.sh` (Linux/Mac) ou `build.bat` (Windows) — chama
  `javac` diretamente, usando `lib/sqlite-jdbc.jar` como classpath.
- Rodar: `./run.sh` / `run.bat` — executa
  `java -cp "build:lib/sqlite-jdbc.jar" com.trilhamagica.Main`
  (compila primeiro, se `build/` ainda não existir).
- Acessar:
  - `http://localhost:3000/{usuario}.html` — login da turma de um
    professor específico (ver seção 9 sobre rotas por professor);
  - `http://localhost:3000/admin/trilhas/index.html` — painel do
    administrador (login: usuário e senha definidos por variáveis de ambiente — ver README.md,
    seção Configuration);
  - `http://localhost:3000/dev/trilhas/index.html` — painel do
    desenvolvedor (login: usuário e senha definidos por variáveis de ambiente — ver README.md).
- A porta pode ser trocada com a variável de ambiente `PORT`.
- **Em produção (Heroku)**: `Procfile` roda
  `java -jar target/trilha-magica.jar`, gerado pelo Maven Shade Plugin
  (`pom.xml`) a partir de `mvn package`. Se `DATABASE_URL` estiver
  definida (Heroku Postgres), o backend usa Postgres automaticamente
  em vez do arquivo SQLite.

---

## 3. Estrutura de pastas

```
trilha_magica/
├── build.sh / build.bat        # compila (javac) sem precisar de Maven
├── run.sh / run.bat            # executa o servidor
├── Procfile                    # comando de start no Heroku
├── pom.xml                     # empacotamento Maven (só usado no Heroku)
├── system.properties           # versão do JDK pedida ao buildpack do Heroku
├── lib/
│   ├── sqlite-jdbc.jar          # driver JDBC do SQLite (uso local)
│   └── postgresql-42.7.13.jar   # driver JDBC do PostgreSQL (uso no Heroku)
├── src/com/trilhamagica/
│   ├── Main.java                  # ponto de entrada / bootstrap do servidor
│   ├── Database.java               # conexão JDBC (SQLite ou Postgres) + DDL
│   ├── SessionRepository.java      # DAO — sessões e resultados dos 3 jogos
│   ├── AdminUserRepository.java    # DAO — administradores (professores)
│   ├── DevUserRepository.java      # DAO — desenvolvedores
│   ├── AdminAuthService.java       # hash de senha, tokens, sessões, CPF/e-mail/telefone
│   ├── ScoringService.java         # regra de negócio — normalização, classificação, ranking
│   ├── ApiHandler.java             # controller HTTP — roteamento de /api/*
│   ├── StaticFileHandler.java      # serve public/ + rotas por professor + URLs escondidas
│   └── Json.java                   # parser/serializador JSON (sem dependências)
├── data/
│   └── trilha_magica.db           # arquivo SQLite (criado na 1ª execução local)
└── public/                        # frontend, servido estaticamente
    ├── index.html + js/index.js          # login (por turma/professor)
    ├── game1.html + js/game1.js          # Jogo 1 — Stroop
    ├── game2.html + js/game2.js          # Jogo 2 — Corsi
    ├── game3.html + js/game3.js          # Jogo 3 — WCST
    ├── finished.html + js/finished.js    # tela de conclusão
    ├── js/api.js                          # cliente HTTP + estado de sessão + FlowGuard
    ├── js/sounds.js                       # efeitos sonoros (Web Audio API)
    ├── css/styles.css                     # tema das telas do jogo
    ├── css/admin.css                      # tema dos painéis (admin/dev)
    ├── admin/index.html + admin.js        # painel do administrador
    └── dev/index.html + dev.js            # painel do desenvolvedor
```

---

## 4. Backend — camada de banco de dados

### 4.1 `Database.java`

Responsável pela **conexão** com o banco e pela **migração do esquema**
(DDL). Escolhe automaticamente entre dois bancos:

```java
public static synchronized Connection get() {
    if (connection == null) {
        String databaseUrl = System.getenv("DATABASE_URL");
        if (databaseUrl != null && !databaseUrl.isBlank()) {
            connection = connectPostgres(databaseUrl); // Heroku
        } else {
            connection = connectSqlite();               // local
        }
        migrate();
    }
    return connection;
}
```

A URL do Heroku Postgres (`postgres://user:pass@host:port/db`) é
convertida para o formato JDBC e conectada com `sslmode=require`. Toda
a aplicação compartilha uma única `Connection`, com acesso sincronizado
via `Database.LOCK` para evitar condições de corrida num servidor
multi-thread.

### 4.2 Esquema relacional (DDL)

Seis tabelas, criadas com `CREATE TABLE IF NOT EXISTS` (idempotente) e
pequenas migrações leves (`ALTER TABLE ... ADD COLUMN`, com colunas
descontinuadas removidas via `DROP COLUMN` quando o driver suporta):

```sql
CREATE TABLE admin_users (          -- professores (multi-tenant)
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  username          TEXT NOT NULL UNIQUE,
  password_hash     TEXT NOT NULL,
  password_salt     TEXT NOT NULL,
  cpf               TEXT NOT NULL,
  email             TEXT NOT NULL,
  phone             TEXT NOT NULL,
  token             TEXT NOT NULL,   -- token de 1º acesso (Trilha-XXX-XXX)
  first_login_done  INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL
);

CREATE TABLE dev_users (            -- desenvolvedores (gerenciam admin_users)
  id             TEXT PRIMARY KEY,
  username       TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  password_salt  TEXT NOT NULL,
  created_at     TEXT NOT NULL
);

CREATE TABLE sessions (
  id              TEXT PRIMARY KEY,
  child_name      TEXT NOT NULL,
  admin_username  TEXT,              -- a qual professor/turma pertence
  started_at      TEXT NOT NULL,
  finished_at     TEXT               -- NULL até o Jogo 3 ser concluído
);

CREATE TABLE game1_results (        -- Jogo 1: Stroop / controle inibitório
  session_id               TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  total_trials              INTEGER,
  acertos                   INTEGER,
  erros_impulso             INTEGER,
  omissoes                  INTEGER,
  tempo_reacao_medio_ms      INTEGER
);

CREATE TABLE game2_results (        -- Jogo 2: Corsi / memória de trabalho
  session_id                   TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  rodadas_jogadas                INTEGER,
  taxa_acerto                    REAL,
  tempo_resposta_medio_ms         INTEGER,
  extensao_maxima_sequencia       INTEGER,
  erros_por_posicao               INTEGER,
  celulas_acertadas               INTEGER
);

CREATE TABLE game3_results (        -- Jogo 3: WCST / flexibilidade cognitiva
  session_id                        TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  total_cartas                       INTEGER,
  acertos                            INTEGER,
  trocas_de_regra                    INTEGER,
  tentativas_ate_adaptacao_media      REAL,
  erros_apos_mudanca_regra            INTEGER,
  tempo_medio_resposta_ms             INTEGER,
  indice_perseveracao                 INTEGER
);
```

`session_id` é ao mesmo tempo chave primária e chave estrangeira em
cada tabela de resultado — modela o relacionamento **1 para 1** entre
uma sessão e o resultado de cada jogo. `sessions.admin_username` isola
os dados por professor (multi-tenant): cada administrador só enxerga,
no seu painel, as sessões que jogaram pelo link dele.

Na primeira execução, `Database.migrate()` também garante um
**administrador de bootstrap** e um **desenvolvedor de bootstrap**,
cujas credenciais vêm de variáveis de ambiente (`TRILHA_ADMIN_*` e
`TRILHA_DEV_*`; se ausentes, é gerada uma senha aleatória e exibida uma
única vez no log), armazenadas como hash+salt (nunca em texto puro).

### 4.3 Repositórios (DAO)

Toda instrução SQL está isolada nos repositórios, usando exclusivamente
`PreparedStatement` (previne SQL injection por construção):

| Classe | Responsabilidade |
|---|---|
| `SessionRepository` | CRUD de sessões e resultados dos 3 jogos (`createSession`, `saveGame1/2/3` via *upsert* `ON CONFLICT ... DO UPDATE`, `getSession`, `getAllCompletedSessions(adminUsername)`, `deleteSession`, `transferSessions`, `deleteSessionsByAdmin`) |
| `AdminUserRepository` | CRUD de professores (`findByUsername`, `getById`, `listAll`, `create`, `update`, `delete`, `markFirstLoginDone`) |
| `DevUserRepository` | Consulta de desenvolvedores (`findByUsername`) |

`saveGame3` também atualiza `sessions.finished_at`, marcando a sessão
como concluída — é o gatilho que faz a sessão aparecer para o
administrador. Cada linha do `ResultSet` de uma sessão é convertida
para `Map<String,Object>` aninhado (chaves `game1`, `game2`, `game3`),
reproduzindo exatamente a forma do JSON que o frontend espera.

---

## 5. Backend — camada de domínio (scoring)

### 5.1 `ScoringService.java` — o núcleo da regra de negócio

Implementa, nesta ordem: **normalização min-max**, uma **regra especial
do Jogo 2**, **classificação por faixa** e **ranking por função**.

#### a) Métricas por função executiva

```java
GAME1_METRICS = {EI, OM, TR1, AC}          → EI, OM e TR1 "menor é melhor"
                                              (erros de impulso, omissões,
                                               tempo de reação médio); AC
                                              (acertos) "maior é melhor"
GAME2_METRICS = {TA, TR2, SM, EP, CA}      → TA, SM e CA "maior é melhor"
                                              (taxa de acerto, sequência
                                               máxima, células acertadas);
                                              TR2 e EP "menor é melhor"
GAME3_METRICS = {TAc, EM, TAd, P}          → todas "menor é melhor"
```

`AC` chega ao `ScoringService` **já em dobro** — o valor bruto salvo por
`game1.js` (`acertos: correct.length * 2`, ver seção 10). Isso é
proposital e não distorce a nota: a normalização min-max é invariante a
um fator de escala uniforme (todos os participantes são dobrados pela
mesma proporção), então o resultado normalizado de `AC` é idêntico ao
que seria obtido usando a contagem real de acertos. As telas do usuário
e do administrador dividem esse valor por 2 apenas na hora de **exibir**
(ex.: `20/20`, nunca `40/20`) — a avaliação em si usa o valor em dobro.

#### b) Normalização min-max (nota 0–100 por métrica)

Cada métrica bruta é convertida numa nota de 0 a 100, relativa
**apenas às sessões marcadas para contar na média da turma**
(parâmetro `includedIds`, controlado pelos checkboxes do painel):

```java
private static double normalize(double value, double min, double max, boolean lowerBetter) {
    if (max == min) return 100.0;               // sem variação → todos empatados no melhor
    double score = lowerBetter
            ? 100.0 * (max - value) / (max - min)  // ex.: tempo de reação (menor = melhor)
            : 100.0 * (value - min) / (max - min);  // ex.: taxa de acerto (maior = melhor)
    return clamp(score, 0.0, 100.0);
}
```

A melhor execução da turma sempre vira **100**; a pior vira **0**; as
demais são interpoladas linearmente entre esses dois extremos. Sessões
**fora** da coorte selecionada ainda recebem nota (calculada contra o
mesmo mínimo/máximo da coorte), mas não influenciam esse mínimo/máximo.

O escore de cada função é a **média aritmética simples** das notas
normalizadas do respectivo jogo (`Sinib`, `Smem`, `Sflex`), cada um um
número real de 0 a 100, exibido no frontend como porcentagem (ex.:
`63.8%`).

#### c) Regra especial do Jogo 2 — taxa de acerto 0%

```java
Double taxaAcerto = (Double) r.get("TA");
if (taxaAcerto != null && taxaAcerto == 0.0) {
    Smem = 0.0;
}
```

Se a taxa de acerto (`taxa_acerto`) da sessão for **exatamente 0%** (a
criança não completou nenhuma sequência corretamente no Jogo 2), a nota
de memória de trabalho (`Smem`) é **zerada**, mesmo que as outras
métricas normalizadas do jogo (tempo de resposta, células acertadas
parciais etc.) resultassem, isoladamente, em uma nota parcial positiva.

#### d) Classificação por faixa

```java
public static String classify(double score) {
    if (score <= 25.0) return "abaixo";    // Abaixo da Média
    if (score <= 75.0) return "mediano";   // Mediano
    return "acima";                          // Acima da Média
}
```

#### e) Classificação final (voto de maioria)

A classificação final é a **moda** entre `classInib`, `classMem` e
`classFlex` — 2 de 3 iguais decide; em caso de empate triplo (uma de
cada categoria), o resultado é sempre "Mediano" (opção conservadora).

#### f) Ranking (posição na turma)

Para cada função, a lista de participantes é ordenada por escore
decrescente e cada um recebe uma posição usando **ranking olímpico**
(empates recebem a mesma posição; a próxima posição pula o número de
empatados).

#### g) Formato de saída

`computeCohortScores(sessions, includedIds)` devolve um mapa por
participante contendo: os 13 valores brutos (`EI`, `OM`, `TR1`, `AC`,
`TA`, `TR2`, `SM`, `EP`, `CA`, `TAc`, `EM`, `TAd`, `P`), os 3 escores
(`Sinib`, `Smem`, `Sflex`, arredondados a 1 casa decimal), as 4
classificações (`classInib`, `classMem`, `classFlex`, `classFinal`), os
3 rankings (`rankInib`, `rankMem`, `rankFlex`), o `totalParticipants` e
a flag `inCohort`.

---

## 6. Backend — camada HTTP e autenticação

### 6.1 `Main.java`

Bootstrap da aplicação: garante o banco (`Database.get()`), sobe um
`HttpServer` nativo do JDK com dois *contexts* (`/api/` → `ApiHandler`,
`/` → `StaticFileHandler`) e um *thread pool* de 8 threads.

### 6.2 `ApiHandler.java` — roteador

Como o `HttpServer` nativo só registra *contexts* por prefixo fixo, o
roteamento é manual: o `path` é dividido por `/` e o número de
segmentos + o método HTTP decidem a operação. Três grupos de rotas:

- **Sessões de jogo (aluno, sem autenticação)** — criar sessão, salvar
  resultado de cada jogo, buscar uma sessão;
- **Painel do administrador (requer `X-Admin-Token` de uma sessão
  "admin" válida)** — listar sessões da própria turma, calcular
  escores, apagar participante, login/logout/retomada de sessão;
- **Painel do desenvolvedor (requer `X-Admin-Token` de uma sessão
  "dev" válida)** — CRUD de administradores, login/logout/retomada.

`requireAdmin`/`requireDev` são *middlewares* que validam o token antes
de delegar para o handler real; qualquer exceção não tratada cai num
`catch` genérico que responde `500`.

### 6.3 `AdminAuthService.java` — segurança

Concentra as regras usadas tanto pelo login do administrador quanto
pelo do desenvolvedor:

- **Hash de senha**: SHA-256 com salt aleatório de 16 bytes por
  usuário (sem depender de bibliotecas externas); comparação em
  **tempo constante** para evitar ataques de temporização.
- **Token de administrador**: formato `Trilha-XXX-XXX`, gerado com
  `SecureRandom` a partir de um alfabeto sem caracteres ambíguos
  (sem `O`/`0`/`I`/`1`). Só é pedido no **primeiro login** de cada
  administrador (`handleAdminLogin` responde `{needsToken:true}` se o
  usuário/senha estiverem certos mas `first_login_done` ainda for
  falso); uma vez validado, a conta fica marcada e os logins seguintes
  usam só usuário e senha.
- **Validação de CPF**: algoritmo padrão de dígito verificador (rejeita
  todos os dígitos iguais).
- **Validação de e-mail e telefone**: regex simples para e-mail;
  telefone aceita 10 ou 11 dígitos (DDD + número, com ou sem o 9º
  dígito).
- **Sessões de login em memória** (`ConcurrentHashMap<String,
  LoginSession>`): token aleatório de 32 bytes em hexadecimal, janela
  **deslizante** de 30 minutos — qualquer chamada autenticada
  bem-sucedida renova a expiração (`touch()`); só expira de fato após
  30 minutos **sem nenhuma atividade**.
- **Bloqueio por tentativas**: após 5 tentativas de login malsucedidas
  para a mesma chave (`admin:usuario` ou `dev:usuario`), bloqueia por
  15 minutos (`HTTP 423`).

### 6.4 `StaticFileHandler.java`

Serve os arquivos de `public/` e implementa o roteamento especial:

- **Rotas por professor**: `/{usuario}.html` abre o login de uma turma
  específica; `/game1/{usuario}.html`, `/game2/{usuario}.html`,
  `/game3/{usuario}.html` e `/finished/{usuario}.html` abrem as telas
  do jogo mantendo o mesmo contexto de professor (o `StaticFileHandler`
  reescreve para o HTML genérico correspondente; o JavaScript da página
  lê o usuário de `location.pathname` via `getUsernameFromPath()`).
- **URLs escondidas**: `/admin`, `/admin/index.html`, `/dev` e
  `/dev/index.html` retornam `404`; o painel do administrador só abre
  em `/admin/trilhas/index.html`, e o do desenvolvedor em
  `/dev/trilhas/index.html`.
- **Proteção contra path traversal**: o caminho resolvido é normalizado
  e comparado com o diretório-base (`public/`); se "escapar" para fora,
  responde `403`.
- **`Content-Type`** inferido pela extensão do arquivo (`.html`,
  `.css`, `.js`, `.json`, `.svg`, imagens, `.woff2` etc.).

---

## 7. Backend — utilitário JSON

### `Json.java`

Como o projeto não usa Gson/Jackson, o parser e o serializador JSON
foram escritos à mão:

- **`write(Object)`**: percorre recursivamente `Map`, `List`, `String`,
  `Number`, `Boolean` e `null`, gerando a string JSON equivalente (com
  escape correto de aspas, barras invertidas e caracteres de controle).
- **`parse(String)` / `parseObject(String)`**: um *parser recursivo
  descendente* clássico — uma classe interna `Parser` mantém um cursor
  sobre a string e consome um caractere de cada vez, delegando para
  `parseObject`/`parseArray`/`parseString`/`parseNumber`/`parseBoolean`
  conforme o primeiro caractere não-espaço encontrado.

Isso cobre 100% dos casos que a aplicação precisa (objetos e arrays
simples, sem *schemas* complexos), num único arquivo sem dependências.

---

## 8. Contrato da API REST

### Sessões de jogo (sem autenticação)

| Método | Rota | Corpo (request) | Resposta |
|---|---|---|---|
| `POST` | `/api/sessions` | `{ childName, adminUsername }` | `201` sessão criada, ou `400`/`404` se o link do professor for inválido |
| `POST` | `/api/sessions/{id}/game1` | métricas do Jogo 1 | `200 { ok: true }` |
| `POST` | `/api/sessions/{id}/game2` | métricas do Jogo 2 | `200 { ok: true }` |
| `POST` | `/api/sessions/{id}/game3` | métricas do Jogo 3 | `200 { ok: true }` (finaliza a sessão) |
| `GET` | `/api/sessions/{id}` | — | `200` sessão completa (ou `404`) |

### Painel do administrador (header `X-Admin-Token`)

| Método | Rota | Corpo | Resposta |
|---|---|---|---|
| `POST` | `/api/admin/login` | `{ username, password, token? }` | `{ sessionToken, ... }` ou `{ needsToken: true }` no primeiro acesso |
| `POST` | `/api/admin/logout` | — | invalida a sessão |
| `GET` | `/api/admin/me` | — | confirma/retoma a sessão e renova a janela de 30min |
| `GET` | `/api/sessions` | — | array de sessões concluídas do administrador logado |
| `DELETE` | `/api/sessions/{id}` | — | apaga um participante (cascata) |
| `POST` | `/api/scores` | `{ includedIds: [...] }` | array de escores calculados (`ScoringService`) |

### Painel do desenvolvedor (header `X-Admin-Token`, sessão "dev")

| Método | Rota | Corpo | Resposta |
|---|---|---|---|
| `POST` | `/api/dev/login` | `{ username, password }` | `{ sessionToken, ... }` |
| `POST` | `/api/dev/logout` | — | invalida a sessão |
| `GET` | `/api/dev/me` | — | confirma/retoma a sessão |
| `GET` | `/api/dev/admins` | — | lista os administradores cadastrados |
| `POST` | `/api/dev/admins` | `{ name, username, password, cpf, email, phone }` | `201` administrador criado (com token de 1º acesso) |
| `PUT` | `/api/dev/admins/{id}` | `{ name, cpf, email, phone, password? }` | `200 { ok: true }` |
| `DELETE` | `/api/dev/admins/{id}` | `{ transferToUsername? }` | `200 { ok: true }` (transfere ou apaga em cascata as sessões do administrador) |

---

## 9. Frontend — fluxo geral, multi-tenant e estado de sessão

### 9.1 Navegação e URLs por professor

O frontend é *multi-page* (uma página HTML por tela, sem *router*
client-side): `index.html → game1.html → game2.html → game3.html →
finished.html`, sempre com o nome de usuário do professor embutido na
URL (`getUsernameFromPath()` / `tenantUrl()` em `api.js`), por exemplo
`/game2/professor.html`. A transição entre páginas é um
`window.location.href` comum ao final de cada etapa.

### 9.2 `js/api.js` — módulo compartilhado

Carregado em todas as páginas, define:

- **`Api`**: wrapper fino sobre `fetch()` com um método por rota da API
  (sessões de jogo, login/CRUD de admin, login/CRUD de dev), sempre
  retornando uma `Promise` já com o corpo desserializado.
- **`SessionState`**: persiste `{ id, childName, adminUsername }` da
  sessão do aluno em andamento em `sessionStorage`.
  `requireOrRedirect()` é chamado no topo de `game1.js`/`game2.js`/
  `game3.js`/`finished.js` para impedir acesso direto a essas páginas
  sem ter passado pelo login.
- **`AdminSession` / `DevSession`** (via `makeAuthSession`): guardam o
  `sessionToken` retornado no login, com expiração local espelhando a
  janela deslizante do backend (`touch()` renova a cada chamada
  autenticada bem-sucedida); `expireAndRedirect()` limpa a sessão e
  chama `window.onAuthExpired()`, implementado em cada painel para
  mostrar a tela de login novamente.
- **`FlowGuard`**: a cada carregamento de `game1`/`game2`/`game3`/
  `finished`, consulta `GET /api/sessions/{id}` e verifica se aquela é
  realmente a etapa permitida da sessão; se não for, mostra um aviso em
  tela cheia (`showLinearAlert`) e redireciona de volta.
- **`trapBackButton()`**: intercepta o botão "voltar" do navegador via
  `history.pushState`/`popstate` e mostra o mesmo aviso de fluxo linear
  em vez de navegar.
- **`attachIntroCountdown(onExpire, seconds)`**: contagem regressiva de
  60s na tela de apresentação de cada jogo; nos últimos 10s toca um
  bipe a cada segundo (`Sounds.playCountdownTick`); ao chegar a 0, o
  jogo começa automaticamente mesmo sem clique.
- **`dotsHtml(indiceAtivo)`**: as bolinhas de progresso 1-2-3 no topo.
- **`escapeHtml(texto)`**: sanitiza texto antes de inserir no DOM via
  `innerHTML`, prevenindo XSS básico.
- **`attributionFooterHtml()`**: rodapé fixo "Desenvolvido por Gabriel
  Teixeira Bernardes", incluído em todas as telas (jogo, admin, dev).

### 9.3 Padrão de renderização

Nenhuma biblioteca de UI é usada. Cada tela segue o mesmo padrão
imperativo simples (`app.innerHTML = ...template string...`). O estado
do jogo em andamento vive numa variável de módulo `g`, e cada evento
(clique, timeout) muta `g` e chama a próxima função de renderização —
é *re-render* completo da `#app` a cada mudança de tela ou rodada.

---

## 10. Frontend — Jogo 1 (Cores Mágicas / Stroop)

Arquivo: `public/js/game1.js`. Variante do **paradigma Stroop**: uma
palavra-nome-de-cor é exibida com a tinta de outra cor; a criança deve
clicar na COR da tinta, ignorando a palavra escrita.

**Parâmetros do jogo:**

```js
TOTAL_TRIALS = 20;              // 20 rodadas
TIMEOUT_MS = 20000;             // 20s por rodada
GAME_TIME_LIMIT_MS = 5 * 60 * 1000; // 5 minutos no total
CORRECT_TO_SWITCH_PALETTE = 5;  // troca de paleta a cada 5 acertos
WRONG_RT_PENALTY_MS = 3500;     // penalidade fixa (ver métricas abaixo)
```

**Paletas de cores**: 4 paletas de 4 cores cada (`COLOR_PALETTES`). A
cada 5 acertos, a paleta ativa muda para a próxima (com efeito sonoro
`Sounds.playPaletteChange()`), trocando também as palavras exibidas,
já que usam a paleta ativa.

**Geração de um *trial* (`makeTrial`)**: sorteia se será congruente
(palavra = cor da tinta) ou incongruente, e a combinação exata
palavra+tinta não pode se repetir mais de 3 vezes na sessão — o
`comboCounts` registra quantas vezes cada par já saiu, sorteando de
novo até achar uma combinação ainda disponível.

**Ciclo de uma rodada**: `renderTrial()` desenha a palavra + 4 botões
de cor e arma um `setTimeout` de `TIMEOUT_MS` (20s); se a criança não
responder a tempo, `answer(null)` é chamado automaticamente (conta como
**omissão**). `answer(cor)` calcula o tempo de reação
(`performance.now()`), toca o som correspondente e agenda a próxima
rodada 380ms depois.

**Métricas calculadas em `finishGame1`:**

| Métrica | Cálculo |
|---|---|
| `total_trials` | total de rodadas respondidas (até 20, ou menos se o cronômetro de 5min esgotar antes) |
| `acertos` | número de respostas corretas, **armazenado em dobro** (`correct.length * 2`). Esse valor em dobro é o que entra na nota de controle inibitório (`Sinib`, métrica `AC` — ver seção 5a); como a normalização min-max é invariante a esse fator de escala uniforme, o resultado da avaliação é o mesmo que seria obtido com a contagem real. As telas que exibem essa contagem (resumo do usuário em `finished.js` e o modal "Ver detalhes" do admin) dividem o valor por 2 antes de mostrar, para exibir a contagem real (ex.: `20/20`, e não `40/20`) |
| `erros_impulso` | erros cujo tempo de reação foi ≤ 80% da média bruta de resposta da sessão (impulsividade) |
| `omissoes` | respostas que estouraram os 20s da rodada |
| `tempo_reacao_medio_ms` | média dos tempos **remapeados**: acerto usa o tempo real de reação; erro **ou** omissão usa um valor fixo de penalidade de **3500 ms** (`WRONG_RT_PENALTY_MS`), em vez do tempo limite inteiro da rodada — evita que uma resposta rápida e errada, ou o próprio timeout de 20s, distorçam a média para cima ou para baixo de forma desproporcional |

**Cronômetro de 5 minutos**: um `setInterval` de 1s (`startGameClock`)
decrementa `g.remainingMs` e atualiza um *badge* de tempo restante
(`mm:ss`); ao chegar a zero, chama `finishGame1()` imediatamente com os
dados já coletados (flag `g.ended` evita finalização dupla).

---

## 11. Frontend — Jogo 2 (Caminho do Tesouro / Corsi)

Arquivo: `public/js/game2.js`. Variante do **Corsi Block-Tapping
Test**: uma sequência de blocos (grade 3×3) acende em ordem; a criança
deve reproduzir a mesma ordem clicando.

**Parâmetros do jogo:**

```js
PHASE_START_LEN = 3;      // sequência começa com 3 blocos
ROUNDS_PER_PHASE = 3;     // 3 rodadas fixas antes de aumentar a sequência
MAX_BLOCK_LEN_CAP = 9;    // comprimento máximo da sequência
MAX_LIVES = 3;            // 3 vidas
RECALL_TIMEOUT_MS = 20000; // 20s para reproduzir a sequência
GAME_TIME_LIMIT_MS = 7 * 60 * 1000; // 7 minutos no total
```

**Estrutura em fases**: diferente de um Corsi clássico (que aumenta 1
bloco a cada acerto), aqui cada comprimento de sequência ("fase") é
jogado por **3 rodadas fixas** antes de avançar, independente de
acerto ou erro (`advancePhaseIfNeeded`).

**Sistema de vidas**: `MAX_LIVES = 3`, exibidas como indicadores
circulares (`.life-dot`) no topo. Cada erro (clique errado ou tempo
esgotado durante a resposta) decrementa `g.lives`; ao chegar a 0,
`finishGame2()` é chamado imediatamente, mesmo no meio de uma fase.

**Máquina de estados de uma rodada** (`g.phase`): `"showing"` (acende
cada bloco em ordem, com nota musical própria via `Sounds.playNote`) →
`"recall"` (arma o temporizador de 20s; cada clique chama
`handleClick(idx)`) → `"idle"` (rodada terminou — sucesso, erro ou
timeout — chama `advancePhaseIfNeeded()` e inicia a próxima rodada, ou
`finishGame2()` se acabaram as vidas ou o tempo).

**Métricas calculadas em `finishGame2`:**

| Métrica | Cálculo |
|---|---|
| `rodadas_jogadas` | total de rodadas concluídas (sucesso ou erro) |
| `taxa_acerto` | rodadas com sequência 100% correta ÷ rodadas jogadas |
| `tempo_resposta_medio_ms` | tempo entre cliques consecutivos: um clique correto usa o tempo real; um clique errado usa o **maior tempo já registrado até então** no jogo (pior valor observado, não o tempo real do erro) — penaliza sem usar um valor arbitrário fora de escala |
| `extensao_maxima_sequencia` | maior comprimento de sequência completado com sucesso |
| `erros_por_posicao` | total de cliques incorretos (posição errada na sequência) |
| `celulas_acertadas` | soma de **todos** os cliques corretos, mesmo em rodadas que terminaram em erro |

> Quando `taxa_acerto` é exatamente 0%, o `ScoringService` zera a nota
> final de memória de trabalho (`Smem`) dessa sessão — ver seção 5c.

**Cronômetro de 7 minutos**: mesmo padrão do Jogo 1; ao expirar,
interrompe com segurança uma sequência que esteja sendo exibida ou
respondida (`playSequence`/`handleClick` checam `g.ended`).

---

## 12. Frontend — Jogo 3 (Regra da Magia / WCST)

Arquivo: `public/js/game3.js`. Variante do **Wisconsin Card Sorting
Test**: a criança escolhe, entre 4 cartas, a que combina com uma carta
de referência segundo uma regra oculta (cor, forma ou quantidade) que
muda periodicamente sem aviso.

**Parâmetros do jogo:**

```js
CORRECT_PER_RULE = 5;      // 5 acertos necessários para trocar de regra
TOTAL_RULES = 3;           // cor, forma, quantidade
TARGET_TOTAL_CORRECT = 15; // objetivo: 15 acertos no total (5 por regra)
MAX_TRIALS = 30;           // teto de cartas, independente da meta de acertos
TRIAL_TIMEOUT_MS = 20000;  // 20s por carta
GAME_TIME_LIMIT_MS = 7 * 60 * 1000; // 7 minutos no total
WRONG_RT_PENALTY_MS = 3500; // penalidade fixa (ver métricas abaixo)
```

A ordem das 3 regras é sorteada **uma vez no início da sessão**
(`shuffle(RULES)`); a regra muda para a próxima da ordem assim que a
criança acumula 5 acertos sob a regra vigente (não precisa ser
consecutivo). O jogo termina ao atingir os 15 acertos totais, ao
esgotar as 30 tentativas, ou ao esgotar o cronômetro de 7 minutos.

**Geração de uma carta** (`makeCard`): combinação aleatória de
`{ color, shape, qty }` a partir de 4 cores × 4 formas (`▲ ● ■ ★`) × 4
quantidades.

**Geração das opções** (`buildTrial`): para cada uma das 3 dimensões,
gera uma carta que combina com a referência **apenas naquela
dimensão** (as outras duas são forçadamente diferentes), mais uma
carta que **não combina em nenhuma dimensão**. Isso garante que
exatamente uma opção seja a resposta correta para cada regra possível.

**Sequência de exemplo (acima das opções)**: a tela mostra, acima da
grade de 4 opções, uma sequência lógica com duas cartas ligadas por uma
seta — a carta de referência e uma carta "exemplo" gerada por
`buildRuleExample(ref, rule)`:

```js
function buildRuleExample(ref, rule) {
  const example = { color: ref.color, shape: ref.shape, qty: ref.qty };
  if (rule !== "cor") example.color = randPick(COLORS.filter((c) => c.n !== ref.color.n));
  if (rule !== "forma") example.shape = randPick(SHAPES.filter((s) => s !== ref.shape));
  if (rule !== "quantidade") example.qty = randPick(QTYS.filter((q) => q !== ref.qty));
  return example;
}
```

A carta-exemplo compartilha com a referência **apenas** a dimensão da
regra vigente e difere **nas outras duas**: se a regra é por cor, as
duas cartas têm a mesma cor mas forma e/ou quantidade diferentes; se é
por quantidade, o mesmo número de itens mas cor/forma diferentes; se é
por forma, a mesma forma mas cor/quantidade diferentes. Isso ilustra
visualmente o padrão que a criança deve seguir (ex.: `■■■ › ▲▲▲▲`),
sem nomear a regra em texto. A carta-exemplo é puramente ilustrativa —
não é clicável, e a lógica de acerto continua comparando a resposta
escolhida com a carta de referência (`matchDim === g.rule`), exatamente
como antes.

**Detecção de perseveração**: uma resposta errada é marcada como
*perseverativa* quando a dimensão escolhida coincide com a regra
**imediatamente anterior** à última troca — isto é, a criança continuou
respondendo de acordo com uma regra que já não vale mais.

**Cálculo de "tentativas até adaptação"** (`finishGame3`): a lista de
respostas é dividida em "épocas" (uma por bloco de regra realmente
iniciado); em cada época, procura-se a primeira sequência que acumula 5
acertos — o índice onde isso acontece é quantas tentativas foram
necessárias para se adaptar à nova regra. A métrica final é a **média**
dessas contagens entre as épocas que de fato completaram a adaptação.

**Métricas calculadas em `finishGame3`:**

| Métrica | Cálculo |
|---|---|
| `total_cartas` | total de cartas respondidas |
| `acertos` | total de acertos (`g.totalCorrect`) |
| `trocas_de_regra` | quantas vezes a regra mudou na sessão |
| `tentativas_ate_adaptacao_media` | média de tentativas para acumular 5 acertos em cada bloco de regra (ver acima) |
| `erros_apos_mudanca_regra` | total de respostas erradas na sessão |
| `tempo_medio_resposta_ms` | média dos tempos **remapeados**: acerto usa o tempo real; erro (mesmo se respondido rápido) usa o valor fixo de penalidade de **3500 ms** (`WRONG_RT_PENALTY_MS`), em vez do tempo limite inteiro da rodada |
| `indice_perseveracao` | total de erros marcados como perseverativos |

**Temporizador por rodada**: 20 segundos por carta
(`TRIAL_TIMEOUT_MS`); se a criança não responder, `answer(-1)` é
chamado com um valor sentinela, contabilizando como erro (sem
perseveração) e tocando `Sounds.playTimeout()`.

---

## 13. Frontend — efeitos sonoros

### `js/sounds.js`

Todos os sons são **sintetizados em tempo real via Web Audio API** —
não existe nenhum arquivo `.mp3`/`.wav` no projeto. Isso elimina
qualquer questão de licenciamento de áudio e garante funcionamento
100% offline.

**Função primitiva `tone(freq, startTime, duration, opts)`**: cria um
`OscillatorNode` (forma de onda `sine`/`triangle`/`sawtooth`/`square`)
conectado a um `GainNode`, que conecta ao `AudioContext.destination`. O
envelope de volume sobe rápido (`linearRampToValueAtTime`) e decai
suavemente (`exponentialRampToValueAtTime`), evitando o estalo audível
de uma transição abrupta de volume.

**Sons compostos**, cada um uma sequência de 1 a 3 chamadas a `tone()`:

| Função | Quando toca | Caráter |
|---|---|---|
| `playStart()` | ao clicar em "Estou pronto(a)!"/"Iniciar Jogos" em qualquer jogo | arpejo ascendente de 3 notas |
| `playCorrect()` | resposta certa | 2 notas curtas ascendentes |
| `playWrong()` | resposta errada | 2 notas graves, onda *sawtooth* |
| `playTimeout()` | tempo esgotado (por rodada ou pelo cronômetro do jogo) | 3 bipes iguais, onda *square* |
| `playNote(index)` | Jogo 2 — bloco mostrado/clicado | 1 nota de uma escala fixa de 9 notas (`NOTE_SCALE`), uma por bloco |
| `playCountdownTick()` | últimos 10s da contagem regressiva de apresentação | bipe curto |
| `playPaletteChange()` | Jogo 1 (nova paleta) / Jogo 3 (troca de regra) | "flourish" de 2 notas |

O `AudioContext` é criado sob demanda (`getCtx()`) — os navegadores
exigem que ele seja iniciado a partir de um gesto do usuário, o que já
acontece naturalmente porque o primeiro som (`playStart`) é disparado
pelo clique no botão "Estou pronto(a)!". Todas as funções são
envolvidas em `try/catch`, para que a ausência de suporte a áudio não
quebre o jogo.

---

## 14. Frontend — painel do administrador

Arquivos: `public/admin/index.html` + `public/admin/admin.js`.

### 14.1 Autenticação em duas etapas

`renderGate()` pede apenas **usuário e senha** (`tryLoginStep1`). Se o
backend responder `{needsToken: true}` (primeiro acesso daquele
administrador), abre uma **segunda tela** (`renderTokenStep`) só com o
campo de token (`Trilha-XXX-XXX`, gerado pelo painel do desenvolvedor).
Uma vez confirmado (`tryLoginStep2`), a conta fica marcada como
validada e os logins seguintes usam só usuário e senha. Ao recarregar a
página, `init()` tenta retomar a sessão salva (`GET /api/admin/me`)
antes de mostrar a tela de login.

### 14.2 Estado do painel

```js
let state = {
  sessions: [],       // dados brutos de todas as sessões concluídas
  selectedIds: Set,    // seleção pendente dos checkboxes "na média"
  appliedIds: Set,      // seleção em vigor (usada no último cálculo de /api/scores)
  scored: [],           // resultado mais recente de POST /api/scores
  chartsVisible: bool,
};
```

A separação entre `selectedIds` e `appliedIds` permite o fluxo
"marque/desmarque os checkboxes → aparece um aviso → clique em
'Recalcular médias' para efetivar": alterar um checkbox só muda
`selectedIds`; o recálculo de fato (`Api.getScores`) só acontece em
`recalcAverages()`.

### 14.3 Tabela principal e detalhes

Uma linha por participante: checkbox "na média", nome, data, os 3
escores por função (número + *badge* colorido), a classificação final
e um botão "Ver detalhes". O `<tfoot>` calcula a média da turma
(apenas da coorte aplicada), replicando em JavaScript as mesmas funções
`classify`/`classifyMajority` do backend. O modal de detalhes
(`showDetails(id)`) mostra os 3 escores + classificação, a posição na
turma por função, todas as métricas brutas dos 3 jogos e um botão para
**deletar o participante** (com confirmação mostrando o nome).

### 14.4 Gráficos e exportação

Gráficos com **Chart.js** (CDN, inicialização condicional para não
quebrar a página se a internet falhar), ocultos por padrão atrás do
botão "Visualizar gráficos": distribuição de classificação (rosca),
Controle Inibitório (barras horizontais), Memória de Trabalho (colunas)
e Flexibilidade Cognitiva (linha) — coloridos por classificação, ou
cinza quando a sessão está excluída da média.

**CSV**: montado manualmente como string (`csvSafe` escapa vírgulas/
aspas/quebras conforme RFC 4180), com todas as métricas brutas,
escores, rankings e uma linha final com a média da turma. **PDF**: usa
**jsPDF** + **jspdf-autotable** (CDN) para gerar uma tabela formatada.
Ambos baixados via `Blob`/`<a download>`.

### 14.5 Link do jogo para a turma

`gameLinkBannerHtml()` monta e exibe a URL de login da turma daquele
administrador (`tenantUrl(username, "login")`), com botão para copiar
(`navigator.clipboard`, com *fallback* via `document.execCommand` em
navegadores/contextos sem Clipboard API).

---

## 15. Frontend — painel do desenvolvedor e estilo visual

### 15.1 Painel do desenvolvedor (`public/dev/index.html` + `dev.js`)

Login próprio, com os mesmos padrões de segurança e sessão
deslizante/persistente do painel do administrador (sem a etapa de
token — o desenvolvedor não tem primeiro acesso especial). Permite CRUD
completo dos administradores (professores): nome, usuário, senha, CPF,
e-mail e telefone — validados no backend (`AdminAuthService`) e também
no frontend (mesma lógica replicada em `dev.js`, com máscara automática
de CPF e telefone). A criação de um administrador gera automaticamente
o token de primeiro acesso e mostra uma tela de revelação
(`showTokenReveal`) para copiá-lo. A exclusão de um administrador
oferece **transferir** as sessões dele para outro administrador
existente, ou **excluir tudo** em cascata (com confirmação explícita).

### 15.2 Estilo visual (CSS)

- **`css/styles.css`**: tema das telas do jogo — paleta em tons de azul
  claro (variáveis CSS customizadas por jogo, `body.theme-g1/g2/g3`,
  cada uma com um gradiente de fundo levemente diferente), tipografia
  lúdica (`Fredoka` para títulos, `Nunito` para texto), componentes
  responsivos via `clamp()`. Cada jogo tem uma ilustração de fundo em
  SVG embutido diretamente no HTML (sem requisições de imagem
  externas). Inclui os estilos específicos de cada jogo (`.stroop-word`,
  `.grid3`/`.block` do Corsi, `.ref-card`/`.opt-card`/`.rule-example`/
  `.seq-arrow` do WCST) e componentes compartilhados (`.btn`,
  `.progress-dots`, `.time-badge`, `.intro-countdown`,
  `.flow-alert-overlay`, `.attribution-footer`).
- **`css/admin.css`**: tema separado, mais sóbrio/profissional (fundo
  claro neutro, tipografia `Nunito`), incluindo os estilos dos *badges*
  de classificação, do modal de detalhes/formulários e da linha de
  totais da tabela — compartilhado pelos painéis de administrador e de
  desenvolvedor.

### 15.3 Sem emojis na interface

Nenhuma tela da aplicação (jogos, painel do administrador, painel do
desenvolvedor) usa emojis decorativos. Telas de introdução, botões de
ação, indicadores de tempo restante e mensagens de feedback usam apenas
texto simples; onde havia um ícone funcional (ex.: fechar um modal), o
emoji foi substituído por um caractere tipográfico neutro (`×`). Os
únicos símbolos não-textuais que permanecem são os que fazem parte do
próprio conteúdo do jogo — as quatro formas do Jogo 3 (`■ ● ▲ ★`,
definidas em `SHAPE_GLYPH`) e a seta da sequência de exemplo (`›`) — e
a seta de navegação (`←`) do link "Voltar" no painel do administrador,
que é um caractere de pontuação, não um emoji.

---

## 16. Convenções de código adotadas

- **Java**: classes utilitárias (`Json`, `ScoringService`,
  `AdminAuthService`) são `final` com construtor privado — agrupam
  métodos estáticos relacionados, não são feitas para ser
  instanciadas. Toda comunicação entre as camadas usa
  `Map<String,Object>`/`List<Object>` (em vez de classes de
  modelo/DTO) deliberadamente, para que a serialização JSON seja
  direta e o acoplamento entre camadas fique mínimo — troca simples
  para POJOs formais, se o projeto crescer.
- **JavaScript**: sem classes ES6 nem módulos (`import`/`export`) —
  cada arquivo declara funções/constantes no escopo global do script,
  carregadas em sequência via `<script>` no HTML. Escolha deliberada
  para manter o projeto sem etapa de *bundling*.
- **Nomenclatura**: nomes de métricas em português (`erros_impulso`,
  `tempo_reacao_medio_ms`) no banco/API, para casar diretamente com a
  terminologia da metodologia do TCC; nomes de variáveis/funções de
  código em português ou inglês conforme o que ficou mais natural em
  cada trecho (predomina português nos comentários, inglês em nomes de
  função curtos como `renderScreen`, `handleClick`).
- **Comentários**: todo arquivo começa com um bloco `/** ... */`
  explicando seu papel na arquitetura; funções não triviais (cálculo
  de escore, normalização, ranking, detecção de perseveração, geração
  da sequência de exemplo do Jogo 3) têm comentário explicando a
  fórmula/regra, não apenas repetindo o nome do método.
- **Sem emojis**: por convenção deste projeto, a interface não usa
  emojis decorativos (ver seção 15.3) — novas telas/mensagens devem
  seguir o mesmo padrão (texto simples, ou um caractere tipográfico
  neutro quando um ícone funcional for realmente necessário).
