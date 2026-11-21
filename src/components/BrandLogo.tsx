import { cn } from "@/lib/utils";
import { Logo } from "./Logo";

/**
 * Logo de marca con el mismo tratamiento que en el sidebar:
 * logo propio sobre placa blanca, o el logo de AllCo por defecto.
 */
export function BrandLogo({
  logo,
  name,
  className,
}: {
  logo?: string | null;
  name: string;
  className?: string;
}) {
  if (logo) {
    return (
      <img
        src={logo}
        alt={name}
        className={cn("shrink-0 object-contain", className)}
      />
    );
  }
  return <Logo className={className} />;
}
