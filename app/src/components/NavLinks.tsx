"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { DemoRole } from "@/lib/demo-accounts";
import { roleHomePath } from "@/lib/demo-accounts";

import { BoxIcon, RoleIcon } from "./icons";

// Rendered twice by NavBar: once as the desktop link row in the header and
// once as the fixed bottom tab bar on phones. CSS decides which one shows.
export function NavLinks({ roles, variant }: { roles: DemoRole[]; variant: "header" | "tabbar" }) {
  const pathname = usePathname();

  const items = [
    ...roles.map((role) => ({
      href: roleHomePath(role),
      label: role,
      icon: <RoleIcon role={role} />,
    })),
    { href: "/products", label: "Products", icon: <BoxIcon /> },
  ];

  const isTabbar = variant === "tabbar";
  const itemClass = isTabbar ? "tab" : "nav-link";

  const links = items.map((item) => {
    const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
    return (
      <Link
        key={item.href}
        href={item.href}
        className={`${itemClass}${active ? " is-active" : ""}`}
        aria-current={active ? "page" : undefined}
      >
        {item.icon}
        <span>{item.label}</span>
      </Link>
    );
  });

  if (isTabbar) {
    return (
      <nav className="tabbar" aria-label="Primary">
        {links}
      </nav>
    );
  }
  return (
    <nav className="nav-links" aria-label="Primary">
      {links}
    </nav>
  );
}
