export function RoleBadge({ role, active = true }: { role: string; active?: boolean }) {
  return (
    <span className={`role-badge${active ? "" : " role-badge-inactive"}`}>{role}</span>
  );
}
