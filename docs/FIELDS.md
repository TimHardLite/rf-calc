# Complete field reference

[Home](../README.md) · [User guide](USER-GUIDE.md) · [Русский](#русский)

Generated from the live registry. Exact enum values are shown literally, including Cyrillic values. UI labels remain Russian. Fields hidden by a selection are still serialized. Numeric limits describe validation, not guaranteed physical accuracy.

## Dipole — dipole

### [params]

| Key | English / UI label | Unit | Default | Allowed / enum | Active when | Meaning |
|---|---|---|---|---|---|---|
| `freqMHz` | Frequency / Частота | MHz | 307 | 1 … 40000 | always | Operating frequency; determines free-space wavelength. |
| `lengthMm` | Length L / Полная длина вибратора | mm | 460 | 1 … 100000 | always | Dipole: full tip-to-tip span including gap. Patch: copper metallization length, not PCB length. |
| `feedGapMm` | Feed gap / Зазор (разрез) в точке питания | mm | 0 | 0 … 500 | always | Distance between arm ends; each dipole/driven arm is (full length minus gap)/2. Zero represents unspecified gap. |
| `elementType` | Conductor construction / Тип проводника |  | flat | `flat`, `wire` | always | wire: round conductor. flat: flat strip, or pcb where offered: PCB track. Equivalent-wire approximations do not solve the entire PCB dielectric. |
| `diameterMm` | Conductor diameter / Диаметр проводника | mm | 2 | 0.1 … 500 | elementType = wire | Physical outer diameter of the round conductor; use the appropriate construction option. |
| `stripWmm` | Strip width / Ширина дорожки | mm | 6 | 0.1 … 500 | elementType = flat | Copper strip/track width; represented by an equivalent round conductor. For Moxon, geometry follows track centrelines. |
| `material` | Conductor material / Материал проводника |  | pec | `pec`, `cu`, `al`, `brass`, `steel`, `custom` | always | pec: perfect conductor; cu: copper; al: aluminium; brass; steel; custom. Loss uses the selected resistivity. |
| `rhoCustom` | Custom resistivity / Удельное сопротивление ρ | ohm mm²/m | 0.05 | 0.001 … 10 | material = custom | Resistivity at the intended temperature; used only for custom material. Units ohm mm²/m equal micro-ohm m. |
| `floorDb` | Plot floor / Нижний предел шкалы | dB | -40 | -80 … -10 | always | Lower radial display limit in dB; does not define a physical radiation cutoff. |

### [synthesis]

| Key | English / UI label | Unit | Default | Allowed / enum | Active when | Meaning |
|---|---|---|---|---|---|---|
| `freqMHz` | Frequency / Частота | MHz | 307 | 1 … 40000 | always | Operating frequency; determines free-space wavelength. |
| `elementType` | Conductor construction / Тип проводника |  | flat | `flat`, `wire` | always | wire: round conductor. flat: flat strip, or pcb where offered: PCB track. Equivalent-wire approximations do not solve the entire PCB dielectric. |
| `diameterMm` | Conductor diameter / Диаметр проводника | mm | 2 | 0.1 … 500 | elementType = wire | Physical outer diameter of the round conductor; use the appropriate construction option. |
| `stripWmm` | Strip width / Ширина дорожки | mm | 6 | 0.1 … 500 | elementType = flat | Copper strip/track width; represented by an equivalent round conductor. For Moxon, geometry follows track centrelines. |
| `feedGapMm` | Feed gap / Зазор (разрез) в точке питания | mm | 0 | 0 … 500 | always | Distance between arm ends; each dipole/driven arm is (full length minus gap)/2. Zero represents unspecified gap. |
| `material` | Conductor material / Материал проводника |  | pec | `pec`, `cu`, `al`, `brass`, `steel`, `custom` | always | pec: perfect conductor; cu: copper; al: aluminium; brass; steel; custom. Loss uses the selected resistivity. |
| `rhoCustom` | Custom resistivity / Удельное сопротивление ρ | ohm mm²/m | 0.05 | 0.001 … 10 | material = custom | Resistivity at the intended temperature; used only for custom material. Units ohm mm²/m equal micro-ohm m. |
| `floorDb` | Plot floor / Нижний предел шкалы | dB | -40 | -80 … -10 | always | Lower radial display limit in dB; does not define a physical radiation cutoff. |

## Patch — patch

### [params]

| Key | English / UI label | Unit | Default | Allowed / enum | Active when | Meaning |
|---|---|---|---|---|---|---|
| `mode` | Patch calculation mode / Режим расчёта |  | rect | `rect`, `beam` | always | rect: rectangular patch model. beam: canonical pattern using supplied beamwidth; no solved input impedance. |
| `polarization` | Polarization / Поляризация |  | Линейная | `Линейная`, `RHCP`, `LHCP` | always | Линейная means linear; RHCP/LHCP specify handedness labels. A label alone does not solve CP geometry or axial ratio. |
| `freqMHz` | Frequency / Частота | MHz | 5800 | 1 … 40000 | always | Operating frequency; determines free-space wavelength. |
| `lengthMm` | Length L / Длина металлизации L | mm | 18 | 1 … 5000 | mode = rect | Dipole: full tip-to-tip span including gap. Patch: copper metallization length, not PCB length. |
| `widthMm` | Copper width W / Ширина металлизации W | mm | 20 | 1 … 5000 | mode = rect | Width of patch copper metallization, not the board outline. |
| `substrateH` | Substrate thickness h / Толщина подложки h | mm | 1.5 | 0.1 … 200 | mode = rect | Separation between patch and ground; use the actual dielectric thickness. |
| `substrate` | Substrate preset / Материал подложки |  | custom | `custom`, `fr4`, `rt5880`, `rt5870`, `ro3003`, `ro4003`, `ro4350`, `ptfe`, `polyimide`, `al2o3` | mode = rect | custom uses entered epsR/tanD; named presets substitute both. Verify actual laminate data at operating frequency. |
| `epsR` | Relative permittivity / εr подложки |  | 2.2 | 1 … 20 | mode = rect and substrate = custom | Relative dielectric permittivity, used for a custom substrate; hidden values are still saved. |
| `tanD` | Dielectric loss tangent / tanδ подложки |  | 0 | 0 … 0.2 | mode = rect and substrate = custom | Loss tangent for a custom substrate. Zero excludes dielectric loss, not all other losses. |
| `groundLmm` | Ground length / Экран вдоль L | mm | 40 | 1 … 20000 | mode = rect | Ground-plane extent along patch L; finite-ground pattern effects are approximate. |
| `groundWmm` | Ground width / Экран вдоль W | mm | 42 | 1 … 20000 | mode = rect | Ground-plane extent along patch W; not the copper patch width. |
| `feedInsetMm` | Feed inset / Глубина врезки питания x₀ | mm | 0 | 0 … 5000 | mode = rect | Feed distance inward from the patch edge; zero is edge feeding. Affects the impedance model. |
| `hpbwDeg` | Half-power beamwidth / Ширина луча −3 дБ | deg | 90 | 5 … 175 | mode = beam | Known/measured main-lobe width at −3 dB for the beam-defined pattern. |
| `gainDbi` | Known gain / Усиление (если известно) | dBi | 0 | 0 … 30 | mode = beam | Known/measured gain for the beam-defined pattern; zero means unspecified, not a measurement of 0 dBi. |
| `backLobeDb` | Known back-lobe level / Заднее излучение (если замерено) | dB | 0 | -40 … 0 | mode = beam | Measured relative back-lobe level for beam mode; zero means unavailable, so no invented rear lobe. |
| `floorDb` | Plot floor / Нижний предел шкалы | dB | -40 | -80 … -10 | always | Lower radial display limit in dB; does not define a physical radiation cutoff. |

### [synthesis]

| Key | English / UI label | Unit | Default | Allowed / enum | Active when | Meaning |
|---|---|---|---|---|---|---|
| `freqMHz` | Frequency / Частота | MHz | 5800 | 1 … 40000 | always | Operating frequency; determines free-space wavelength. |
| `substrate` | Substrate preset / Материал подложки |  | custom | `custom`, `fr4`, `rt5880`, `rt5870`, `ro3003`, `ro4003`, `ro4350`, `ptfe`, `polyimide`, `al2o3` | always | custom uses entered epsR/tanD; named presets substitute both. Verify actual laminate data at operating frequency. |
| `epsR` | Relative permittivity / εr подложки |  | 2.2 | 1 … 20 | substrate = custom | Relative dielectric permittivity, used for a custom substrate; hidden values are still saved. |
| `substrateH` | Substrate thickness h / Толщина подложки h | mm | 1.5 | 0.05 … 200 | always | Separation between patch and ground; use the actual dielectric thickness. |
| `targetZ` | Target impedance / Согласовать на | ohm | 50 | 10 … 300 | always | Synthesis target; patch inset/feed calculation or the available Moxon design family. Does not redefine all displayed SWR references. |
| `polarization` | Polarization / Поляризация |  | Линейная | `Линейная`, `RHCP`, `LHCP` | always | Линейная means linear; RHCP/LHCP specify handedness labels. A label alone does not solve CP geometry or axial ratio. |
| `tanD` | Dielectric loss tangent / tanδ подложки |  | 0 | 0 … 0.2 | substrate = custom | Loss tangent for a custom substrate. Zero excludes dielectric loss, not all other losses. |
| `floorDb` | Plot floor / Нижний предел шкалы | dB | -40 | -80 … -10 | always | Lower radial display limit in dB; does not define a physical radiation cutoff. |

## Horn — horn

### [params]

| Key | English / UI label | Unit | Default | Allowed / enum | Active when | Meaning |
|---|---|---|---|---|---|---|
| `freqMHz` | Frequency / Частота | MHz | 10000 | 1 … 40000 | always | Operating frequency; determines free-space wavelength. |
| `apertureA` | H-plane aperture a / Раскрыв a (H-плоскость) | mm | 60 | 1 … 20000 | always | Horn aperture dimension along the broad wall / H plane. |
| `apertureB` | E-plane aperture b / Раскрыв b (E-плоскость) | mm | 45 | 1 … 20000 | always | Horn aperture dimension along the narrow wall / E plane. |
| `flareE` | E-plane slant length / Образующая E-клина ρe | mm | 0 | 0 … 100000 | always | E-plane flare length used for aperture phase error; supply both E/H values. Zero omits that phase information. |
| `flareH` | H-plane slant length / Образующая H-клина ρh | mm | 0 | 0 … 100000 | always | H-plane flare length; used together with the E-plane value. |
| `floorDb` | Plot floor / Нижний предел шкалы | dB | -40 | -80 … -10 | always | Lower radial display limit in dB; does not define a physical radiation cutoff. |

### [synthesis]

| Key | English / UI label | Unit | Default | Allowed / enum | Active when | Meaning |
|---|---|---|---|---|---|---|
| `freqMHz` | Frequency / Частота | MHz | 10000 | 1 … 40000 | always | Operating frequency; determines free-space wavelength. |
| `targetGainDbi` | Target gain/directivity / Требуемое усиление | dBi | 18 | 6 … 30 | always | Horn: gain target. Uniform array: isotropic-array directivity target. GNSS: target for a single helix, not the whole assembly. |
| `floorDb` | Plot floor / Нижний предел шкалы | dB | -40 | -80 … -10 | always | Lower radial display limit in dB; does not define a physical radiation cutoff. |

## Uniform linear array — array

### [params]

| Key | English / UI label | Unit | Default | Allowed / enum | Active when | Meaning |
|---|---|---|---|---|---|---|
| `freqMHz` | Frequency / Частота | MHz | 1000 | 1 … 40000 | always | Operating frequency; determines free-space wavelength. |
| `count` | Element count N / Число элементов N | count | 4 | 1 … 64 | always | Number of driven isotropic array elements or LPDA dipoles, depending on the selected family. |
| `spacingMm` | Element spacing d / Шаг d | mm | 150 | 1 … 100000 | always | Centre-to-centre separation of adjacent uniform-array elements. |
| `phaseDeg` | Progressive phase / Фазовый сдвиг β | deg | 0 | -360 … 360 | always | Phase change between adjacent elements; zero gives broadside excitation in this array model. |
| `floorDb` | Plot floor / Нижний предел шкалы | dB | -40 | -80 … -10 | always | Lower radial display limit in dB; does not define a physical radiation cutoff. |

### [synthesis]

| Key | English / UI label | Unit | Default | Allowed / enum | Active when | Meaning |
|---|---|---|---|---|---|---|
| `freqMHz` | Frequency / Частота | MHz | 1000 | 1 … 40000 | always | Operating frequency; determines free-space wavelength. |
| `goal` | Array design target / Проектировать по |  | gain | `gain`, `beam` | always | gain chooses directivity; beam chooses half-power beamwidth as the count-selection target. |
| `targetGainDbi` | Target gain/directivity / Требуемый КНД | dBi | 12 | 3 … 30 | goal = gain | Horn: gain target. Uniform array: isotropic-array directivity target. GNSS: target for a single helix, not the whole assembly. |
| `targetHpbwDeg` | Target beamwidth / Требуемая ширина луча | deg | 12 | 1 … 90 | goal = beam | Required main-lobe half-power width for array synthesis. |
| `spacingRel` | Spacing / wavelength / Шаг решётки | λ | 0.5 | 0.1 … 1.5 | always | Uniform-array spacing expressed as a fraction of free-space wavelength. |
| `phaseDeg` | Progressive phase / Фазовый сдвиг β | deg | 0 | -360 … 360 | always | Phase change between adjacent elements; zero gives broadside excitation in this array model. |
| `floorDb` | Plot floor / Нижний предел шкалы | dB | -40 | -80 … -10 | always | Lower radial display limit in dB; does not define a physical radiation cutoff. |

## Yagi-Uda — yagi

### [params]

| Key | English / UI label | Unit | Default | Allowed / enum | Active when | Meaning |
|---|---|---|---|---|---|---|
| `freqMHz` | Frequency / Частота | MHz | 180 | 1 … 40000 | always | Operating frequency; determines free-space wavelength. |
| `elements` | Yagi element table / Элементы |  | [elements] | role, length, diameter, position (mm) | always | Rows: role, full length, diameter, axial position in mm. Exactly one driven element; stored in [elements], not a scalar key. |
| `feedGapMm` | Feed gap / Зазор активного элемента | mm | 0 | 0 … 500 | always | Distance between arm ends; each dipole/driven arm is (full length minus gap)/2. Zero represents unspecified gap. |
| `mounting` | Boom mounting / Крепление к буму |  | none | `none`, `through-contact`, `through-insulated`, `ontop-contact` | always | none/dielectric: no metallic correction; through-contact: through boom with contact; through-insulated: insulated passage; ontop-contact: on top with contact. |
| `boomDiaMm` | Boom diameter/side / Диаметр (сторона) бума | mm | 20 | 0 … 1000 | mounting ≠ none | Outer diameter of round boom or side of square boom for the empirical correction. |
| `boomShape` | Boom shape / Форма бума |  | square | `square`, `round` | mounting = ontop-contact | round or square. Relevant to on-top contact correction; always saved even when hidden. |
| `material` | Conductor material / Материал проводника |  | pec | `pec`, `cu`, `al`, `brass`, `steel`, `custom` | always | pec: perfect conductor; cu: copper; al: aluminium; brass; steel; custom. Loss uses the selected resistivity. |
| `rhoCustom` | Custom resistivity / Удельное сопротивление ρ | ohm mm²/m | 0.05 | 0.001 … 10 | material = custom | Resistivity at the intended temperature; used only for custom material. Units ohm mm²/m equal micro-ohm m. |
| `floorDb` | Plot floor / Нижний предел шкалы | dB | -40 | -80 … -10 | always | Lower radial display limit in dB; does not define a physical radiation cutoff. |

### [synthesis]

| Key | English / UI label | Unit | Default | Allowed / enum | Active when | Meaning |
|---|---|---|---|---|---|---|
| `freqMHz` | Frequency / Частота | MHz | 180 | 1 … 40000 | always | Operating frequency; determines free-space wavelength. |
| `elementCount` | Total Yagi elements / Число элементов | count | 7 | 3 … 32 | always | Total reflector + driven element + directors; DL6WU is intended for longer arrays. |
| `elementDiaMm` | Yagi conductor diameter / Диаметр элемента | mm | 6 | 0.5 … 500 | always | Conductor diameter used by synthesis and its diameter correction. |
| `feedGapMm` | Feed gap / Зазор активного элемента | mm | 0 | 0 … 500 | always | Distance between arm ends; each dipole/driven arm is (full length minus gap)/2. Zero represents unspecified gap. |
| `boomDiaMm` | Boom diameter/side / Диаметр (сторона) бума | mm | 20 | 0 … 1000 | always | Outer diameter of round boom or side of square boom for the empirical correction. |
| `boomShape` | Boom shape / Форма бума |  | square | `square`, `round` | always | round or square. Relevant to on-top contact correction; always saved even when hidden. |
| `mounting` | Boom mounting / Крепление элементов |  | through-contact | `through-contact`, `through-insulated`, `ontop-contact`, `dielectric` | always | none/dielectric: no metallic correction; through-contact: through boom with contact; through-insulated: insulated passage; ontop-contact: on top with contact. |
| `material` | Conductor material / Материал проводника |  | pec | `pec`, `cu`, `al`, `brass`, `steel`, `custom` | always | pec: perfect conductor; cu: copper; al: aluminium; brass; steel; custom. Loss uses the selected resistivity. |
| `rhoCustom` | Custom resistivity / Удельное сопротивление ρ | ohm mm²/m | 0.05 | 0.001 … 10 | material = custom | Resistivity at the intended temperature; used only for custom material. Units ohm mm²/m equal micro-ohm m. |
| `floorDb` | Plot floor / Нижний предел шкалы | dB | -40 | -80 … -10 | always | Lower radial display limit in dB; does not define a physical radiation cutoff. |

## Moxon — moxon

### [params]

| Key | English / UI label | Unit | Default | Allowed / enum | Active when | Meaning |
|---|---|---|---|---|---|---|
| `freqMHz` | Frequency / Частота | MHz | 915 | 1 … 40000 | always | Operating frequency; determines free-space wavelength. |
| `widthA` | Moxon width A / Ширина A | mm | 116.9 | 1 … 20000 | always | Full main-side span of the Moxon rectangle; track centreline dimensions for PCB. |
| `tailB` | Driven tail B / Загиб активного B | mm | 14 | 0.1 … 5000 | always | Length of a bent driven-element end toward the reflector. |
| `gapC` | End gap C / Зазор C | mm | 6.9 | 0.1 … 5000 | always | Separation between the driven and reflector ends. |
| `tailD` | Reflector tail D / Загиб рефлектора D | mm | 22.8 | 0.1 … 5000 | always | Length of the reflector end bent toward the driven element. |
| `elementType` | Conductor construction / Исполнение |  | wire | `wire`, `flat` | always | wire: round conductor. flat: flat strip, or pcb where offered: PCB track. Equivalent-wire approximations do not solve the entire PCB dielectric. |
| `diameterMm` | Conductor diameter / Диаметр провода | mm | 2 | 0.1 … 500 | elementType = wire | Physical outer diameter of the round conductor; use the appropriate construction option. |
| `stripWmm` | Strip width / Ширина дорожки | mm | 4 | 0.05 … 500 | elementType = flat | Copper strip/track width; represented by an equivalent round conductor. For Moxon, geometry follows track centrelines. |
| `material` | Conductor material / Материал проводника |  | pec | `pec`, `cu`, `al`, `brass`, `steel`, `custom` | always | pec: perfect conductor; cu: copper; al: aluminium; brass; steel; custom. Loss uses the selected resistivity. |
| `rhoCustom` | Custom resistivity / Удельное сопротивление ρ | ohm mm²/m | 0.05 | 0.001 … 10 | material = custom | Resistivity at the intended temperature; used only for custom material. Units ohm mm²/m equal micro-ohm m. |
| `floorDb` | Plot floor / Нижний предел шкалы | dB | -40 | -80 … -10 | always | Lower radial display limit in dB; does not define a physical radiation cutoff. |

### [synthesis]

| Key | English / UI label | Unit | Default | Allowed / enum | Active when | Meaning |
|---|---|---|---|---|---|---|
| `freqMHz` | Frequency / Частота | MHz | 915 | 1 … 40000 | always | Operating frequency; determines free-space wavelength. |
| `elementType` | Conductor construction / Исполнение |  | wire | `wire`, `flat` | always | wire: round conductor. flat: flat strip, or pcb where offered: PCB track. Equivalent-wire approximations do not solve the entire PCB dielectric. |
| `diameterMm` | Conductor diameter / Диаметр провода | mm | 2 | 0.05 … 500 | elementType = wire | Physical outer diameter of the round conductor; use the appropriate construction option. |
| `stripWmm` | Strip width / Ширина дорожки | mm | 4 | 0.05 … 500 | elementType = flat | Copper strip/track width; represented by an equivalent round conductor. For Moxon, geometry follows track centrelines. |
| `targetZ` | Target impedance / Согласовать на | ohm | 50 | `50`, `93` | always | Synthesis target; patch inset/feed calculation or the available Moxon design family. Does not redefine all displayed SWR references. |
| `material` | Conductor material / Материал проводника |  | pec | `pec`, `cu`, `al`, `brass`, `steel`, `custom` | always | pec: perfect conductor; cu: copper; al: aluminium; brass; steel; custom. Loss uses the selected resistivity. |
| `rhoCustom` | Custom resistivity / Удельное сопротивление ρ | ohm mm²/m | 0.05 | 0.001 … 10 | material = custom | Resistivity at the intended temperature; used only for custom material. Units ohm mm²/m equal micro-ohm m. |
| `floorDb` | Plot floor / Нижний предел шкалы | dB | -40 | -80 … -10 | always | Lower radial display limit in dB; does not define a physical radiation cutoff. |

## LPDA — lpda

### [params]

| Key | English / UI label | Unit | Default | Allowed / enum | Active when | Meaning |
|---|---|---|---|---|---|---|
| `freqMHz` | Frequency / Частота | MHz | 300 | 1 … 40000 | always | Operating frequency; determines free-space wavelength. |
| `count` | Element count N / Число элементов N | count | 6 | 2 … 30 | always | Number of driven isotropic array elements or LPDA dipoles, depending on the selected family. |
| `tau` | Scale factor tau / Масштаб τ |  | 0.87 | 0.5 … 0.98 | always | Ratio of successive LPDA lengths. Larger values generally require more elements for a given band. |
| `sigma` | Relative spacing sigma / Интервал σ |  | 0.055 | 0.01 … 0.25 | always | LPDA relative spacing convention: adjacent distance is 2 × sigma × full element length. |
| `longestMm` | Longest dipole length / Длина самого длинного | mm | 600 | 1 … 50000 | always | Full rear/longest LPDA element length; others follow the geometric progression. |
| `diameterMm` | Conductor diameter / Диаметр элементов | mm | 10 | 0.1 … 500 | always | Physical outer diameter of the round conductor; use the appropriate construction option. |
| `feederZ0` | Distribution-line impedance / Импеданс фидера Z₀ | ohm | 100 | 10 … 600 | always | Characteristic impedance of the crossed feed line; not automatically the external cable reference. |
| `material` | Conductor material / Материал проводника |  | pec | `pec`, `cu`, `al`, `brass`, `steel`, `custom` | always | pec: perfect conductor; cu: copper; al: aluminium; brass; steel; custom. Loss uses the selected resistivity. |
| `rhoCustom` | Custom resistivity / Удельное сопротивление ρ | ohm mm²/m | 0.05 | 0.001 … 10 | material = custom | Resistivity at the intended temperature; used only for custom material. Units ohm mm²/m equal micro-ohm m. |
| `floorDb` | Plot floor / Нижний предел шкалы | dB | -40 | -80 … -10 | always | Lower radial display limit in dB; does not define a physical radiation cutoff. |

### [synthesis]

| Key | English / UI label | Unit | Default | Allowed / enum | Active when | Meaning |
|---|---|---|---|---|---|---|
| `freqLowMHz` | Lower band edge / Нижняя частота | MHz | 200 | 1 … 40000 | always | Low design frequency, controlling the longest LPDA dipole. |
| `freqHighMHz` | Upper band edge / Верхняя частота | MHz | 600 | 1 … 40000 | always | High design frequency, controlling the shortest required LPDA dipole. |
| `tau` | Scale factor tau / Масштаб τ |  | 0.88 | 0.6 … 0.97 | always | Ratio of successive LPDA lengths. Larger values generally require more elements for a given band. |
| `diameterMm` | Conductor diameter / Диаметр элементов | mm | 10 | 0.1 … 500 | always | Physical outer diameter of the round conductor; use the appropriate construction option. |
| `feederZ0` | Distribution-line impedance / Импеданс фидера Z₀ | ohm | 100 | 10 … 600 | always | Characteristic impedance of the crossed feed line; not automatically the external cable reference. |
| `material` | Conductor material / Материал проводника |  | pec | `pec`, `cu`, `al`, `brass`, `steel`, `custom` | always | pec: perfect conductor; cu: copper; al: aluminium; brass; steel; custom. Loss uses the selected resistivity. |
| `rhoCustom` | Custom resistivity / Удельное сопротивление ρ | ohm mm²/m | 0.05 | 0.001 … 10 | material = custom | Resistivity at the intended temperature; used only for custom material. Units ohm mm²/m equal micro-ohm m. |
| `floorDb` | Plot floor / Нижний предел шкалы | dB | -40 | -80 … -10 | always | Lower radial display limit in dB; does not define a physical radiation cutoff. |

## GNSS helix assembly — gnss

### [params]

| Key | English / UI label | Unit | Default | Allowed / enum | Active when | Meaning |
|---|---|---|---|---|---|---|
| `freqMHz` | Frequency / Частота | MHz | 1575 | 1 … 40000 | always | Operating frequency; determines free-space wavelength. |
| `helixCount` | Helix count / Число спиралей | count | 3 | 1 … 6 | always | Number of identical helices in the modeled assembly. |
| `helixDiaMm` | Winding diameter / Диаметр спирали | mm | 60 | 1 … 5000 | always | Helix winding diameter; circumference is pi times this value. |
| `turns` | Turns / Число витков | count | 2 | 0.5 … 40 | always | Actual number of winding turns; enter construction data rather than guessing. |
| `heightMm` | Winding height / Высота намотки | mm | 40 | 1 … 20000 | always | Axial winding height, defining pitch together with turns. |
| `arrangeRadiusMm` | Placement radius / Радиус расстановки | mm | 70 | 0 … 5000 | always | Radius of the circle through helix axes; geometry must avoid intersecting helices. |
| `conductor` | Winding conductor / Проводник намотки |  | tape | `tape`, `wire` | always | tape: copper strip approximated by wire radius width/4; wire: round conductor radius diameter/2. |
| `tapeWidthMm` | Tape width / Ширина медного скотча | mm | 8 | 0.5 … 500 | conductor = tape | Physical conductor strip width for tape winding. |
| `wireDiaMm` | Winding wire diameter / Диаметр провода намотки | mm | 1.5 | 0.05 … 100 | conductor = wire | Bare conductive wire diameter, excluding insulation. |
| `sense` | Winding handedness / Направление намотки |  | RH | `RH`, `LH` | always | RH or LH; handedness selection does not by itself prove received-signal axial ratio. |
| `groundPlane` | Helix screen / Экран под спиралью |  | yes | `yes`, `inf`, `no` | always | yes: finite flat disk; inf: ideal infinite plane; no: no screen. These have different physical assumptions. |
| `screenDiaMm` | Finite screen diameter / Диаметр экрана | mm | 285.3 | 20 … 2000 | groundPlane = yes | Diameter of the finite flat disk approximation; does not reproduce a shaped/coated enclosure. |
| `standoffMm` | Base height above screen / Высота основания над экраном | mm | 3 | 0 … 1000 | groundPlane ≠ no | Height of winding base above screen. The solver may increase too-small values and report that adjustment. |
| `material` | Conductor material / Материал проводника |  | cu | `pec`, `cu`, `al`, `brass`, `steel`, `custom` | always | pec: perfect conductor; cu: copper; al: aluminium; brass; steel; custom. Loss uses the selected resistivity. |
| `rhoCustom` | Custom resistivity / Удельное сопротивление ρ | ohm mm²/m | 0.05 | 0.001 … 10 | material = custom | Resistivity at the intended temperature; used only for custom material. Units ohm mm²/m equal micro-ohm m. |
| `floorDb` | Plot floor / Нижний предел шкалы | dB | -40 | -80 … -10 | always | Lower radial display limit in dB; does not define a physical radiation cutoff. |

### [synthesis]

| Key | English / UI label | Unit | Default | Allowed / enum | Active when | Meaning |
|---|---|---|---|---|---|---|
| `freqMHz` | Frequency / Частота | MHz | 1575 | 1 … 40000 | always | Operating frequency; determines free-space wavelength. |
| `helixCount` | Helix count / Число спиралей | count | 3 | 1 … 6 | always | Number of identical helices in the modeled assembly. |
| `targetGainDbi` | Target gain/directivity / Требуемое усиление спирали | dBi | 9 | 5 … 20 | always | Horn: gain target. Uniform array: isotropic-array directivity target. GNSS: target for a single helix, not the whole assembly. |
| `pitchRel` | Pitch / wavelength / Шаг намотки | λ | 0.22 | 0.1 … 0.4 | always | Axial pitch of one turn as a fraction of wavelength for synthesis. |
| `conductor` | Winding conductor / Проводник намотки |  | tape | `tape`, `wire` | always | tape: copper strip approximated by wire radius width/4; wire: round conductor radius diameter/2. |
| `material` | Conductor material / Материал проводника |  | cu | `pec`, `cu`, `al`, `brass`, `steel`, `custom` | always | pec: perfect conductor; cu: copper; al: aluminium; brass; steel; custom. Loss uses the selected resistivity. |
| `rhoCustom` | Custom resistivity / Удельное сопротивление ρ | ohm mm²/m | 0.05 | 0.001 … 10 | material = custom | Resistivity at the intended temperature; used only for custom material. Units ohm mm²/m equal micro-ohm m. |
| `floorDb` | Plot floor / Нижний предел шкалы | dB | -40 | -80 … -10 | always | Lower radial display limit in dB; does not define a physical radiation cutoff. |

---

# Русский

Справочник генерируется из реестра. Значения enum приведены буквально. Скрытые поля сохраняются. Числовые границы — пределы ввода, а не гарантия точности модели.

## Диполь — dipole

### [params]

| Ключ | Поле | Ед. | Умолчание | Допустимо / enum | Используется при | Значение |
|---|---|---|---|---|---|---|
| `freqMHz` | Частота | МГц | 307 | 1 … 40000 | всегда | Рабочая частота; определяет длину волны в свободном пространстве. |
| `lengthMm` | Полная длина вибратора | мм | 460 | 1 … 100000 | всегда | У диполя — полный размах с зазором. У патча — длина меди, не платы. |
| `feedGapMm` | Зазор (разрез) в точке питания | мм | 0 | 0 … 500 | всегда | Расстояние между торцами плеч; плечо = (полная длина − зазор)/2. Ноль означает незаданный зазор. |
| `elementType` | Тип проводника |  | flat | `flat`, `wire` | всегда | wire — круглый провод; flat — полоса; pcb, где доступно, — дорожка. Эквивалентный провод не решает всю диэлектрическую плату. |
| `diameterMm` | Диаметр проводника | мм | 2 | 0.1 … 500 | elementType = wire | Наружный диаметр круглого проводника при соответствующем исполнении. |
| `stripWmm` | Ширина дорожки | мм | 6 | 0.1 … 500 | elementType = flat | Ширина медной полосы/дорожки для эквивалентного провода. У Moxon размеры задаются по осям дорожек. |
| `material` | Материал проводника |  | pec | `pec`, `cu`, `al`, `brass`, `steel`, `custom` | всегда | pec — идеальный проводник; cu — медь; al — алюминий; brass — латунь; steel — сталь; custom — своё сопротивление. |
| `rhoCustom` | Удельное сопротивление ρ | Ом·мм²/м | 0.05 | 0.001 … 10 | material = custom | Удельное сопротивление при рабочей температуре, только для custom. Ом·мм²/м равны мкОм·м. |
| `floorDb` | Нижний предел шкалы | дБ | -40 | -80 … -10 | всегда | Нижний предел отображения ДН, а не физическая граница излучения. |

### [synthesis]

| Ключ | Поле | Ед. | Умолчание | Допустимо / enum | Используется при | Значение |
|---|---|---|---|---|---|---|
| `freqMHz` | Частота | МГц | 307 | 1 … 40000 | всегда | Рабочая частота; определяет длину волны в свободном пространстве. |
| `elementType` | Тип проводника |  | flat | `flat`, `wire` | всегда | wire — круглый провод; flat — полоса; pcb, где доступно, — дорожка. Эквивалентный провод не решает всю диэлектрическую плату. |
| `diameterMm` | Диаметр проводника | мм | 2 | 0.1 … 500 | elementType = wire | Наружный диаметр круглого проводника при соответствующем исполнении. |
| `stripWmm` | Ширина дорожки | мм | 6 | 0.1 … 500 | elementType = flat | Ширина медной полосы/дорожки для эквивалентного провода. У Moxon размеры задаются по осям дорожек. |
| `feedGapMm` | Зазор (разрез) в точке питания | мм | 0 | 0 … 500 | всегда | Расстояние между торцами плеч; плечо = (полная длина − зазор)/2. Ноль означает незаданный зазор. |
| `material` | Материал проводника |  | pec | `pec`, `cu`, `al`, `brass`, `steel`, `custom` | всегда | pec — идеальный проводник; cu — медь; al — алюминий; brass — латунь; steel — сталь; custom — своё сопротивление. |
| `rhoCustom` | Удельное сопротивление ρ | Ом·мм²/м | 0.05 | 0.001 … 10 | material = custom | Удельное сопротивление при рабочей температуре, только для custom. Ом·мм²/м равны мкОм·м. |
| `floorDb` | Нижний предел шкалы | дБ | -40 | -80 … -10 | всегда | Нижний предел отображения ДН, а не физическая граница излучения. |

## Патч — patch

### [params]

| Ключ | Поле | Ед. | Умолчание | Допустимо / enum | Используется при | Значение |
|---|---|---|---|---|---|---|
| `mode` | Режим расчёта |  | rect | `rect`, `beam` | всегда | rect — прямоугольный патч; beam — каноническая ДН по заданной ширине без расчёта импеданса. |
| `polarization` | Поляризация |  | Линейная | `Линейная`, `RHCP`, `LHCP` | всегда | Линейная / RHCP / LHCP. Выбор названия не рассчитывает CP-геометрию и осевое отношение. |
| `freqMHz` | Частота | МГц | 5800 | 1 … 40000 | всегда | Рабочая частота; определяет длину волны в свободном пространстве. |
| `lengthMm` | Длина металлизации L | мм | 18 | 1 … 5000 | mode = rect | У диполя — полный размах с зазором. У патча — длина меди, не платы. |
| `widthMm` | Ширина металлизации W | мм | 20 | 1 … 5000 | mode = rect | Ширина медной металлизации патча, а не габарит платы. |
| `substrateH` | Толщина подложки h | мм | 1.5 | 0.1 … 200 | mode = rect | Расстояние между патчем и экраном; фактическая толщина диэлектрика. |
| `substrate` | Материал подложки |  | custom | `custom`, `fr4`, `rt5880`, `rt5870`, `ro3003`, `ro4003`, `ro4350`, `ptfe`, `polyimide`, `al2o3` | mode = rect | custom использует epsR/tanD; именованные материалы подставляют оба значения. Уточняйте паспорт на рабочей частоте. |
| `epsR` | εr подложки |  | 2.2 | 1 … 20 | mode = rect и substrate = custom | Относительная проницаемость своей подложки; скрытые значения сохраняются. |
| `tanD` | tanδ подложки |  | 0 | 0 … 0.2 | mode = rect и substrate = custom | Тангенс потерь своей подложки. Ноль исключает диэлектрические, но не все прочие потери. |
| `groundLmm` | Экран вдоль L | мм | 40 | 1 … 20000 | mode = rect | Размер экрана вдоль L; эффекты конечного экрана приближённые. |
| `groundWmm` | Экран вдоль W | мм | 42 | 1 … 20000 | mode = rect | Размер экрана вдоль W, не ширина медного патча. |
| `feedInsetMm` | Глубина врезки питания x₀ | мм | 0 | 0 … 5000 | mode = rect | Углубление питания от края патча; ноль — питание с края. Влияет на импеданс. |
| `hpbwDeg` | Ширина луча −3 дБ | град | 90 | 5 … 175 | mode = beam | Известная/измеренная ширина главного лепестка −3 дБ для режима по ширине луча. |
| `gainDbi` | Усиление (если известно) | дБи | 0 | 0 … 30 | mode = beam | Известное усиление для режима по лучу; ноль означает отсутствие данных, а не измеренные 0 дБи. |
| `backLobeDb` | Заднее излучение (если замерено) | дБ | 0 | -40 … 0 | mode = beam | Измеренный относительный задний лепесток; ноль — нет данных, задний лепесток не выдумывается. |
| `floorDb` | Нижний предел шкалы | дБ | -40 | -80 … -10 | всегда | Нижний предел отображения ДН, а не физическая граница излучения. |

### [synthesis]

| Ключ | Поле | Ед. | Умолчание | Допустимо / enum | Используется при | Значение |
|---|---|---|---|---|---|---|
| `freqMHz` | Частота | МГц | 5800 | 1 … 40000 | всегда | Рабочая частота; определяет длину волны в свободном пространстве. |
| `substrate` | Материал подложки |  | custom | `custom`, `fr4`, `rt5880`, `rt5870`, `ro3003`, `ro4003`, `ro4350`, `ptfe`, `polyimide`, `al2o3` | всегда | custom использует epsR/tanD; именованные материалы подставляют оба значения. Уточняйте паспорт на рабочей частоте. |
| `epsR` | εr подложки |  | 2.2 | 1 … 20 | substrate = custom | Относительная проницаемость своей подложки; скрытые значения сохраняются. |
| `substrateH` | Толщина подложки h | мм | 1.5 | 0.05 … 200 | всегда | Расстояние между патчем и экраном; фактическая толщина диэлектрика. |
| `targetZ` | Согласовать на | Ом | 50 | 10 … 300 | всегда | Цель синтеза питания патча либо семейство Moxon. Не переопределяет автоматически опорное сопротивление всех КСВ. |
| `polarization` | Поляризация |  | Линейная | `Линейная`, `RHCP`, `LHCP` | всегда | Линейная / RHCP / LHCP. Выбор названия не рассчитывает CP-геометрию и осевое отношение. |
| `tanD` | tanδ подложки |  | 0 | 0 … 0.2 | substrate = custom | Тангенс потерь своей подложки. Ноль исключает диэлектрические, но не все прочие потери. |
| `floorDb` | Нижний предел шкалы | дБ | -40 | -80 … -10 | всегда | Нижний предел отображения ДН, а не физическая граница излучения. |

## Рупор — horn

### [params]

| Ключ | Поле | Ед. | Умолчание | Допустимо / enum | Используется при | Значение |
|---|---|---|---|---|---|---|
| `freqMHz` | Частота | МГц | 10000 | 1 … 40000 | всегда | Рабочая частота; определяет длину волны в свободном пространстве. |
| `apertureA` | Раскрыв a (H-плоскость) | мм | 60 | 1 … 20000 | всегда | Размер раскрыва по широкой стенке, H-плоскость. |
| `apertureB` | Раскрыв b (E-плоскость) | мм | 45 | 1 … 20000 | всегда | Размер раскрыва по узкой стенке, E-плоскость. |
| `flareE` | Образующая E-клина ρe | мм | 0 | 0 … 100000 | всегда | Образующая E для фазовой ошибки раскрыва; задавайте обе E/H. Ноль — отсутствие фазовых данных. |
| `flareH` | Образующая H-клина ρh | мм | 0 | 0 … 100000 | всегда | Образующая H, используется вместе с E. |
| `floorDb` | Нижний предел шкалы | дБ | -40 | -80 … -10 | всегда | Нижний предел отображения ДН, а не физическая граница излучения. |

### [synthesis]

| Ключ | Поле | Ед. | Умолчание | Допустимо / enum | Используется при | Значение |
|---|---|---|---|---|---|---|
| `freqMHz` | Частота | МГц | 10000 | 1 … 40000 | всегда | Рабочая частота; определяет длину волны в свободном пространстве. |
| `targetGainDbi` | Требуемое усиление | дБи | 18 | 6 … 30 | всегда | Рупор — цель усиления; решётка — КНД изотропной решётки; GNSS — усиление одной спирали. |
| `floorDb` | Нижний предел шкалы | дБ | -40 | -80 … -10 | всегда | Нижний предел отображения ДН, а не физическая граница излучения. |

## Решётка — array

### [params]

| Ключ | Поле | Ед. | Умолчание | Допустимо / enum | Используется при | Значение |
|---|---|---|---|---|---|---|
| `freqMHz` | Частота | МГц | 1000 | 1 … 40000 | всегда | Рабочая частота; определяет длину волны в свободном пространстве. |
| `count` | Число элементов N | шт | 4 | 1 … 64 | всегда | Число изотропных излучателей решётки либо диполей ЛПА. |
| `spacingMm` | Шаг d | мм | 150 | 1 … 100000 | всегда | Расстояние между центрами соседних элементов равномерной решётки. |
| `phaseDeg` | Фазовый сдвиг β | град | 0 | -360 … 360 | всегда | Фазовый сдвиг соседних элементов; ноль — поперечное излучение в модели решётки. |
| `floorDb` | Нижний предел шкалы | дБ | -40 | -80 … -10 | всегда | Нижний предел отображения ДН, а не физическая граница излучения. |

### [synthesis]

| Ключ | Поле | Ед. | Умолчание | Допустимо / enum | Используется при | Значение |
|---|---|---|---|---|---|---|
| `freqMHz` | Частота | МГц | 1000 | 1 … 40000 | всегда | Рабочая частота; определяет длину волны в свободном пространстве. |
| `goal` | Проектировать по |  | gain | `gain`, `beam` | всегда | gain — по КНД; beam — по ширине луча для подбора числа элементов. |
| `targetGainDbi` | Требуемый КНД | дБи | 12 | 3 … 30 | goal = gain | Рупор — цель усиления; решётка — КНД изотропной решётки; GNSS — усиление одной спирали. |
| `targetHpbwDeg` | Требуемая ширина луча | град | 12 | 1 … 90 | goal = beam | Целевая ширина главного лепестка −3 дБ для синтеза решётки. |
| `spacingRel` | Шаг решётки | λ | 0.5 | 0.1 … 1.5 | всегда | Шаг решётки в долях длины волны свободного пространства. |
| `phaseDeg` | Фазовый сдвиг β | град | 0 | -360 … 360 | всегда | Фазовый сдвиг соседних элементов; ноль — поперечное излучение в модели решётки. |
| `floorDb` | Нижний предел шкалы | дБ | -40 | -80 … -10 | всегда | Нижний предел отображения ДН, а не физическая граница излучения. |

## Яги / волновой канал — yagi

### [params]

| Ключ | Поле | Ед. | Умолчание | Допустимо / enum | Используется при | Значение |
|---|---|---|---|---|---|---|
| `freqMHz` | Частота | МГц | 180 | 1 … 40000 | всегда | Рабочая частота; определяет длину волны в свободном пространстве. |
| `elements` | Элементы |  | [elements] | role, length, diameter, position (mm) | всегда | Строки: роль, полная длина, диаметр, позиция в мм. Активный один. Хранится в [elements], не скалярным ключом. |
| `feedGapMm` | Зазор активного элемента | мм | 0 | 0 … 500 | всегда | Расстояние между торцами плеч; плечо = (полная длина − зазор)/2. Ноль означает незаданный зазор. |
| `mounting` | Крепление к буму |  | none | `none`, `through-contact`, `through-insulated`, `ontop-contact` | всегда | none/dielectric — без металлической поправки; through-contact — сквозной контакт; through-insulated — изоляция; ontop-contact — контакт сверху. |
| `boomDiaMm` | Диаметр (сторона) бума | мм | 20 | 0 … 1000 | mounting ≠ none | Наружный диаметр круглого бума либо сторона квадратного для эмпирической поправки. |
| `boomShape` | Форма бума |  | square | `square`, `round` | mounting = ontop-contact | round — круглый, square — квадратный. Влияет при контакте сверху; сохраняется и скрытым. |
| `material` | Материал проводника |  | pec | `pec`, `cu`, `al`, `brass`, `steel`, `custom` | всегда | pec — идеальный проводник; cu — медь; al — алюминий; brass — латунь; steel — сталь; custom — своё сопротивление. |
| `rhoCustom` | Удельное сопротивление ρ | Ом·мм²/м | 0.05 | 0.001 … 10 | material = custom | Удельное сопротивление при рабочей температуре, только для custom. Ом·мм²/м равны мкОм·м. |
| `floorDb` | Нижний предел шкалы | дБ | -40 | -80 … -10 | всегда | Нижний предел отображения ДН, а не физическая граница излучения. |

### [synthesis]

| Ключ | Поле | Ед. | Умолчание | Допустимо / enum | Используется при | Значение |
|---|---|---|---|---|---|---|
| `freqMHz` | Частота | МГц | 180 | 1 … 40000 | всегда | Рабочая частота; определяет длину волны в свободном пространстве. |
| `elementCount` | Число элементов | шт | 7 | 3 … 32 | всегда | Всего: рефлектор, активный и директоры. DL6WU предназначен для длинных антенн. |
| `elementDiaMm` | Диаметр элемента | мм | 6 | 0.5 … 500 | всегда | Диаметр проводника для синтеза и поправки на толщину. |
| `feedGapMm` | Зазор активного элемента | мм | 0 | 0 … 500 | всегда | Расстояние между торцами плеч; плечо = (полная длина − зазор)/2. Ноль означает незаданный зазор. |
| `boomDiaMm` | Диаметр (сторона) бума | мм | 20 | 0 … 1000 | всегда | Наружный диаметр круглого бума либо сторона квадратного для эмпирической поправки. |
| `boomShape` | Форма бума |  | square | `square`, `round` | всегда | round — круглый, square — квадратный. Влияет при контакте сверху; сохраняется и скрытым. |
| `mounting` | Крепление элементов |  | through-contact | `through-contact`, `through-insulated`, `ontop-contact`, `dielectric` | всегда | none/dielectric — без металлической поправки; through-contact — сквозной контакт; through-insulated — изоляция; ontop-contact — контакт сверху. |
| `material` | Материал проводника |  | pec | `pec`, `cu`, `al`, `brass`, `steel`, `custom` | всегда | pec — идеальный проводник; cu — медь; al — алюминий; brass — латунь; steel — сталь; custom — своё сопротивление. |
| `rhoCustom` | Удельное сопротивление ρ | Ом·мм²/м | 0.05 | 0.001 … 10 | material = custom | Удельное сопротивление при рабочей температуре, только для custom. Ом·мм²/м равны мкОм·м. |
| `floorDb` | Нижний предел шкалы | дБ | -40 | -80 … -10 | всегда | Нижний предел отображения ДН, а не физическая граница излучения. |

## Моксон — moxon

### [params]

| Ключ | Поле | Ед. | Умолчание | Допустимо / enum | Используется при | Значение |
|---|---|---|---|---|---|---|
| `freqMHz` | Частота | МГц | 915 | 1 … 40000 | всегда | Рабочая частота; определяет длину волны в свободном пространстве. |
| `widthA` | Ширина A | мм | 116.9 | 1 … 20000 | всегда | Полный размер главной стороны Moxon; для PCB — по осям дорожек. |
| `tailB` | Загиб активного B | мм | 14 | 0.1 … 5000 | всегда | Длина загиба активного в сторону рефлектора. |
| `gapC` | Зазор C | мм | 6.9 | 0.1 … 5000 | всегда | Зазор между концами активного и рефлектора. |
| `tailD` | Загиб рефлектора D | мм | 22.8 | 0.1 … 5000 | всегда | Длина загиба рефлектора в сторону активного. |
| `elementType` | Исполнение |  | wire | `wire`, `flat` | всегда | wire — круглый провод; flat — полоса; pcb, где доступно, — дорожка. Эквивалентный провод не решает всю диэлектрическую плату. |
| `diameterMm` | Диаметр провода | мм | 2 | 0.1 … 500 | elementType = wire | Наружный диаметр круглого проводника при соответствующем исполнении. |
| `stripWmm` | Ширина дорожки | мм | 4 | 0.05 … 500 | elementType = flat | Ширина медной полосы/дорожки для эквивалентного провода. У Moxon размеры задаются по осям дорожек. |
| `material` | Материал проводника |  | pec | `pec`, `cu`, `al`, `brass`, `steel`, `custom` | всегда | pec — идеальный проводник; cu — медь; al — алюминий; brass — латунь; steel — сталь; custom — своё сопротивление. |
| `rhoCustom` | Удельное сопротивление ρ | Ом·мм²/м | 0.05 | 0.001 … 10 | material = custom | Удельное сопротивление при рабочей температуре, только для custom. Ом·мм²/м равны мкОм·м. |
| `floorDb` | Нижний предел шкалы | дБ | -40 | -80 … -10 | всегда | Нижний предел отображения ДН, а не физическая граница излучения. |

### [synthesis]

| Ключ | Поле | Ед. | Умолчание | Допустимо / enum | Используется при | Значение |
|---|---|---|---|---|---|---|
| `freqMHz` | Частота | МГц | 915 | 1 … 40000 | всегда | Рабочая частота; определяет длину волны в свободном пространстве. |
| `elementType` | Исполнение |  | wire | `wire`, `flat` | всегда | wire — круглый провод; flat — полоса; pcb, где доступно, — дорожка. Эквивалентный провод не решает всю диэлектрическую плату. |
| `diameterMm` | Диаметр провода | мм | 2 | 0.05 … 500 | elementType = wire | Наружный диаметр круглого проводника при соответствующем исполнении. |
| `stripWmm` | Ширина дорожки | мм | 4 | 0.05 … 500 | elementType = flat | Ширина медной полосы/дорожки для эквивалентного провода. У Moxon размеры задаются по осям дорожек. |
| `targetZ` | Согласовать на | Ом | 50 | `50`, `93` | всегда | Цель синтеза питания патча либо семейство Moxon. Не переопределяет автоматически опорное сопротивление всех КСВ. |
| `material` | Материал проводника |  | pec | `pec`, `cu`, `al`, `brass`, `steel`, `custom` | всегда | pec — идеальный проводник; cu — медь; al — алюминий; brass — латунь; steel — сталь; custom — своё сопротивление. |
| `rhoCustom` | Удельное сопротивление ρ | Ом·мм²/м | 0.05 | 0.001 … 10 | material = custom | Удельное сопротивление при рабочей температуре, только для custom. Ом·мм²/м равны мкОм·м. |
| `floorDb` | Нижний предел шкалы | дБ | -40 | -80 … -10 | всегда | Нижний предел отображения ДН, а не физическая граница излучения. |

## Логопериодическая — lpda

### [params]

| Ключ | Поле | Ед. | Умолчание | Допустимо / enum | Используется при | Значение |
|---|---|---|---|---|---|---|
| `freqMHz` | Частота | МГц | 300 | 1 … 40000 | всегда | Рабочая частота; определяет длину волны в свободном пространстве. |
| `count` | Число элементов N | шт | 6 | 2 … 30 | всегда | Число изотропных излучателей решётки либо диполей ЛПА. |
| `tau` | Масштаб τ |  | 0.87 | 0.5 … 0.98 | всегда | Отношение соседних длин ЛПА; большее значение обычно требует больше элементов на ту же полосу. |
| `sigma` | Интервал σ |  | 0.055 | 0.01 … 0.25 | всегда | Принятая нормировка ЛПА: соседнее расстояние = 2 × sigma × полная длина элемента. |
| `longestMm` | Длина самого длинного | мм | 600 | 1 … 50000 | всегда | Полная длина самого большого заднего диполя; остальные — геометрическая прогрессия. |
| `diameterMm` | Диаметр элементов | мм | 10 | 0.1 … 500 | всегда | Наружный диаметр круглого проводника при соответствующем исполнении. |
| `feederZ0` | Импеданс фидера Z₀ | Ом | 100 | 10 … 600 | всегда | Волновое сопротивление перекрёстной линии, не автоматически опорное сопротивление внешнего кабеля. |
| `material` | Материал проводника |  | pec | `pec`, `cu`, `al`, `brass`, `steel`, `custom` | всегда | pec — идеальный проводник; cu — медь; al — алюминий; brass — латунь; steel — сталь; custom — своё сопротивление. |
| `rhoCustom` | Удельное сопротивление ρ | Ом·мм²/м | 0.05 | 0.001 … 10 | material = custom | Удельное сопротивление при рабочей температуре, только для custom. Ом·мм²/м равны мкОм·м. |
| `floorDb` | Нижний предел шкалы | дБ | -40 | -80 … -10 | всегда | Нижний предел отображения ДН, а не физическая граница излучения. |

### [synthesis]

| Ключ | Поле | Ед. | Умолчание | Допустимо / enum | Используется при | Значение |
|---|---|---|---|---|---|---|
| `freqLowMHz` | Нижняя частота | МГц | 200 | 1 … 40000 | всегда | Нижняя частота синтеза, определяет самый длинный диполь ЛПА. |
| `freqHighMHz` | Верхняя частота | МГц | 600 | 1 … 40000 | всегда | Верхняя частота синтеза, определяет необходимый самый короткий диполь. |
| `tau` | Масштаб τ |  | 0.88 | 0.6 … 0.97 | всегда | Отношение соседних длин ЛПА; большее значение обычно требует больше элементов на ту же полосу. |
| `diameterMm` | Диаметр элементов | мм | 10 | 0.1 … 500 | всегда | Наружный диаметр круглого проводника при соответствующем исполнении. |
| `feederZ0` | Импеданс фидера Z₀ | Ом | 100 | 10 … 600 | всегда | Волновое сопротивление перекрёстной линии, не автоматически опорное сопротивление внешнего кабеля. |
| `material` | Материал проводника |  | pec | `pec`, `cu`, `al`, `brass`, `steel`, `custom` | всегда | pec — идеальный проводник; cu — медь; al — алюминий; brass — латунь; steel — сталь; custom — своё сопротивление. |
| `rhoCustom` | Удельное сопротивление ρ | Ом·мм²/м | 0.05 | 0.001 … 10 | material = custom | Удельное сопротивление при рабочей температуре, только для custom. Ом·мм²/м равны мкОм·м. |
| `floorDb` | Нижний предел шкалы | дБ | -40 | -80 … -10 | всегда | Нижний предел отображения ДН, а не физическая граница излучения. |

## GNSS-спираль — gnss

### [params]

| Ключ | Поле | Ед. | Умолчание | Допустимо / enum | Используется при | Значение |
|---|---|---|---|---|---|---|
| `freqMHz` | Частота | МГц | 1575 | 1 … 40000 | всегда | Рабочая частота; определяет длину волны в свободном пространстве. |
| `helixCount` | Число спиралей | шт | 3 | 1 … 6 | всегда | Число одинаковых спиралей в моделируемой сборке. |
| `helixDiaMm` | Диаметр спирали | мм | 60 | 1 … 5000 | всегда | Диаметр намотки; окружность витка равна πD. |
| `turns` | Число витков | шт | 2 | 0.5 … 40 | всегда | Фактическое число витков по конструкции. |
| `heightMm` | Высота намотки | мм | 40 | 1 … 20000 | всегда | Высота намотки по оси; вместе с числом витков задаёт шаг. |
| `arrangeRadiusMm` | Радиус расстановки | мм | 70 | 0 … 5000 | всегда | Радиус расстановки осей спиралей; спирали не должны пересекаться. |
| `conductor` | Проводник намотки |  | tape | `tape`, `wire` | всегда | tape — лента с эквивалентным радиусом ширина/4; wire — круглый провод с радиусом диаметр/2. |
| `tapeWidthMm` | Ширина медного скотча | мм | 8 | 0.5 … 500 | conductor = tape | Ширина проводящей ленты намотки. |
| `wireDiaMm` | Диаметр провода намотки | мм | 1.5 | 0.05 … 100 | conductor = wire | Диаметр проводящего металла без изоляции. |
| `sense` | Направление намотки |  | RH | `RH`, `LH` | всегда | RH или LH; выбор направления сам по себе не доказывает осевое отношение принимаемого сигнала. |
| `groundPlane` | Экран под спиралью |  | yes | `yes`, `inf`, `no` | всегда | yes — конечный плоский диск; inf — идеальная бесконечная плоскость; no — без экрана. |
| `screenDiaMm` | Диаметр экрана | мм | 285.3 | 20 … 2000 | groundPlane = yes | Диаметр приближённого плоского диска; не описывает сложный корпус/покрытие. |
| `standoffMm` | Высота основания над экраном | мм | 3 | 0 … 1000 | groundPlane ≠ no | Высота основания над экраном; слишком малое значение модель может увеличить с предупреждением. |
| `material` | Материал проводника |  | cu | `pec`, `cu`, `al`, `brass`, `steel`, `custom` | всегда | pec — идеальный проводник; cu — медь; al — алюминий; brass — латунь; steel — сталь; custom — своё сопротивление. |
| `rhoCustom` | Удельное сопротивление ρ | Ом·мм²/м | 0.05 | 0.001 … 10 | material = custom | Удельное сопротивление при рабочей температуре, только для custom. Ом·мм²/м равны мкОм·м. |
| `floorDb` | Нижний предел шкалы | дБ | -40 | -80 … -10 | всегда | Нижний предел отображения ДН, а не физическая граница излучения. |

### [synthesis]

| Ключ | Поле | Ед. | Умолчание | Допустимо / enum | Используется при | Значение |
|---|---|---|---|---|---|---|
| `freqMHz` | Частота | МГц | 1575 | 1 … 40000 | всегда | Рабочая частота; определяет длину волны в свободном пространстве. |
| `helixCount` | Число спиралей | шт | 3 | 1 … 6 | всегда | Число одинаковых спиралей в моделируемой сборке. |
| `targetGainDbi` | Требуемое усиление спирали | дБи | 9 | 5 … 20 | всегда | Рупор — цель усиления; решётка — КНД изотропной решётки; GNSS — усиление одной спирали. |
| `pitchRel` | Шаг намотки | λ | 0.22 | 0.1 … 0.4 | всегда | Осевой шаг одного витка в долях длины волны для синтеза. |
| `conductor` | Проводник намотки |  | tape | `tape`, `wire` | всегда | tape — лента с эквивалентным радиусом ширина/4; wire — круглый провод с радиусом диаметр/2. |
| `material` | Материал проводника |  | cu | `pec`, `cu`, `al`, `brass`, `steel`, `custom` | всегда | pec — идеальный проводник; cu — медь; al — алюминий; brass — латунь; steel — сталь; custom — своё сопротивление. |
| `rhoCustom` | Удельное сопротивление ρ | Ом·мм²/м | 0.05 | 0.001 … 10 | material = custom | Удельное сопротивление при рабочей температуре, только для custom. Ом·мм²/м равны мкОм·м. |
| `floorDb` | Нижний предел шкалы | дБ | -40 | -80 … -10 | всегда | Нижний предел отображения ДН, а не физическая граница излучения. |

---

Field definitions / определений полей: 142.
