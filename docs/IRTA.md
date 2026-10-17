# IRTA project format

[Home](../README.md) · [All field definitions](FIELDS.md) · [Русский](#русский)

**File format: `IRTANT/2`.** Internal application v3 and proposed public v1 are separate version numbers. The v3 fixes preserve the v2 field contract. Legacy `IRTANT/1` is read; new files use `/2`.

## Grammar and sections

UTF-8 plain text, extension `.irta`, decimal point, no thousands separators. Use exact key/enum spelling and no quotes around values. Blank lines are ignored. `#` and `;` introduce comments except in `name` and `note`, where all text after `=` belongs to the value.

| Location | Content |
|---|---|
| First line | `IRTANT/2` |
| Header | `name`, `type`, `mode`, optional `note` |
| `type` | `dipole`, `patch`, `horn`, `array`, `yagi`, `moxon`, `lpda`, `gnss` |
| Header `mode` | `analysis` or `synthesis` |
| `[params]` | All analysis fields, including currently hidden ones |
| `[elements]` | Yagi only: one `role, lengthMm, diameterMm, positionMm` row per element |
| `[synthesis]` | All design fields, including currently hidden ones |

The **header** `mode` is different from the patch **parameter** `mode = rect` or `beam`. All lengths in element rows are millimetres; types are `reflector`, `driven`, `director`; exactly one driven element is required. Put `[elements]` before `[synthesis]`. There is no scalar `elements = ...` value. The driven span includes the gap.

Both forms should be complete. Missing fields are defaulted with messages; unknown keys are reported/ignored rather than becoming new parameters. Malformed syntax is reported with a line number. Out-of-range/physically invalid input can parse but is rejected by calculation validation. Do not assume that a parsed file represents a valid antenna.

In analysis mode, `[params]` is the entered geometry. In synthesis mode, `[synthesis]` is the requirement form and `[params]` is the actual calculated/selected geometry, including an applied optimization. Do not insert unrelated defaults into `[params]` and label them synthesized dimensions. A generator without the calculation must use analysis with supplied geometry or explain that required data is missing.

Saved project data covers registered forms, selected geometry, name and note. Optimizer priority, band/offset controls, progress, transient messages and chart hover are not independent persistent project fields. Unknown custom additions are not preserved as a generic metadata store.

## Complete example

This example specifies a generic dipole for analysis, not a certified resonant or manufactured product. Both field sets are complete. Download/open [examples/dipole-300.irta](../examples/dipole-300.irta).

```ini
IRTANT/2
name = Dipole example 300 MHz
type = dipole
mode = analysis
note = Educational example; not a manufacturing specification

[params]
freqMHz = 300
lengthMm = 475
feedGapMm = 5
elementType = wire
diameterMm = 3
stripWmm = 6
material = cu
rhoCustom = 0.01724
floorDb = -40

[synthesis]
freqMHz = 300
elementType = wire
diameterMm = 3
stripWmm = 6
feedGapMm = 5
material = cu
rhoCustom = 0.01724
floorDb = -40

```

## Exact reference and maintenance

[FIELDS.md](FIELDS.md) contains **all 142 definitions**, defaults, ranges, enum identifiers and active conditions for all eight antenna families in English first, Russian second. The app's canonical generated Russian specification is [ФОРМАТ-IRTA.md](ФОРМАТ-IRTA.md), produced by `npm run irta-spec` and checked by existing tests. Do not edit generated tables manually.

The legacy v1 format had one parameter set for the selected mode; the reader migrates it. GNSS `groundPlane = yes` means the finite screen model in the current program. Yagi synthesis uses `mounting = dielectric` where analysis uses `none`; use each table's actual enum values. `boomShape` remains saved even when inactive.

For external generators: read the current field table for the chosen release; preserve hidden fields; label unknown engineering inputs explicitly; do not fabricate dimensions, performance or material data. Test serialization and reopening against the intended release.

---

# Русский

**Формат файла — `IRTANT/2`.** Внутренняя v3 и предполагаемая публичная v1 — другие номера. Исправления v3 сохранили контракт полей второй версии. `IRTANT/1` читается, новые файлы сохраняются в `/2`.

## Синтаксис

Обычный UTF-8, расширение `.irta`, десятичная точка, без разделителей тысяч и кавычек значений. Регистр ключей/enum важен. Пустые строки пропускаются. `#` и `;` — комментарии, кроме `name` и `note`, где весь остаток после `=` считается текстом.

| Часть | Содержимое |
|---|---|
| Первая строка | `IRTANT/2` |
| Заголовок | `name`, `type`, `mode`, необязательное `note` |
| type | dipole, patch, horn, array, yagi, moxon, lpda, gnss |
| mode заголовка | analysis / synthesis |
| [params] | Все поля поверочного расчёта, включая скрытые |
| [elements] | Только яги: роль, длина, диаметр, позиция в мм |
| [synthesis] | Все поля проектирования, включая скрытые |

`mode` заголовка не путать с `mode = rect/beam` внутри параметров патча. Роли элементов — reflector/driven/director; активный один. `[elements]` размещается до `[synthesis]`; скалярного `elements = ...` нет. Длина активного включает зазор.

Обе формы должны быть полными. Пропуски заменяются умолчаниями с сообщением, неизвестные ключи перечисляются и игнорируются. Синтаксические ошибки имеют номер строки. Успешный разбор не гарантирует допустимую физику: диапазоны и геометрия проверяются отдельно.

В analysis секция `[params]` хранит введённую геометрию. В synthesis `[synthesis]` хранит требования, `[params]` — фактически рассчитанные/выбранные размеры с учётом применённого подбора. Нельзя записывать туда посторонние умолчания как готовый синтез. Без выполнения расчёта генератор должен использовать известную геометрию в analysis либо явно сообщить о нехватке данных.

Файл сохраняет зарегистрированные формы, выбранную геометрию, имя и заметку. Приоритет/полоса/смещение оптимизатора, прогресс, временные сообщения и наведение графика не являются отдельными сохраняемыми параметрами проекта. Неизвестные добавления не работают как произвольное хранилище метаданных.

## Пример и полный справочник

Полный пример обеих форм диполя приведён выше и в [готовом файле](../examples/dipole-300.irta). Это учебная геометрия для анализа, а не аттестованная конструкция.

[FIELDS.md](FIELDS.md#русский) содержит все **142 определения** для восьми типов, значения, диапазоны и условия. Каноническая спецификация [ФОРМАТ-IRTA.md](ФОРМАТ-IRTA.md) генерируется `npm run irta-spec` и контролируется тестами. Таблицы вручную не правят.

В v1 один набор параметров относился к выбранному режиму; чтение учитывает это. `groundPlane = yes` у GNSS означает конечный экран. `mounting = dielectric` в синтезе яги соответствует `none` в анализе; используйте enum своей секции. `boomShape` сохраняется даже скрытым.

Внешним генераторам: читать таблицу конкретного выпуска, сохранять скрытые поля, явно обозначать неизвестные инженерные данные, не выдумывать размеры/характеристики/материалы и проверять повторное открытие файла.
