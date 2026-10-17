// Векторные схемы обозначения размеров для каждого типа антенны.
// Крупные, во всю ширину. Чёрные линии конструкции, оранжевые размерные линии/подписи.
// Подписи размеров — рядом со стрелками, без наложений.

const INK = "#14161a";
const ACC = "#fa7000";
const MUT = "#7b818c";

function Defs({ id }: { id: string }) {
  return (
    <defs>
      <marker id={`ae-${id}`} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
        <path d="M0,0 L6,3 L0,6 Z" fill={ACC} />
      </marker>
      <marker id={`as-${id}`} markerWidth="8" markerHeight="8" refX="0" refY="3" orient="auto">
        <path d="M6,0 L0,3 L6,6 Z" fill={ACC} />
      </marker>
    </defs>
  );
}

const wrap = (id: string, w: number, h: number, children: React.ReactNode) => (
  <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ display: "block" }} xmlns="http://www.w3.org/2000/svg">
    <Defs id={id} />
    {children}
  </svg>
);

/** Горизонтальная размерная линия; подпись — под линией (не наложена). */
function DimH({ id, x1, x2, y, label, labelBelow = true }: { id: string; x1: number; x2: number; y: number; label: string; labelBelow?: boolean }) {
  return (
    <g>
      <line x1={x1} y1={y} x2={x2} y2={y} stroke={ACC} strokeWidth={1.2} markerStart={`url(#as-${id})`} markerEnd={`url(#ae-${id})`} />
      <text x={(x1 + x2) / 2} y={labelBelow ? y + 15 : y - 7} fill={ACC} fontSize={14} fontWeight={700} textAnchor="middle">{label}</text>
    </g>
  );
}
/** Вертикальная размерная линия; подпись — сбоку. */
function DimV({ id, x, y1, y2, label, side = "right" }: { id: string; x: number; y1: number; y2: number; label: string; side?: "left" | "right" }) {
  return (
    <g>
      <line x1={x} y1={y1} x2={x} y2={y2} stroke={ACC} strokeWidth={1.2} markerStart={`url(#as-${id})`} markerEnd={`url(#ae-${id})`} />
      <text x={side === "right" ? x + 9 : x - 9} y={(y1 + y2) / 2} fill={ACC} fontSize={14} fontWeight={700} textAnchor={side === "right" ? "start" : "end"} dominantBaseline="middle">{label}</text>
    </g>
  );
}

