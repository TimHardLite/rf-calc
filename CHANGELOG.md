# Changelog

English · [Русский](#русский)

Entries are appended chronologically. Shared instructions live in `docs/`; a release entry links to changed guides instead of duplicating them.

## 1.0.0-beta.1 — 2026-10-17

First public beta, based on internal v3. Internal v1/v2/v3 are development generations, not previous public releases.

### Included from v3
- Consistent substrate selection in patch analysis/synthesis/optimization; corrected physical-resonance bandwidth calculations.
- Corrected sweep boundary searches and recovery of saved selected geometry.
- Optimization acceptance respects constraints, rounding, reference impedance and edge cases; no SWR optimization for models without an impedance solution.
- Stale background results and invalidated optimization candidates cannot be applied to changed inputs.
- Parser validation, preserved project notes, clearer element editor and model messages.
- Pattern metrics separated from plot-floor clipping.
- SWR threshold/band/reference-frequency labels, sample tooltips/crosshairs, keyboard navigation and PNG export; spacing above notes improved.

### Publication preparation
- English/Russian guides, complete generated field reference, IRTA guide, deployment configuration and CI workflow.
- Optional donation link and concise public company attribution.
- `IRTANT/2` retained; no file-format bump.

### Remaining release work
- Select a license for broader reuse; no open-source license is granted yet.
- Build and accept native installers on target systems.
- Validate fresh installation, native dialogs and installers; Docker/Linux/macOS acceptance remains separate.

---

# Русский

Записи добавляются в хронологическом порядке. Общие инструкции находятся в `docs/`; история ссылается на изменённые руководства без их дублирования.

## 1.0.0-beta.1 — 17.10.2026

Первый публичный бета-выпуск на основе внутренней v3. Внутренние v1/v2/v3 не означают прежние публичные релизы.

### Включено из v3
- Единый выбор подложки в расчётах патча; полоса относительно физического резонанса.
- Исправления поиска границ свипа и восстановления сохранённой геометрии.
- Ограничения оптимизатора, округление, опорный импеданс и крайние случаи; отсутствие подбора без импедансной модели.
- Защита от применения устаревших фоновых результатов после изменения входов.
- Проверки парсера, сохранение заметки, понятные элементы таблицы и предупреждения моделей.
- Физические метрики отделены от обрезки шкалы ДН.
- Подписи порога/полосы/f0, подсказки и перекрестие, управление клавишами, PNG графика КСВ; улучшенные отступы.

### Подготовка публикации
- Руководства EN/RU, полный генерируемый справочник, формат IRTA, размещение и CI.
- Добровольные донаты и краткая публичная информация об ИРТ.
- Формат остаётся `IRTANT/2`.

### Следующие этапы
- Выбрать лицензию для дальнейшего использования: открытая лицензия пока не предоставляется.
- Собрать и проверить установщики на целевых системах.
- Проверить чистую установку, native-диалоги/установщики; Docker и Linux/macOS — отдельная приёмка.
