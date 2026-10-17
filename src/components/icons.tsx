// Простые линейные иконки (stroke currentColor), 24×24.

interface IP {
  size?: number;
}
const S = (p: IP) => p.size ?? 22;

export function Icon({ id, size }: { id: string; size?: number }) {
  const s = size ?? 22;
  const common = {
    width: s,
    height: s,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (id) {
    case "dipole":
      return (
        <svg {...common}>
          <line x1="3" y1="12" x2="10.5" y2="12" />
          <line x1="13.5" y1="12" x2="21" y2="12" />
          <line x1="10.5" y1="8" x2="10.5" y2="16" />
          <line x1="13.5" y1="8" x2="13.5" y2="16" />
        </svg>
      );
    case "patch":
      return (
        <svg {...common}>
          <rect x="4" y="4" width="16" height="16" rx="1.5" />
          <rect x="8.5" y="8.5" width="7" height="7" rx="1" />
        </svg>
      );
    case "array":
      return (
        <svg {...common}>
          <line x1="4" y1="20" x2="20" y2="20" />
          <line x1="6" y1="20" x2="6" y2="7" />
          <line x1="11" y1="20" x2="11" y2="7" />
          <line x1="16" y1="20" x2="16" y2="7" />
          <line x1="3.5" y1="7" x2="8.5" y2="7" />
          <line x1="8.5" y1="7" x2="13.5" y2="7" />
          <line x1="13.5" y1="7" x2="18.5" y2="7" />
        </svg>
      );
    case "yagi":
      return (
        <svg {...common}>
          <line x1="4" y1="4" x2="4" y2="20" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="9" y1="6.5" x2="9" y2="17.5" />
          <line x1="13" y1="8" x2="13" y2="16" />
          <line x1="17" y1="9.5" x2="17" y2="14.5" />
        </svg>
      );
    case "moxon":
      // Характерная рамка Moxon: активный и рефлектор с загнутыми навстречу концами
      // и зазором между ними — именно это отличает её от яги.
      return (
        <svg {...common}>
          <path d="M4 6h16" />
          <path d="M4 6v4.5M20 6v4.5" />
          <path d="M4 18h16" />
          <path d="M4 18v-4.5M20 18v-4.5" />
          <circle cx="10.6" cy="6" r="0.9" fill="currentColor" stroke="none" />
          <circle cx="13.4" cy="6" r="0.9" fill="currentColor" stroke="none" />
        </svg>
      );
    case "gnss":
      return (
        <svg {...common}>
          <path d="M12 21c0-6 0-9 0-9" />
          <path d="M7 12c1.5-4 8.5-4 10 0" />
          <path d="M5 9c2.5-5 11.5-5 14 0" />
          <circle cx="12" cy="12" r="1" fill="currentColor" />
        </svg>
      );
    case "lpda":
      return (
        <svg {...common}>
          <line x1="3" y1="7" x2="21" y2="17" />
          <line x1="5" y1="4.5" x2="5" y2="9.5" />
          <line x1="9" y1="7" x2="9" y2="12" />
          <line x1="13" y1="9.5" x2="13" y2="13.5" />
          <line x1="17" y1="12" x2="17" y2="15.5" />
          <line x1="20" y1="14" x2="20" y2="17" />
        </svg>
      );
    case "horn":
      return (
        <svg {...common}>
          <path d="M4 10v4l7 5V5z" />
          <line x1="11" y1="12" x2="20" y2="12" />
        </svg>
      );
    case "folder":
      return (
        <svg {...common}>
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        </svg>
      );
    case "file":
      return (
        <svg {...common}>
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5" />
        </svg>
      );
    case "design":
      return (
        <svg {...common}>
          <path d="M4 20h16" />
          <path d="M6 20V9l6-5 6 5v11" />
          <path d="M10 20v-5h4v5" />
        </svg>
      );
    case "check":
      return (
        <svg {...common}>
          <path d="M4 12.5l5 5L20 6.5" />
        </svg>
      );
    case "info":
      return (
        <svg {...common} strokeWidth={1.6}>
          <circle cx="12" cy="12" r="9" />
          <line x1="12" y1="11" x2="12" y2="16" />
          <circle cx="12" cy="7.6" r="0.6" fill="currentColor" stroke="none" />
        </svg>
      );
    case "download":
      return (
        <svg {...common}>
          <path d="M12 3v12" />
          <path d="M7 10l5 5 5-5" />
          <path d="M4 20h16" />
        </svg>
      );
    case "wave":
      return (
        <svg {...common}>
          <path d="M3 12c2-5 4-5 6 0s4 5 6 0 4-5 6 0" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
        </svg>
      );
  }
}

export const iconSize = S;
