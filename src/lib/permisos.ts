import type { Rol } from "./types";

/** Módulos que el admin puede asignar por usuario.
 * Resumen (/) siempre está disponible, Configuración sigue siendo solo admin
 * y Pruebas sigue siendo solo dev, por lo que no aparecen aquí. */
export const MODULOS_CONFIGURABLES: {
  id: string;
  label: string;
  roles: Rol[];
}[] = [
  { id: "/pos", label: "Punto de venta", roles: ["admin", "caja"] },
  { id: "/clientes", label: "Clientes", roles: ["admin", "caja"] },
  { id: "/dispositivos", label: "Dispositivos", roles: ["admin", "caja"] },
  { id: "/facturacion", label: "Facturación", roles: ["admin", "caja"] },
  { id: "/reportes", label: "Reportes", roles: ["admin"] },
  { id: "/finanzas", label: "Finanzas", roles: ["admin"] },
  { id: "/talonarios", label: "Talonarios", roles: ["admin"] },
  { id: "/inventario", label: "Inventario · Productos", roles: ["admin", "bodega"] },
  { id: "/proveedores", label: "Inventario · Proveedores", roles: ["admin", "bodega"] },
  { id: "/servicios", label: "Inventario · Servicios", roles: ["admin"] },
  { id: "/empleados", label: "Personas · Empleados", roles: ["admin"] },
  { id: "/status", label: "Sistema · Estado", roles: ["admin"] },
  { id: "/base-datos", label: "Sistema · Base de datos", roles: ["admin"] },
];

export const ACCIONES = [
  { id: "crear", label: "Crear" },
  { id: "editar", label: "Editar" },
  { id: "eliminar", label: "Eliminar" },
] as const;

export type PermisoAccion = (typeof ACCIONES)[number]["id"];

export type PermisosModulo = {
  modulo: string;
  acceso?: boolean;
  crear: boolean;
  editar: boolean;
  eliminar: boolean;
};
