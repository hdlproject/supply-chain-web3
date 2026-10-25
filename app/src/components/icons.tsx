import type { ReactNode, SVGProps } from "react";

import type { DemoRole } from "@/lib/demo-accounts";

// Small stroke-icon set (24px grid). Inline SVG rather than an icon package
// so the app stays dependency-light and every icon inherits `currentColor`.
function Svg({
  children,
  small,
  ...props
}: SVGProps<SVGSVGElement> & { children: ReactNode; small?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`icon${small ? " icon-sm" : ""}`}
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

type IconProps = { small?: boolean };

export const ShieldIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3l8 3v6c0 4.6-3.2 7.8-8 9-4.8-1.2-8-4.4-8-9V6l8-3z" />
    <path d="M9 12l2 2 4-4" />
  </Svg>
);

export const SproutIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 21v-9" />
    <path d="M12 12C12 8 9.5 5.5 5 5.5 5 9.5 7.5 12 12 12z" />
    <path d="M12 14c0-3 2.2-5.5 7-5.5 0 3.5-2.5 5.5-7 5.5z" />
  </Svg>
);

export const TruckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2 6.5h11v10H2z" />
    <path d="M13 10h4.5l3.5 3.5v3H13z" />
    <circle cx="7" cy="18" r="2" />
    <circle cx="17" cy="18" r="2" />
  </Svg>
);

export const UtensilsIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 3v7.5M4.5 3v5a2.5 2.5 0 0 0 5 0V3M7 11v10" />
    <path d="M17 3c-2.2 1.2-3.2 3.4-3.2 6.2 0 2.2 1 3.6 3.2 3.8V21" />
  </Svg>
);

export const BoxIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M21 8l-9-5-9 5v8l9 5 9-5V8z" />
    <path d="M3 8l9 5 9-5M12 13v8" />
  </Svg>
);

export const CopyIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2.5" />
    <path d="M5 15V6.5A2.5 2.5 0 0 1 7.5 4H16" />
  </Svg>
);

export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
);

export const LogOutIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" />
    <path d="M16 8l4 4-4 4M20 12H9" />
  </Svg>
);

export const ArrowRightIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
);

export const ArrowLeftIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Svg>
);

export const LinkIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
    <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </Svg>
);

export const PlusIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const XIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);

export const WalletIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3" />
    <path d="M4 7.5V17a2 2 0 0 0 2 2h12.5a1.5 1.5 0 0 0 1.5-1.5V15" />
    <path d="M20.5 10.5h-4a2 2 0 0 0 0 4h4v-4z" />
  </Svg>
);

export const AlertIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v5M12 16.5h.01" />
  </Svg>
);

export const KeyIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="15" r="4" />
    <path d="M11 12l9-9M16 7l3 3M14 9l2 2" />
  </Svg>
);

export const RouteIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="6" cy="19" r="2" />
    <circle cx="18" cy="5" r="2" />
    <path d="M8 19h8a3.5 3.5 0 0 0 0-7H8a3.5 3.5 0 0 1 0-7h8" />
  </Svg>
);

export function RoleIcon({ role, small }: { role: DemoRole } & IconProps) {
  switch (role) {
    case "Admin":
      return <ShieldIcon small={small} />;
    case "Source":
      return <SproutIcon small={small} />;
    case "Carrier":
      return <TruckIcon small={small} />;
    case "Restaurant":
      return <UtensilsIcon small={small} />;
  }
}
