# Installation and hosting

[Home](../README.md) · [Русский](#русский)

## Availability and prerequisites

This is the first public beta. There are no downloadable desktop release installers yet. The source uses Tauri 2 / React 18 / TypeScript / Vite 5. Use Node.js 24 LTS with npm for the instructions below; dependency versions are fixed by `package-lock.json`. A normal user terminal is sufficient for application commands. Installing OS build dependencies may require administrator privileges.

The existing Windows web tests/build were run using Node 24.19.0 and installed dependencies. Fresh `npm ci`, Docker, Linux/macOS native builds and native installer acceptance still need their respective environments. Do not interpret an example command as a completed platform test.

## 0. First-time setup — start here

For the simplest first run, use the browser version. You need an internet connection for the initial dependency download, a modern browser, and **Node.js 24 LTS with npm**. Rust, Visual Studio, Python and Docker are not needed for this route.

### A. Install Node.js

1. Open the [official Node.js download page](https://nodejs.org/en/download). Select the **24 LTS** line and your operating system.
2. **Windows:** download the Windows installer (.msi), choose x64 for an ordinary Intel/AMD PC or ARM64 for Windows on ARM, and run it. Keep npm and Add to PATH enabled. Extra native-module tools are unnecessary for the browser route.
3. **macOS:** use the official macOS installer (.pkg) and complete its wizard.
4. **Linux:** select Linux on the same page and follow its current installation instructions for Node 24. If using the displayed version-manager method, complete its shell initialization step before continuing. Do not assume your distribution's default nodejs package is version 24.
5. Close old terminals. Open a **new** PowerShell on Windows or Terminal on macOS/Linux. Check the installation:

```powershell
# Windows PowerShell
node --version
npm.cmd --version
```

```sh
# Linux / macOS
node --version
npm --version
```

The first command should show v24.x.x; the second should show an npm version. If a command is not found, restart the terminal and check that Node was installed with PATH support. Do not proceed until both commands work.

### B. Download RF CALC — no Git required

1. Open [TimHardLite/rf-calc](https://github.com/TimHardLite/rf-calc).
2. Click **Code → Download ZIP**, or use [this source ZIP](https://github.com/TimHardLite/rf-calc/archive/refs/heads/main.zip).
3. Extract the ZIP completely. On Windows, right-click → **Extract All**. Do not run from inside the archive.
4. Open the extracted inner folder containing **package.json**, **src**, and **src-tauri**. For example, move it to C:\Projects\rf-calc-main on Windows or ~/Projects/rf-calc-main on macOS/Linux. Avoid protected system folders.
5. On Windows, click the folder address bar in Explorer, type powershell, and press Enter. On macOS/Linux open Terminal and use cd with the actual extracted path in quotes. Example Windows command: `cd "C:\Projects\rf-calc-main"`; example Unix command: `cd "$HOME/Projects/rf-calc-main"`.
6. Follow section 1 below: install dependencies, wait for success, then start the app. Keep that terminal open while using the browser.

### C. Alternative: clone with Git

Install [Git](https://git-scm.com/downloads) if it is not already installed. Open a new terminal in the parent directory where you want the project, then run (Windows PowerShell, Linux or macOS):

```sh
git clone https://github.com/TimHardLite/rf-calc.git
cd rf-calc
```

Continue with section 1. Cloning is optional; ZIP users get the same source. With Git, future updates can use `git pull --ff-only` from a clean checkout, followed by dependency installation and rebuild. Preserve local changes and exported .irta files first.

### D. Common first-run problems

| Message or symptom | What to do |
|---|---|
| package.json / ENOENT not found | You are in the wrong directory. Open the inner extracted project folder. |
| npm.ps1 cannot be loaded | On Windows use npm.cmd as shown below; do not weaken execution policy. |
| npm ci fails to download | Check the connection/proxy and the first actual error; retry npm ci after fixing it. Do not bypass TLS verification. |
| Port 1422 is already in use | Close the previous RF CALC dev terminal with Ctrl+C, or use `npm run dev -- --port 1423` and open the address printed by Vite. |
| Page stops after terminal closes | Restart npm run dev. A persistent site needs section 3 or 4. |
| Empty page after double-clicking index.html | Serve dist over HTTP as explained in section 2. |

## 1. Run in a browser from source

Unpack the source archive into a folder such as `rf-calc`. Open a terminal **in that folder**.

Windows PowerShell (use `npm.cmd` if the PowerShell script execution policy blocks `npm.ps1`):

```powershell
npm.cmd ci
npm.cmd run dev
```

Linux/macOS terminal:

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:1422/`. Stop the process with Ctrl+C. Development mode supports source updates; it is not the deployment server. Do not run npm as administrator to work around errors.

## 2. Build once and serve the web application

Windows PowerShell:

```powershell
npm.cmd ci
npm.cmd run build
```

Linux/macOS:

```sh
npm ci
npm run build
```

Alternatively, download **rf-calc-1.0.0-beta.1-web.zip** from [the beta release](https://github.com/TimHardLite/rf-calc/releases/tag/v1.0.0-beta.1) and extract it. This skips Node and the build step; you still need an HTTP server as shown below.

The output is `dist/`. Copy **only its contents** to your static website root. A prepared web archive contains these same files. Keep the `assets/` directory and logos together. Opening `index.html` by double-clicking is unsupported because module workers need an HTTP(S) origin.

For a quick local check with Python 3 installed, run from the source folder:

```powershell
# Windows PowerShell
py -m http.server 8080 --bind 127.0.0.1 --directory dist
```

```sh
# Linux/macOS
python3 -m http.server 8080 --bind 127.0.0.1 --directory dist
```

Open `http://127.0.0.1:8080/`. If using the unpacked web archive, replace `dist` with `.`. This is a local check, not the recommended public server.

## 3. Windows or Linux server without Docker

Install [Caddy](https://caddyserver.com/docs/install) from its official distribution. On Windows, place `caddy.exe` in PATH or invoke its full path; on Linux, use the official package instructions. Copy the built web files into a dedicated folder. Do not serve the source repository, private `.irta` files or parent engineering folders.

Windows PowerShell, assuming `C:/rf-calc-web` contains `index.html`:

```powershell
caddy file-server --root C:/rf-calc-web --listen 127.0.0.1:8080
```

Linux shell, assuming `/srv/rf-calc` contains `index.html`:

```sh
caddy file-server --root /srv/rf-calc --listen 127.0.0.1:8080
```

Localhost is accessible only on that machine. For access from another computer on your LAN, use `--listen :8080`, allow inbound TCP 8080 for the intended network, and browse to `http://SERVER_LAN_IP:8080/`. Replace `SERVER_LAN_IP` with the server's actual address. This exposes the site to that network; the app has no login screen.

For a domain, point its DNS A record (and AAAA only if IPv6 is configured) to the public server, make ports 80/443 reachable, and use this Caddyfile. Replace the example domain with yours:

```caddyfile
rf.example.com {
    root * /srv/rf-calc
    encode zstd gzip
    file_server
}
```

On Windows replace the root with `C:/rf-calc-web`. Run `caddy validate --config Caddyfile`, then `caddy run --config Caddyfile`. For continuous service use [Caddy's OS service instructions](https://caddyserver.com/docs/running). Caddy can provision public HTTPS certificates when domain validation and network reachability succeed. A domain is optional for LAN use; do not promise public access from a connection behind CGNAT without an appropriate hosting/network solution.

Host this version at the **site root**, not a URL subdirectory: some logo paths are absolute. No server-side calculation, database or API key is needed. Each visitor performs calculations on their own device; a powerful web server does not accelerate them.

## 4. Docker Compose

1. Install [Docker Desktop for Windows/macOS or Docker Engine for Linux](https://docs.docker.com/get-started/get-docker/) using the official OS guide.
2. Start Docker Desktop and use Linux containers (Windows), or start Docker Engine on Linux.
3. Check `docker --version` and `docker compose version` in a new terminal.
4. Download/extract or clone RF CALC as in section 0; open a terminal in the folder containing compose.yaml. Node is not required on the host for this route.
5. Build and start:

```sh
docker compose up -d --build
docker compose logs --tail=50
```

Open `http://127.0.0.1:8080/`. The supplied mapping intentionally binds localhost. For LAN access, change the mapping in `compose.yaml` to `"8080:80"` and recreate the service with the first command. For an internet domain, keep localhost binding and put a host-level Caddy HTTPS reverse proxy in front of `127.0.0.1:8080`.

```caddyfile
rf.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

Stop: `docker compose stop`. Start again: `docker compose start`. After source changes: `docker compose up -d --build`. The runtime image contains only the built static files and Caddy; Node is used during the build. Container execution has not yet been verified on this workstation.

## 5. Desktop application from source

Install the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS, Rust via the official toolchain, and Node/npm. Windows needs Microsoft C++ Build Tools and WebView2; Linux needs the distro's WebKitGTK 4.1 and build dependencies; macOS needs Xcode command-line tools. Follow the linked guide for your exact platform rather than copying another distro's packages.

After `npm ci`, development window:

```sh
npm run tauri dev
```

Windows release installer (PowerShell; current bundle target is NSIS):

```powershell
npm.cmd run tauri build -- --bundles nsis
```

Expected output after a successful build: `src-tauri/target/release/bundle/nsis/`. A packaged Tauri app embeds the frontend and does not require npm or a localhost development server on the user's machine. WebView2 remains a Windows runtime requirement.

The current configuration names only the Windows installer target. To investigate native Linux/macOS packaging explicitly override it on the target OS:

```sh
# Linux, experimental build path
npm run tauri build -- --bundles deb,appimage
# macOS, experimental build path
npm run tauri build -- --bundles app,dmg
```

These are build instructions, not a promise of tested packages. Signing, macOS notarization and installer acceptance remain release tasks. Do not describe an untested debug executable as a finished distribution.

## 6. Updates and backups

Export `.irta` before refreshing/restarting: there is no documented automatic recovery of unsaved forms. Keep old project files. Replace the complete web output together so JavaScript chunks match `index.html`; refresh open tabs afterwards. Never overwrite user `.irta` files as part of an application update. Read the changelog for model or format changes.

References: [Vite static deployment](https://vite.dev/guide/static-deploy.html), [Caddy static files](https://caddyserver.com/docs/quick-starts/static-files), [Docker Compose](https://docs.docker.com/compose/gettingstarted/), [Tauri Windows installer](https://v2.tauri.app/distribute/windows-installer/).

---

# Русский

## Готовность и зависимости

Это первый публичный бета-выпуск: готовых установщиков desktop пока нет. Стек — Tauri 2 / React 18 / TypeScript / Vite 5. Для команд ниже используйте Node.js 24 LTS с npm; версии зависимостей закреплены `package-lock.json`. Команды приложения запускайте без прав администратора. Установка системных компонентов сборки может требовать повышенных прав.

Веб-проверки Windows выполнялись на Node 24.19.0 с установленными зависимостями. Чистый `npm ci`, Docker, native Linux/macOS и приёмка установщика требуют отдельных проверок. Приведённая команда не означает, что она уже испытана на каждой ОС.

## 0. Первая установка — начните здесь

Самый простой первый запуск — в браузере. Нужны интернет для первоначального скачивания зависимостей, современный браузер и **Node.js 24 LTS с npm**. Rust, Visual Studio, Python и Docker для этого варианта не нужны.

### А. Установите Node.js

1. Откройте [официальную страницу Node.js](https://nodejs.org/en/download), выберите ветку **24 LTS** и свою ОС.
2. **Windows:** скачайте установщик .msi: x64 для обычного ПК Intel/AMD, ARM64 — для Windows на ARM. Пройдите установку, оставив npm и добавление в PATH включёнными. Дополнительные инструменты сборки native-модулей для браузерного запуска не требуются.
3. **macOS:** скачайте официальный установщик .pkg и пройдите его шаги.
4. **Linux:** выберите Linux на той же странице и выполните актуальную инструкцию установки Node 24. При варианте с менеджером версий выполните также инициализацию оболочки. Пакет nodejs из стандартного репозитория ОС может иметь другую версию.
5. Закройте старые терминалы, откройте новый PowerShell в Windows или Terminal в macOS/Linux и проверьте:

```powershell
# Windows PowerShell
node --version
npm.cmd --version
```

```sh
# Linux / macOS
node --version
npm --version
```

Первая команда должна показать v24.x.x, вторая — номер npm. Если команда не найдена, заново откройте терминал и проверьте установку Node и добавление в PATH. Продолжайте только после успешной проверки обеих команд.

### Б. Скачайте RF CALC — Git необязателен

1. Откройте [TimHardLite/rf-calc](https://github.com/TimHardLite/rf-calc).
2. Нажмите **Code → Download ZIP** или скачайте [ZIP исходников по прямой ссылке](https://github.com/TimHardLite/rf-calc/archive/refs/heads/main.zip).
3. Полностью распакуйте архив: в Windows — правой кнопкой → **Извлечь всё**. Не запускайте команды внутри ZIP.
4. Найдите внутреннюю папку с **package.json**, **src** и **src-tauri**. Для удобства можно перенести её в C:\Projects\rf-calc-main или ~/Projects/rf-calc-main. Не используйте системные защищённые каталоги.
5. В Windows откройте эту папку в Проводнике, в адресной строке введите powershell и нажмите Enter. В macOS/Linux откройте Terminal и перейдите командой cd в свою папку. Пример Windows: `cd "C:\Projects\rf-calc-main"`; Linux/macOS: `cd "$HOME/Projects/rf-calc-main"`. Замените путь своим.
6. Выполните раздел 1 ниже: сначала дождитесь установки зависимостей, затем запустите программу. Терминал должен оставаться открытым.

### В. Альтернатива: клонирование через Git

Установите [Git](https://git-scm.com/downloads), если его нет. Откройте новый терминал в папке, где хотите разместить проект, и выполните (PowerShell / Linux / macOS):

```sh
git clone https://github.com/TimHardLite/rf-calc.git
cd rf-calc
```

Далее переходите к разделу 1. Git не обязателен: ZIP содержит те же исходники. Для обновления чистого клона используйте `git pull --ff-only`, затем установку зависимостей и новую сборку. Предварительно сохраните свои изменения и файлы .irta.

### Г. Частые проблемы первого запуска

| Симптом | Решение |
|---|---|
| package.json / ENOENT не найден | Перейдите во внутреннюю распакованную папку проекта. |
| Запуск npm.ps1 запрещён | Используйте npm.cmd, как ниже; менять политику PowerShell не нужно. |
| npm ci не скачивает зависимости | Проверьте сеть/прокси и первую ошибку; исправьте причину и повторите. Проверку TLS не отключайте. |
| Порт 1422 занят | Остановите прежний запуск через Ctrl+C либо выполните `npm run dev -- --port 1423` и откройте адрес из терминала. |
| После закрытия терминала страница недоступна | Запустите npm run dev снова; постоянный сайт — раздел 3 или 4. |
| Пусто после двойного щелчка по index.html | Нужен HTTP-сервер для dist — раздел 2. |

## 1. Браузер из исходников

Распакуйте исходники, откройте терминал в папке с `package.json`.

```powershell
# Windows PowerShell
npm.cmd ci
npm.cmd run dev
```

```sh
# Linux/macOS
npm ci
npm run dev
```

Откройте `http://127.0.0.1:1422/`. Остановка — Ctrl+C. `npm.cmd` обходит проблему запуска обёртки `npm.ps1`, не меняя системную политику PowerShell. Режим разработки не предназначен для публикации в интернете.

## 2. Готовая веб-сборка

Windows: `npm.cmd ci`, затем `npm.cmd run build`. Linux/macOS: `npm ci`, затем `npm run build`. Результат — папка `dist/`; на сервер переносится её содержимое целиком, вместе с `assets/` и логотипами. Подготовленный веб-архив содержит те же файлы. Двойной щелчок по `index.html` не подходит: нужен HTTP(S), чтобы работали модули и фоновые потоки.

Можно пропустить Node и сборку: скачайте **rf-calc-1.0.0-beta.1-web.zip** со [страницы бета-выпуска](https://github.com/TimHardLite/rf-calc/releases/tag/v1.0.0-beta.1), распакуйте и запустите HTTP-сервер, как ниже.

Локальная проверка при установленном Python 3:

```powershell
# Windows, из корня исходников
py -m http.server 8080 --bind 127.0.0.1 --directory dist
```

```sh
# Linux/macOS
python3 -m http.server 8080 --bind 127.0.0.1 --directory dist
```

Адрес — `http://127.0.0.1:8080/`. Для распакованного веб-архива замените `dist` на `.`. Для постоянного сайта используйте следующий вариант.

## 3. Сервер Windows/Linux без Docker

Установите [Caddy](https://caddyserver.com/docs/install). Сборку положите в отдельную папку; исходники, личные `.irta` и инженерные документы в корень сайта не помещайте.

```powershell
# Windows PowerShell; caddy.exe должен быть доступен в PATH
caddy file-server --root C:/rf-calc-web --listen 127.0.0.1:8080
```

```sh
# Linux
caddy file-server --root /srv/rf-calc --listen 127.0.0.1:8080
```

Localhost доступен только на этом ПК. Для локальной сети замените адрес прослушивания на `:8080`, разрешите входящий TCP 8080 для нужной сети и открывайте `http://IP_СЕРВЕРА:8080/`. Приложение не содержит авторизации, сайт станет доступен этой сети.

Для домена направьте DNS-запись A на публичный IP сервера; AAAA добавляйте только при настроенном IPv6. Обеспечьте доступ к портам 80/443 и создайте Caddyfile:

```caddyfile
rf.example.com {
    root * /srv/rf-calc
    encode zstd gzip
    file_server
}
```

Замените домен своим; на Windows путь — `C:/rf-calc-web`. Проверьте `caddy validate --config Caddyfile`, запустите `caddy run --config Caddyfile`. Для постоянной работы настройте [службу ОС](https://caddyserver.com/docs/running). Caddy получает HTTPS-сертификат, если проверки домена и доступности проходят. Для LAN домен не нужен; за CGNAT одного домена и настройки роутера может оказаться недостаточно.

Публикуйте текущую версию в корне сайта: некоторые пути к логотипам абсолютные. База данных, сервер вычислений и API-ключи не нужны. Расчёты выполняет компьютер посетителя, поэтому мощность сервера не ускоряет подбор размеров.

## 4. Docker

1. Установите [Docker Desktop для Windows/macOS или Docker Engine для Linux](https://docs.docker.com/get-started/get-docker/) по официальной инструкции своей ОС.
2. Запустите Desktop (на Windows — Linux-контейнеры) либо службу Engine в Linux.
3. В новом терминале проверьте `docker --version` и `docker compose version`.
4. Скачайте/распакуйте или клонируйте проект по разделу 0, откройте терминал в папке с compose.yaml. Устанавливать Node на хост при этом способе не требуется.
5. Соберите и запустите:

```sh
docker compose up -d --build
docker compose logs --tail=50
```

Адрес — `http://127.0.0.1:8080/`. В `compose.yaml` по умолчанию доступ ограничен localhost. Для LAN замените публикацию порта на `"8080:80"` и повторите запуск. Для домена оставьте localhost и настройте Caddy на сервере:

```caddyfile
rf.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

Остановка — `docker compose stop`, повторный запуск — `docker compose start`, обновление после изменений — `docker compose up -d --build`. Node нужен только на стадии сборки контейнера; внутри рабочего образа — Caddy и статические файлы. Запуск контейнера на этом ПК пока не проверен.

## 5. Настольное приложение

Установите [зависимости Tauri](https://v2.tauri.app/start/prerequisites/), Rust и Node/npm. Для Windows нужны C++ Build Tools и WebView2; для Linux — WebKitGTK 4.1 и пакеты своей ОС; для macOS — инструменты командной строки Xcode.

После `npm ci` команда `npm run tauri dev` открывает окно разработки. Сборка установщика Windows в PowerShell:

```powershell
npm.cmd run tauri build -- --bundles nsis
```

Ожидаемая папка после успешной сборки — `src-tauri/target/release/bundle/nsis/`. Установленному приложению не нужны npm и сервер разработки, но нужен WebView2.

Текущая конфигурация задаёт Windows/NSIS. Экспериментальная сборка на других ОС требует явного выбора форматов:

```sh
# Linux
npm run tauri build -- --bundles deb,appimage
# macOS
npm run tauri build -- --bundles app,dmg
```

Эти сборки ещё не подтверждены. Подпись, notarization macOS и проверка установщиков — отдельные этапы выпуска. Отладочный exe нельзя выдавать за проверенный релиз.

## 6. Обновление

Перед перезапуском сохраняйте `.irta`: восстановление несохранённых форм не гарантируется. Сохраняйте старые проекты; обновляйте всю веб-сборку одновременно, затем обновляйте вкладки. Файлы пользователя не входят в процедуру обновления приложения. Изменения моделей и формата отражаются в журнале выпусков.

Источники: [Vite](https://vite.dev/guide/static-deploy.html), [Caddy](https://caddyserver.com/docs/quick-starts/static-files), [Docker Compose](https://docs.docker.com/compose/gettingstarted/), [установщик Tauri](https://v2.tauri.app/distribute/windows-installer/).
