export function lempiras(n: number) {
  return `L ${n.toLocaleString("es-HN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function fechaHora(s?: string | null) {
  if (!s) return "—";
  const [d, t] = s.split(" ");
  const parts = d?.split("-");
  if (!parts || parts.length !== 3) return s;
  const [y, m, day] = parts;
  return `${day}/${m}/${y}${t ? ` ${t.slice(0, 5)}` : ""}`;
}

export function bytes(n: number) {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${n} B`;
}

export function rolLabel(rol: string) {
  if (rol === "admin") return "Administrador";
  if (rol === "bodega") return "Bodega";
  if (rol === "caja") return "Caja";
  return rol;
}

export function pagoLabel(m: string) {
  if (m === "efectivo") return "Efectivo";
  if (m === "tarjeta") return "Tarjeta";
  if (m === "transferencia") return "Transferencia";
  return m;
}

export function condicionLabel(c: string) {
  if (c === "contado") return "Contado";
  if (c === "credito") return "Crédito";
  if (c === "mixto") return "Mixto";
  if (c === "sin_ventas") return "Sin ventas";
  return c;
}
