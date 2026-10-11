export type DemoRole = "Admin" | "Source" | "Carrier" | "Restaurant";

export function roleHomePath(role: DemoRole): string {
  switch (role) {
    case "Admin":
      return "/admin";
    case "Source":
      return "/source";
    case "Carrier":
      return "/carrier";
    case "Restaurant":
      return "/restaurant";
  }
}
