# Validation record / Результаты проверок

English · [Русский](#русский)

Checked locally on 16 October 2026, Windows, Node.js 24.19.0. Draft source uses the existing installed dependency tree from the development workspace; a clean network installation was not performed.

| Check | Result |
|---|---|
| Vitest | 243/243 tests, 15/15 files; 108.52 s |
| TypeScript | `tsc -b` passed |
| Production web build | Vite 5.4.21 passed, 90 modules |
| Generated field documentation | 142 definitions, English/Russian, check passed |
| Calculation/UI source changes | 76 files SHA-256 identical to the working v3; no calculation/UI edits |
| Native installer / Docker / native Linux/macOS | Not validated in this draft |
| Clean npm ci / GitHub Actions | Not run yet |
| Publication | Owner approved public source publication; initial beta |

Earlier UI screenshots are included as illustrations of the existing v3 interface. They are not screenshots of a released installer. Native dialogs, complete browser file reopening and actual PNG disk delivery still require their recorded acceptance checks. No new external-solver calculation or antenna measurement is claimed.

# Русский

Проверено локально 16 октября 2026 года на Windows / Node.js 24.19.0. Использовано существующее дерево зависимостей рабочей среды; чистая установка из сети не выполнялась.

- Vitest: **243/243**, **15/15 файлов**, 108,52 с.
- TypeScript `tsc -b`: успешно.
- Vite 5.4.21: сборка успешна, 90 модулей.
- Справочник: 142 определения EN/RU, проверка актуальности успешна.
- Все 76 файлов src совпадают по SHA-256 с рабочей v3; расчётный/UI-код не изменён.
- Native-установщик, Docker, native Linux/macOS, чистый npm ci и GitHub Actions ещё не проверены.
- Владелец одобрил публичную публикацию исходников первого бета-выпуска.

Иллюстрации показывают существующий интерфейс v3, а не готовый установщик. Системные диалоги, полное повторное открытие через браузер и фактическое сохранение PNG на диск требуют отдельной приёмки. Новые измерения или запуски внешних решателей не заявляются.





Documentation audit: 68 relative links resolve; 284 rows cover all 142 fields in EN/RU. The supplied dipole IRTA example has complete forms and passed parser/serializer round-trip checks.

Документация: 68 локальных ссылок исправны, 284 строки охватывают 142 поля EN/RU. Пример IRTA полон и прошёл цикл чтения/записи. Визуальная проверка HTML через браузер не завершена: соединение с локальным предпросмотром завершалось тайм-аутом.


## Publication update — 17 October 2026 / Обновление публикации

The current Yagi illustration was captured from the running application at 180 MHz with both full pattern cuts visible. Public version metadata is synchronized to 1.0.0-beta.1; the only src change after the 16 October suite is the footer version label. Calculation algorithms and the IRTA format are unchanged.

Новый снимок яги сделан в работающей программе на 180 МГц: оба сечения видны целиком. Метаданные согласованы с 1.0.0-beta.1; после прогона 16 октября в src изменена только надпись версии внизу интерфейса. Алгоритмы и формат IRTA прежние.

## GitHub validation — 17 October 2026

[Public CI run](https://github.com/TimHardLite/rf-calc/actions/runs/38992354858), commit c491350: Ubuntu 24.04, Node 24.21.0, npm 11.19.0. Clean npm ci, **243/243 tests in 15 files**, TypeScript/Vite build and the 142-field documentation check all passed. Test duration: 85.70 seconds. The web artifact was uploaded successfully.

npm also reported **7 dependency advisories (3 moderate, 2 high, 2 critical)**. A passing correctness/build workflow does not mean a clean security audit. These advisories need package-by-package triage; production-bundle impact is not established here. Keep development/test servers local, deploy only dist through a static server, and do not treat this beta as security-certified. Dependency upgrades remain separate from this publication-only change. The detailed advisory triage remains pending.

## Проверка GitHub — 17 октября 2026

[Публичный CI](https://github.com/TimHardLite/rf-calc/actions/runs/38992354858), коммит c491350: Ubuntu 24.04, Node 24.21.0, npm 11.19.0. Успешны чистая установка, **243/243 теста в 15 файлах**, сборка TypeScript/Vite и проверка 142 полей. Тесты: 85,70 с; веб-артефакт загружен.

npm также сообщил о **7 предупреждениях безопасности зависимостей (3 moderate, 2 high, 2 critical)**. Успешные тесты не означают чистый аудит безопасности. Требуется отдельный разбор пакетов; влияние на готовую статическую сборку здесь не установлено. Серверы разработки/тестов оставляйте локальными, размещайте только dist через статический сервер. Обновление зависимостей — отдельное изменение; подробный разбор предупреждений остаётся отдельной задачей.
