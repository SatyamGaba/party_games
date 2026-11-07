import type { ReactNode, ComponentProps } from "react";
import { Button as PrimitiveButton } from "@base-ui/react/button";
import { Input as PrimitiveInput } from "@base-ui/react/input";
import { Dialog } from "@base-ui/react/dialog";
import { Menu } from "@base-ui/react/menu";
import { cva, type VariantProps } from "class-variance-authority";
import { X, Sun, Moon, Monitor } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "../lib/cn";
const variants = cva("button", {
  variants: {
    variant: { primary: "primary", secondary: "quiet", ghost: "ghost" },
    size: { small: "small", default: "" },
  },
});
export function Button({
  className,
  variant,
  size,
  ...props
}: ComponentProps<typeof PrimitiveButton> & VariantProps<typeof variants>) {
  return (
    <PrimitiveButton
      className={cn(variants({ variant, size }), className)}
      {...props}
    />
  );
}
export function Input({
  className,
  ...props
}: ComponentProps<typeof PrimitiveInput>) {
  return <PrimitiveInput className={cn("text-input", className)} {...props} />;
}
export function Card({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("card", className)} {...props} />;
}
export function Badge({ children }: { children: ReactNode }) {
  return <span className="badge">{children}</span>;
}
export function PageHeader({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
      </div>
      {children}
    </div>
  );
}
export function Notice({
  children,
  onDismiss,
}: {
  children: ReactNode;
  onDismiss?: () => void;
}) {
  return (
    <div role="alert" className="notice">
      <span>{children}</span>
      {onDismiss && (
        <Button
          className="icon-button"
          aria-label="Dismiss notification"
          onClick={onDismiss}
        >
          <X size={18} />
        </Button>
      )}
    </div>
  );
}
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose(): void;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop" />
        <Dialog.Popup className="dialog">
          <Dialog.Close className="dialog-close" aria-label="Close dialog">
            <X size={20} />
          </Dialog.Close>
          <Dialog.Title>{title}</Dialog.Title>
          <Dialog.Description>{description}</Dialog.Description>
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function ThemeMenu() {
  const { theme, setTheme } = useTheme();
  return (
    <Menu.Root>
      <Menu.Trigger
        className="button icon-button quiet"
        aria-label="Change appearance"
      >
        <Sun className="light-icon" size={19} />
        <Moon className="dark-icon" size={19} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={8}>
          <Menu.Popup className="theme-menu" aria-label="Appearance">
            {[
              { id: "system", label: "System", Icon: Monitor },
              { id: "light", label: "Light", Icon: Sun },
              { id: "dark", label: "Dark", Icon: Moon },
            ].map(({ id, label, Icon }) => (
              <Menu.Item
                key={id}
                className="theme-item"
                onClick={() => setTheme(id)}
              >
                <Icon size={17} />
                {label}
                <span>{theme === id ? "✓" : ""}</span>
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
