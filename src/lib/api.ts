import { invoke } from "@tauri-apps/api/core";
import type {
  CatalogoSimple,
  Cliente,
  ClienteIn,
  ConfigApp,
  DashboardData,
  DispositivosData,
  EstadoPruebas,
  EventoSistema,
  Licencia,
  MarcaNegocio,
  Movimiento,
  Producto,
  ReporteVentas,
  ResumenVentas,
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
  restablecerPassword: (usuario: string, claveMaestra: string, nuevaPassword: string) =>
    invoke<void>("restablecer_password", { usuario, claveMaestra, nuevaPassword }),
  estadoLogin: (usuario: string) => invoke<number>("estado_login", { usuario }),
  obtenerLicencia: () => invoke<Licencia>("obtener_licencia"),
  guardarLicencia: (data: Licencia) => invoke<void>("guardar_licencia", { data }),
  registrarEscaneo: (codigo: string) =>
    invoke<void>("registrar_escaneo", { codigo }),

  listarProveedores: () => invoke<CatalogoSimple[]>("listar_proveedores"),
  listarSucursales: () => invoke<CatalogoSimple[]>("listar_sucursales"),
  listarProductos: (q?: string, estado: "activos" | "archivados" | "todos" = "activos") =>
    invoke<Producto[]>("listar_productos", { q: q || null, estado }),
  buscarProductoCodigo: (codigo: string) =>
    invoke<Producto | null>("buscar_producto_codigo", { codigo }),
  guardarProducto: (data: Record<string, unknown>) =>
    invoke<number>("guardar_producto", { data }),
  archivarProducto: (productoId: number) =>
    invoke<void>("archivar_producto", { productoId }),
  restaurarProducto: (productoId: number) =>
    invoke<void>("restaurar_producto", { productoId }),
  eliminarProducto: (productoId: number) =>
    invoke<void>("eliminar_producto", { productoId }),
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

  listarClientes: (q?: string, soloActivos = true) =>
    invoke<Cliente[]>("listar_clientes", { q: q || null, soloActivos }),
  guardarCliente: (data: ClienteIn) => invoke<number>("guardar_cliente", { data }),
  facturasCliente: (clienteId: number) =>
    invoke<VentaListado[]>("facturas_cliente", { clienteId }),

  crearVenta: (data: {
    sucursal_id?: number;
    cliente_id?: number | null;
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
  resumenVentas: (desde: string, hasta: string) =>
    invoke<ResumenVentas>("resumen_ventas", { desde, hasta }),
  productosStockMinimo: () => invoke<Producto[]>("productos_stock_minimo"),

  listarUsuarios: () => invoke<Usuario[]>("listar_usuarios"),
  guardarUsuario: (data: Record<string, unknown>) =>
    invoke<number>("guardar_usuario", { data }),
  obtenerConfig: () => invoke<ConfigApp>("obtener_config"),
  guardarConfig: (data: ConfigApp) => invoke<void>("guardar_config", { data }),
  marcaNegocio: () => invoke<MarcaNegocio>("marca_negocio"),
  bitacora: (tipo?: string) =>
    invoke<EventoSistema[]>("bitacora", { tipo: tipo || null }),
  statusSistema: () => invoke<StatusSistema>("status_sistema"),
  respaldoLocal: () => invoke<string>("respaldo_local"),
  eliminarDatos: () => invoke<string>("eliminar_datos"),
  abrirCarpetaDatos: () => invoke<void>("abrir_carpeta_datos"),
  abrirCarpetaRespaldos: () => invoke<void>("abrir_carpeta_respaldos"),

  estadoPruebas: () => invoke<EstadoPruebas>("estado_pruebas"),
  agregarDatosEjemplo: (tipo: string) =>
    invoke<EstadoPruebas>("agregar_datos_ejemplo", { tipo }),

  listarDispositivos: () => invoke<DispositivosData>("listar_dispositivos"),
  actualizarDispositivos: () => invoke<DispositivosData>("actualizar_dispositivos"),
  guardarImpresoraTicket: (
    nombre: string,
    modo?: "usb" | "spooler",
    ruta?: string,
  ) =>
    invoke<void>("guardar_impresora_ticket", {
      nombre,
      modo: modo ?? null,
      ruta: ruta ?? null,
    }),
  imprimirPrueba: (impresora: string, modo?: "usb" | "spooler", ruta?: string) =>
    invoke<string>("imprimir_prueba", {
      impresora,
      modo: modo ?? null,
      ruta: ruta ?? null,
    }),
  imprimirFactura: (
    ventaId: number,
    impresora?: string,
    modo?: "usb" | "spooler",
  ) =>
    invoke<string>("imprimir_factura", {
      ventaId,
      impresora: impresora ?? null,
      modo: modo ?? null,
    }),
};