export function AntennaDiagram({ id }: { id: string }) {
  switch (id) {
    case "dipole":
      return wrap("dip", 340, 120, <>
        <rect x={20} y={44} width={140} height={18} fill="#eef0f3" stroke={INK} strokeWidth={1.6} />
        <rect x={180} y={44} width={140} height={18} fill="#eef0f3" stroke={INK} strokeWidth={1.6} />
        <circle cx={167} cy={53} r={3} fill={INK} /><circle cx={173} cy={53} r={3} fill={INK} />
        <text x={170} y={32} fill={MUT} fontSize={12} textAnchor="middle">питание</text>
        <DimH id="dip" x1={20} x2={320} y={86} label="полная длина" />
      </>);
    case "patch":
      return wrap("pat", 340, 210, <>
        {/* вид сверху */}
        <text x={170} y={16} fill={MUT} fontSize={12} textAnchor="middle">вид сверху</text>
        <rect x={40} y={26} width={230} height={96} fill="#eef0f3" stroke={INK} strokeWidth={1.7} />
        <circle cx={155} cy={104} r={3.4} fill={INK} />
        <DimH id="pat" x1={40} x2={270} y={140} label="W" />
        <DimV id="pat" x={288} y1={26} y2={122} label="L" side="right" />
        {/* вид сбоку */}
        <line x1={40} y1={178} x2={270} y2={178} stroke={INK} strokeWidth={2.4} />
        <line x1={40} y1={190} x2={270} y2={190} stroke={INK} strokeWidth={1.4} strokeDasharray="4 3" />
        <text x={280} y={194} fill={MUT} fontSize={11}>экран</text>
        <text x={155} y={172} fill={MUT} fontSize={11} textAnchor="middle">εr — подложка</text>
        <DimV id="pat" x={28} y1={178} y2={190} label="h" side="left" />
      </>);
    case "horn":
      return wrap("hrn", 340, 170, <>
        <text x={170} y={16} fill={MUT} fontSize={12} textAnchor="middle">раскрыв (вид спереди)</text>
        <rect x={70} y={26} width={200} height={110} fill="#eef0f3" stroke={INK} strokeWidth={1.7} />
        <DimH id="hrn" x1={70} x2={270} y={152} label="a" />
        <DimV id="hrn" x={288} y1={26} y2={136} label="b" side="right" />
      </>);
    case "array":
      return wrap("arr", 340, 120, <>
        <line x1={20} y1={78} x2={320} y2={78} stroke={INK} strokeWidth={1.6} />
        {[45, 100, 155, 210, 265, 310].map((x) => <line key={x} x1={x} y1={36} x2={x} y2={78} stroke={INK} strokeWidth={2.4} />)}
        <DimH id="arr" x1={100} x2={155} y={26} label="d" labelBelow={false} />
        <text x={170} y={108} fill={MUT} fontSize={12} textAnchor="middle">N одинаковых элементов, шаг d</text>
      </>);
    case "yagi":
      return wrap("yag", 340, 150, <>
        <line x1={24} y1={78} x2={330} y2={78} stroke={INK} strokeWidth={1.8} />
        {[[42, 52], [110, 47], [175, 40], [235, 35], [292, 31]].map(([x, hh], i) => (
          <line key={i} x1={x} y1={78 - hh} x2={x} y2={78 + hh} stroke={INK} strokeWidth={2.6} />
        ))}
        <circle cx={107} cy={78} r={2.8} fill={INK} /><circle cx={113} cy={78} r={2.8} fill={INK} />
        <text x={42} y={144} fill={MUT} fontSize={11} textAnchor="middle">рефл.</text>
        <text x={110} y={144} fill={MUT} fontSize={11} textAnchor="middle">актив.</text>
        <text x={264} y={144} fill={MUT} fontSize={11} textAnchor="middle">директоры</text>
        <DimH id="yag" x1={42} x2={175} y={20} label="позиция от 1-го" labelBelow={false} />
        <DimV id="yag" x={306} y1={47} y2={78} label="L/2" side="right" />
      </>);
    case "moxon":
      return wrap("mox", 340, 170, <>
        {/* активный (верх) */}
        <path d="M70,44 L270,44 M70,44 L70,74 M270,44 L270,74" stroke={INK} strokeWidth={2} fill="none" />
        <circle cx={167} cy={44} r={3} fill={INK} /><circle cx={173} cy={44} r={3} fill={INK} />
        <text x={170} y={34} fill={MUT} fontSize={12} textAnchor="middle">питание</text>
        {/* рефлектор (низ) */}
        <path d="M70,140 L270,140 M70,140 L70,98 M270,140 L270,98" stroke={INK} strokeWidth={2} fill="none" />
        <text x={34} y={56} fill={MUT} fontSize={11} textAnchor="middle">актив.</text>
        <text x={34} y={120} fill={MUT} fontSize={11} textAnchor="middle">рефл.</text>
        <DimH id="mox" x1={70} x2={270} y={22} label="A" labelBelow={false} />
        {/* C — слева (зазор), B и D — справа */}
        <DimV id="mox" x={54} y1={74} y2={98} label="C" side="left" />
        <DimV id="mox" x={290} y1={44} y2={74} label="B" side="right" />
        <DimV id="mox" x={290} y1={98} y2={140} label="D" side="right" />
      </>);
    case "lpda":
      return wrap("lp", 340, 170, <>
        {/* трапеция-клин */}
        <line x1={26} y1={85} x2={300} y2={26} stroke={INK} strokeWidth={1.2} strokeDasharray="5 3" opacity={0.7} />
        <line x1={26} y1={85} x2={300} y2={144} stroke={INK} strokeWidth={1.2} strokeDasharray="5 3" opacity={0.7} />
        {/* угол α */}
        <path d="M292,52 A46,46 0 0 1 292,118" fill="none" stroke={ACC} strokeWidth={1.2} />
        <text x={312} y={89} fill={ACC} fontSize={15} fontWeight={700} dominantBaseline="middle">α</text>
        {/* диполи, растут слева(коротк.) направо(длинн.) */}
        {[[60, 16], [104, 24], [150, 33], [198, 43], [248, 54], [292, 62]].map(([x, hh], i) => (
          <line key={i} x1={x} y1={85 - hh} x2={x} y2={85 + hh} stroke={INK} strokeWidth={2.4} />
        ))}
        {/* перекрёстный фидер (зигзаг) */}
        <polyline points="60,79 104,91 150,79 198,91 248,79 292,91" fill="none" stroke={ACC} strokeWidth={1.4} />
        <polyline points="60,91 104,79 150,91 198,79 248,91 292,79" fill="none" stroke={ACC} strokeWidth={1.4} opacity={0.5} />
        <circle cx={60} cy={85} r={3.4} fill={ACC} />
        <text x={22} y={150} fill={MUT} fontSize={11} textAnchor="start">питание (короткий)</text>
        <text x={318} y={162} fill={MUT} fontSize={11} textAnchor="end">самый длинный</text>
        <text x={170} y={16} fill={ACC} fontSize={12} fontWeight={700} textAnchor="middle">τ = L(n+1)/L(n) · d = 2σ·L</text>
      </>);
    case "gnss":
      return wrap("gn", 340, 210, <>
        {/* ---- вид сбоку: спираль + луч в зенит ---- */}
        <text x={92} y={16} fill={MUT} fontSize={12} textAnchor="middle">вид сбоку (спираль)</text>
        {/* луч в зенит — стрелка слева, чтобы не пересекать размер D */}
        <line x1={30} y1={70} x2={30} y2={40} stroke={ACC} strokeWidth={1.4} markerEnd={`url(#ae-gn)`} />
        <text x={38} y={36} fill={ACC} fontSize={11} fontWeight={700} textAnchor="start">луч ↑ зенит</text>
        {/* витки: 4 полу-эллипса, снизу вверх */}
        {[0, 1, 2, 3].map((i) => (
          <path key={i} d={`M52,${150 - i * 26} A26,9 0 0 0 132,${150 - i * 26}`} fill="none" stroke={INK} strokeWidth={2} />
        ))}
        {[0, 1, 2, 3].map((i) => (
          <path key={"b" + i} d={`M52,${150 - i * 26} A26,9 0 0 1 132,${150 - i * 26 - 13}`} fill="none" stroke={INK} strokeWidth={2} opacity={0.35} strokeDasharray="3 3" />
        ))}
        {/* основание */}
        <line x1={40} y1={160} x2={144} y2={160} stroke={INK} strokeWidth={2.4} />
        <circle cx={52} cy={150} r={3} fill={ACC} />
        <text x={30} y={176} fill={MUT} fontSize={10.5} textAnchor="start">питание (низ)</text>
        {/* D — диаметр (над верхним витком), H — высота (справа от катушки) */}
        <DimH id="gn" x1={52} x2={132} y={58} label="D (диаметр)" labelBelow={false} />
        <DimV id="gn" x={150} y1={72} y2={160} label="H" side="right" />

        {/* ---- вид сверху: расстановка спиралей ---- */}
        <text x={250} y={16} fill={MUT} fontSize={12} textAnchor="middle">вид сверху</text>
        <circle cx={250} cy={112} r={64} fill="none" stroke={INK} strokeWidth={1.2} strokeDasharray="5 3" opacity={0.7} />
        {[0, 1, 2].map((i) => {
          const a = (-90 + i * 120) * Math.PI / 180;
          const x = 250 + 64 * Math.cos(a), y = 112 + 64 * Math.sin(a);
          return <circle key={i} cx={x} cy={y} r={15} fill="#eef0f3" stroke={INK} strokeWidth={1.7} />;
        })}
        <circle cx={250} cy={112} r={2.6} fill={INK} />
        <DimV id="gn" x={250} y1={112} y2={48} label="радиус" side="right" />
        <text x={250} y={196} fill={MUT} fontSize={10.5} textAnchor="middle">N спиралей по кругу</text>
      </>);
    default:
      return null;
  }
}

export const DIAGRAM_IDS = new Set(["dipole", "patch", "horn", "array", "yagi", "moxon", "lpda", "gnss"]);
