# Development and debugging

[Home](../README.md) · [Русский](#русский)

## Source map

| Path | Responsibility |
|---|---|
| `src/App.tsx`, `src/components/`, `src/styles.css` | Forms, state, plots, dimensions and interactions |
| `src/registry.ts`, `src/fields.ts`, `src/guard.ts` | Registered models, field definitions and validation |
| `src/physics/` | Analysis models, MoM kernels and shared numerical utilities |
| `src/synth/` | Initial dimensions from design targets |
| `src/opt/` | Search variables, objectives, constraints and candidate selection |
| `src/calc.worker.ts`, `src/opt.worker.ts` | Background analysis / optimization messages and lifecycle |
| `src/project/` | IRTA parser, serializer, schema, restoration and specification |
| `src/export/` | Browser/native SVG and PNG export |
| `src-tauri/` | Rust desktop shell, platform capabilities and installer configuration |
| `scripts/`, `docs/`, `.github/workflows/` | Documentation generation, checks and build workflow |

## Repeatable checks

From the source root after `npm ci` (PowerShell may use `npm.cmd` / `npx.cmd`):

```sh
npm test
npx tsc --noEmit
npm run build
npm run docs:check
```

Focused regression: `npm test -- src/project/state.test.ts`. Native build: see installation guide. Avoid treating a frontend build as validation of Rust, WebView2 or OS file dialogs.

## Debug a reproducible issue

1. Save the smallest non-confidential `.irta` that reproduces it; record antenna, mode, steps, actual/expected result and version.
2. Use `npm run dev` locally. Open browser developer tools; inspect console errors and network failures. Worker exceptions are distinct from invalid-input warnings.
3. Reproduce without optimization, then with optimization if needed. Check whether the visible result belongs to the latest inputs.
4. For a numerical defect, add a failing case against an independent expectation or trusted reference with units/tolerances. Fix the responsible path and rerun the focused test, then the suite.
5. For physics changes, document assumptions, reference geometry, frequency, mesh and convergence. A self-consistency check is not independent measurement.

## Common problems

| Symptom | Check |
|---|---|
| npm not found | Install official Node/npm, reopen terminal; the desktop installer will not need npm |
| PowerShell blocks npm.ps1 | Use `npm.cmd`; do not disable system security policy |
| Port 1422 occupied | Stop your previous RF CALC dev process; Tauri expects its configured port |
| Blank page from file:// | Serve the web folder over HTTP(S) |
| Worker script MIME/404 error | Deploy the complete build; serve JS as JavaScript, not HTML; refresh after updates |
| Logo missing under /rf-calc/ | Deploy at domain root; subdirectory support needs a separate asset-path fix |
| Old optimization candidate disappears | Expected after input/settings change; stale candidates must not be applied |
| No SWR/optimizer | Read the model's availability message; not every antenna has an impedance model |
| Unexpected `.irta` value | Check format version, exact key/enum, section and hidden fields; read load warnings |
| PNG absent | Inspect browser downloads/settings or native dialog, test SVG; report the actual OS/browser and error |
| Native build fails | Verify Rust, C++/WebKit/Xcode prerequisites and correct OS bundle target |

## Keep docs synchronized

`src/registry.ts` is the source of field keys/defaults/ranges. `npm run irta-spec` regenerates the canonical Russian format specification, which is already covered by tests. `npm run docs:generate` regenerates the bilingual field reference from the same registry and `docs/field-help.json`. `npm run docs:check` fails on stale generated fields or missing translations. Update the English and Russian user/install guides when behavior changes; do not copy a whole new manual for every version.

The CI workflow runs tests, build and documentation checks and uploads the web output as a workflow artifact. It does not deploy a site, publish a release, collect donations or build untested native binaries automatically. Review workflow results on GitHub after each push.

---

# Русский

## Структура

`App.tsx`, `components/`, `styles.css` — формы и графики; `registry.ts`, `fields.ts`, `guard.ts` — поля и проверка входов; `physics/` — расчёт; `synth/` — синтез; `opt/` — оптимизация; два worker-файла — фоновые задачи; `project/` — IRTA; `export/` — изображения; `src-tauri/` — desktop; `scripts/`, `docs/`, `.github/workflows/` — документация и проверки.

## Проверки

Из корня после `npm ci` (PowerShell: при необходимости `npm.cmd`/`npx.cmd`):

```sh
npm test
npx tsc --noEmit
npm run build
npm run docs:check
```

Отдельный тест: `npm test -- src/project/state.test.ts`. Веб-сборка не проверяет Rust, WebView2 и системные диалоги.

## Отладка

1. Сохраните минимальный воспроизводимый `.irta` без конфиденциальных данных; укажите версию, режим, действия, ожидаемый и фактический результат.
2. Запустите `npm run dev`; в инструментах браузера проверьте консоль и сеть. Отличайте отказ worker от предупреждения о входах.
3. Проверьте обычный расчёт, затем подбор. Убедитесь, что результат соответствует последним входам.
4. Для расчётного бага сначала добавьте падающий тест с независимым эталоном, единицами и допуском; затем исправьте и прогоните профильную проверку и набор тестов.
5. Для изменения физики зафиксируйте допущения, геометрию, частоту, сетку и сходимость. Внутренняя согласованность не равна измерениям.

## Частые затруднения

| Проблема | Решение |
|---|---|
| Нет npm | Установить официальный Node/npm, заново открыть терминал |
| Блокируется npm.ps1 | Использовать npm.cmd без отключения системной политики |
| Занят 1422 | Остановить свой прежний dev-процесс; порт Tauri фиксирован |
| Пусто через file:// | Запустить HTTP(S)-сервер |
| Ошибка MIME/404 у worker | Проверить полноту сборки, MIME JavaScript и обновить страницу |
| Нет логотипа в подпапке URL | Размещать в корне домена; подкаталоги требуют отдельной правки путей |
| Пропал результат оптимизации | Нормально после изменения входов/настроек |
| Нет КСВ/подбора | Прочитать ограничение выбранной модели |
| Неожиданный ввод из IRTA | Проверить секцию, ключ, регистр enum, скрытые поля и сообщения загрузки |
| Не появился PNG | Проверить загрузки браузера/диалог, попробовать SVG, записать ОС и ошибку |
| Не собирается desktop | Проверить Rust и зависимости C++/WebKit/Xcode, формат пакета для ОС |

## Обновление документации

Ключи, умолчания и диапазоны берутся из `registry.ts`. `npm run irta-spec` обновляет каноническую спецификацию, контролируемую тестом. `npm run docs:generate` обновляет двуязычный справочник из реестра и `docs/field-help.json`; `npm run docs:check` выявляет устаревший справочник и отсутствующие переводы. При изменении поведения правьте EN и RU руководства, а не копируйте их для каждой версии.

Черновик CI выполняет проверки/сборку и сохраняет веб-файлы как артефакт workflow. Он не публикует сайт/релиз и не запускает приём платежей или непроверенные native-сборки. После согласования публикации нужно проверить фактический запуск CI на GitHub.
