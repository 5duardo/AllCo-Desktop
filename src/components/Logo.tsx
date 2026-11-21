import { cn } from "@/lib/utils";

/**
 * Logo de la app: la marca va sobre una placa oscura para que se lea
 * igual en fondos claros y oscuros.
 */
export function Logo({
  className,
  framed = true,
}: {
  className?: string;
  framed?: boolean;
}) {
  if (!framed) {
    return (
      <img
        src="/logo.png"
        alt="AllCo"
        className={cn("shrink-0 object-contain", className)}
      />
    );
  }

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-sidebar",
        className,
      )}
    >
      <img src="/logo.png" alt="AllCo" className="h-full w-full object-contain" />
    </span>
  );
}
