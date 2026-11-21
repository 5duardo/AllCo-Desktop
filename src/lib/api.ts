import { invoke } from "@tauri-apps/api/core";
import type {
  CatalogoSimple,
  ConfigApp,
  DashboardData,
  EventoSistema,
  Movimiento,
  Producto,
  ReporteVentas,
  Servicio,
  StatusSistema,
  Usuario,
  VentaItemIn,
  VentaListado,
  VentaResultado,
} from "./types";

export const api = {
  login: (usuario: string, password: string) =>
    invoke<Usuario>("login", { usuario, password }),
  logout: () => invoke<void>("logout"),
  sesionActual: () => invoke<Usuario | null>("sesion_actual"),
  usuariosLogin: () => invoke<Usuario[]>("usuarios_login"),
  registrarEscaneo: (codigo: string) =>
    invoke<void>("registrar_escaneo", { codigo }),

  listarProveedores: () => invoke<CatalogoSimple[]>("listar_proveedores"),
  listarSucursales: () => invoke<CatalogoSimple[]>("listar_sucursales"),
  listarProductos: (q?: string, soloActivos = true) =>
    invoke<Producto[]>("listar_productos", { q: q || null, soloActivos }),
  buscarProductoCodigo: (codigo: string) =>
    invoke<Producto | null>("buscar_producto_codigo", { codigo }),
  guardarProducto: (data: Record<string, unknown>) =>
    invoke<number>("guardar_producto", { data }),
  movimientoInventario: (
    productoId: number,
    tipo: string,
    cantidad: number,
    motivo: string,
  ) =>
    invoke<number>("movimiento_inventario", {
      productoId,
      tipo,
      cantidad,
      motivo,
    }),
  kardex: (productoId?: number | null, desde?: string, hasta?: string) =>
    invoke<Movimiento[]>("kardex", {
      productoId: productoId ?? null,
      desde: desde || null,
      hasta: hasta || null,
    }),

  listarServicios: (soloActivos = true) =>
    invoke<Servicio[]>("listar_servicios", { soloActivos }),
  guardarServicio: (data: Record<string, unknown>) =>
    invoke<number>("guardar_servicio", { data }),

  crearVenta: (data: {
    sucursal_id?: number;
    items: VentaItemIn[];
    descuento: number;
    metodo_pago: string;
    recibido: number;
  }) => invoke<VentaResultado>("crear_venta", { data }),
  anularVenta: (ventaId: number, motivo: string) =>
    invoke<void>("anular_venta", { ventaId, motivo }),
  listarVentas: (desde?: string, hasta?: string) =>
    invoke<VentaListado[]>("listar_ventas", {
      desde: desde || null,
      hasta: hasta || null,
    }),
  obtenerTicket: (ventaId: number) =>
    invoke<string>("obtener_ticket", { ventaId }),

  dashboard: () => invoke<DashboardData>("dashboard"),
  reporteVentas: (periodo: string, desde?: string, hasta?: string) =>
    invoke<ReporteVentas>("reporte_ventas", {
      periodo,
      desde: desde || null,
      hasta: hasta || null,
    }),
  productosStockMinimo: () => invoke<Producto[]>("productos_stock_minimo"),

  listarUsuarios: () => invoke<Usuario[]>("listar_usuarios"),
  guardarUsuario: (data: Record<string, unknown>) =>
    invoke<number>("guardar_usuario", { data }),
  obtenerConfig: () => invoke<ConfigApp>("obtener_config"),
  guardarConfig: (data: ConfigApp) => invoke<void>("guardar_config", { data }),
  bitacora: (tipo?: string) =>
    invoke<EventoSistema[]>("bitacora", { tipo: tipo || null }),
  statusSistema: () => invoke<StatusSistema>("status_sistema"),
  respaldoLocal: () => invoke<string>("respaldo_local"),
  abrirCarpetaDatos: () => invoke<void>("abrir_carpeta_datos"),
  abrirCarpetaRespaldos: () => invoke<void>("abrir_carpeta_respaldos"),
};
