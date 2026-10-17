# Calculation models and validation

[Home](../README.md) · [Русский](#русский)

## Implementations

| Model | Analysis | Synthesis / limitations |
|---|---|---|
| Dipole | 3D thin-wire method of moments (MoM), geometry and conductor loss; sinusoidal-current fallback outside the supported wire path | Resonant length estimate/refinement; flat strip is an equivalent wire |
| Yagi | Coupled-wire MoM, driven port, induced currents, pattern integration; empirical boom correction | DL6WU-derived starting geometry, size/diameter corrections; metallic boom is not an explicitly meshed conductor |
| Moxon | Bent-wire 3D MoM | Published polynomial starting dimensions for the available impedance choices; equivalent wire for PCB, no full substrate field solution |
| LPDA | Coupled dipole model with alternating transmission-line feed | Carrel-style geometric progression and active-region design; idealized feed network |
| Rectangular patch | Transmission-line/cavity-style resonance and impedance, effective permittivity, fringing and approximate loss/pattern treatment | Closed-form initial L/W and inset matching; finite ground/back radiation remains approximate |
| Beam-defined patch | Canonical pattern from supplied beamwidth and optional measured gain/back-lobe data | No solved feed impedance, SWR or CP axial ratio; selecting RHCP/LHCP does not validate CP purity |
| Horn | Aperture-field integration with quadratic phase/Fresnel effects where flare data is supplied | Optimal pyramidal-horn starting geometry; no detailed waveguide-feed transition model |
| Uniform array | Uniform isotropic array factor and numerical directivity | Search for count from target beamwidth/directivity; no mutual coupling or real feed loss |
| GNSS helices | 3D wire MoM; ideal infinite screen or finite wire-grid disk | King–Wong-based single-helix gain target and winding geometry; screen/coating/support/feed-network details are simplified |

The shared numerical code includes complex linear systems, Gaussian integration, segment geometry, conductor skin-effect losses, spherical/pattern integration, beamwidth extraction, SWR sweep/boundary search and matching advice. Optimizers use impedance evaluations, constrained refinement and full-pattern acceptance checks. A UTD module in the source does not mean the live GNSS screen calculation uses UTD.

For GNSS, the displayed input resistance is a Kraus empirical estimate where applicable; it is not the raw MoM port impedance. The reported axial-ratio estimate is also empirical, not a complete polarization verification.

No proprietary solver executable is shipped. Similar equations or comparison fixtures do not establish equivalence to a commercial full-wave solver.

## Interpretation rules

`G_dBi = D_dBi + 10 log10(η)`; mismatch is separate. Display-floor clipping must not define physical rear radiation. SWR uses the calculation's reference impedance. Material presets are approximate reference values: enter the actual material data at operating frequency when available. Tolerances, connectors, cables, fixtures, housings and installation environment may require a richer model or measurements.

## Evidence currently available

The inherited v3 checkpoint records 243 passing tests in 15 files, TypeScript/build checks, selected browser workflows, regression cases, reciprocity/scaling checks and a limited mesh-convergence example. Historical comparison fixtures are present. This is evidence for those cases, not a claim of zero bugs or universal electromagnetic accuracy.

Native installers, Linux/macOS native execution, Docker execution, complete native file-dialog round trips and new external-solver/measurement campaigns are still separate acceptance tasks. PNG generation was exercised earlier, but prior UI automation did not confirm every disk-download path. The draft's current check results are recorded in [VALIDATION.md](VALIDATION.md).

## Reference reading

- [NEC structure-modeling guidelines](https://www.nec2.org/part_3/cards/secii.html): segmentation and thin-wire modeling boundaries.
- [DL6WU/DG7YBN boom-correction discussion](https://www.dg7ybn.de/BC_numbers/BC.htm): empirical boom corrections and mounting dependence.
- [Carrel, 1961 LPDA design paper](https://hamwaves.com/lpda/doc/carrel.1961.pdf): LPDA design background.
- Balanis, *Antenna Theory: Analysis and Design*: standard dipole, aperture and array theory.

References explain methods; they do not certify this implementation. Exact code paths and regression tests remain the traceable description of what RF CALC currently computes.

---

# Русский

## Реализация

| Модель | Поверочный расчёт | Синтез / ограничения |
|---|---|---|
| Диполь | Трёхмерный тонкопроволочный MoM, геометрия и потери; вне поддерживаемой ветки — синусоидальная модель тока | Оценка/уточнение резонансной длины; полоса заменяется проводом |
| Яги | Связанные проводники, возбуждение активного и наведённые токи, интегрирование ДН | Начальные размеры на основе DL6WU и поправки; металлический бум не моделируется отдельной сеткой |
| Moxon | Трёхмерный MoM согнутых проводников | Полиномиальные начальные размеры; PCB заменяется проводом без полного поля подложки |
| ЛПА | Связанные диполи и перекрёстная раздаточная линия | Геометрическая прогрессия и подход Каррела; фидер идеализирован |
| Прямоугольный патч | Приближённая линия/резонатор, эффективная ε, краевые поля, потери и ДН | Формулы L/W и врезки; конечный экран и заднее излучение приближённые |
| Патч по ширине луча | Каноническая ДН по заданным данным | Не решаются импеданс, КСВ и осевое отношение CP |
| Рупор | Интегрирование раскрыва с квадратичной фазой/интегралами Френеля при заданных образующих | Начальная оптимальная пирамида; переход волновод–питание подробно не решается |
| Решётка | Множитель равномерной изотропной решётки | Число элементов по цели; без взаимного влияния и потерь реального фидера |
| GNSS | Трёхмерный проволочный MoM, идеальный экран или конечная сетка-диск | Начальные размеры по King–Wong; покрытие, опоры, точная форма экрана и фидер упрощены |

Общая математика: комплексные СЛАУ, интегрирование, сегментация, скин-эффект, интегрирование направленности, ширина луча, свип/поиск границ КСВ и советы согласования. Оптимизация сочетает быстрые оценки импеданса и полные проверки ДН с ограничениями. Наличие UTD-модуля не означает его использование в текущей ветке GNSS.

У GNSS показываемое входное сопротивление — эмпирическая оценка Крауса при применимости, а не сырой импеданс порта MoM. Оценка осевого отношения также эмпирическая и не заменяет полного расчёта поляризации.

Чужие исполняемые решатели не поставляются. Совпадение уравнений или отдельных эталонов не доказывает эквивалентность коммерческому полноволновому решателю.

## Правила интерпретации

`КУ = КНД + 10 log10(КПД)` в дБ; рассогласование отдельно. Ограничение шкалы не определяет физическое заднее излучение. КСВ зависит от опорного сопротивления. Материалы из списка — справочные приближения, при наличии используйте паспорт материала на рабочей частоте. Допуски, разъёмы, кабели, крепёж, корпус и окружение могут потребовать более полной модели и измерений.

## Проверки

Прежняя контрольная точка v3: 243 теста в 15 файлах, TypeScript/build, выбранные действия браузера, регрессии, взаимность/масштабирование и ограниченный пример сходимости. Сохранены исторические эталоны. Это не доказательство отсутствия всех ошибок и не гарантия точности любой геометрии.

Установщики, native Linux/macOS, Docker, полный цикл системных диалогов и новые внешние расчёты/измерения остаются отдельной приёмкой. Генерация PNG проверялась ранее, но не все пути загрузки файла на диск подтверждены. Текущие проверки черновика — [VALIDATION.md](VALIDATION.md).

## Источники

- [Рекомендации NEC по геометрии](https://www.nec2.org/part_3/cards/secii.html).
- [Поправки на бум DL6WU/DG7YBN](https://www.dg7ybn.de/BC_numbers/BC.htm).
- [Работа Каррела 1961 года](https://hamwaves.com/lpda/doc/carrel.1961.pdf).
- Balanis, *Antenna Theory: Analysis and Design* — теория диполей, апертур и решёток.

Источники описывают методы, а не сертифицируют реализацию. Фактически выполняемые вычисления определяются текущим кодом и регрессионными проверками.
