import type { ReactNode } from "react";

type AdminCollapsibleProps = {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: ReactNode;
};

export default function AdminCollapsible({
  title,
  subtitle,
  defaultOpen = false,
  children,
}: AdminCollapsibleProps) {
  return (
    <details className="admin-collapsible" open={defaultOpen}>
      <summary className="admin-collapsible-summary">
        <span>
          <strong>{title}</strong>
          {subtitle ? <small>{subtitle}</small> : null}
        </span>
        <span className="admin-collapsible-icon">+</span>
      </summary>
      <div className="admin-collapsible-body">{children}</div>
    </details>
  );
}
