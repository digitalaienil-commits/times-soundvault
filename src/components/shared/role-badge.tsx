import { Badge } from "@/components/ui/badge";
import type { UserRole } from "@/types/auth";

interface RoleBadgeProps {
  role: UserRole;
}

export function RoleBadge({ role }: RoleBadgeProps) {
  return (
    <Badge
      variant="outline"
      className="h-6 rounded-md border-border bg-muted px-2 text-[0.6875rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase"
    >
      {role === "admin" ? "Admin" : "Reviewer"}
    </Badge>
  );
}
