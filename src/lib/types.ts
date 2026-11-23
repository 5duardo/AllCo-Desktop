export type Rol = "admin" | "bodega" | "caja";

export type Impresora = {
  nombre: string;
  puerto: string;
  driver: string;
  predeterminada: boolean;
  sin_conexion: boolean;
  instalada: boolean;
  puente: boolean;
  ruta: string;
};

export type DispositivoSimple = {
  nombre: string;
  clase: string;
  estado: string;
};

export type DispositivosData = {
  impresoras: Impresora[];
  lectores: DispositivoSimple[];
  usb: DispositivoSimple[];
  ultimo_escaneo: string | null;
  impresora_ticket: string;
  modo: string;
  errores: string[];
  detectando: boolean;
};

export type Usuario = {
  id: number;
  nombre: string;
  usuario: string;
  rol: Rol;
  activo: boolean;
  dev: boolean;
};

export type EstadoPruebas = {
  productos: number;
  servicios: number;
  clientes: number;
  ventas: number;
};

export type Producto = {
  id: number;
  sku: string;
  codigo_barras: string;
  nombre: string;
  marca: string;
  medida: string;
  modelo: string;
  dot: string;
  proveedor_id: number | null;
  proveedor_nombre: string | null;
  costo: number | null;
  precio_venta: number;
  stock: number;
  stock_minimo: number;
  sucursal_id: number | null;
  sucursal_nombre: string | null;
  activo: boolean;
  imagen: string | null;
};

export type Servicio = {
  id: number;
  nombre: string;
  descripcion: string;
  precio: number;
  duracion_min: number;
  activo: boolean;
};

export type Cliente = {
  id: number;
  nombre: string;
  telefono: string;
  correo: string;
  direccion: string;
  activo: boolean;
  created_at: string;
  facturas: number;
  total_comprado: number;
};

export type ClienteIn = {
  id?: number;
  nombre: string;
  telefono: string;
  correo: string;
  direccion: string;
  activo: boolean;
};

export type CatalogoSimple = { id: number; nombre: string };

export type VentaItemIn = {
  tipo: "producto" | "servicio";
  referencia_id: number;
  cantidad: number;
  precio_unitario: number;
  descuento: number;
};

export type VentaResultado = {
  id: number;
  total: number;
  cambio: number;
  ticket: string;
  impresion_ok: boolean;
  impresion_error: string | null;
};

export type VentaListado = {
  id: number;
  fecha: string;
  usuario_nombre: string;
  total: number;
  descuento: number;
  metodo_pago: string;
  estado: string;
  items: number;
};

export type Movimiento = {
  id: number;
  producto_id: number;
  producto_nombre: string;
  tipo: string;
  cantidad: number;
  motivo: string;
  usuario_nombre: string;
  fecha: string;
};

export type DashboardData = {
  ventas_hoy: number;
  ventas_semana: number;
  tickets_hoy: number;
  ticket_promedio: number;
  stock_bajo: number;
  ultimas_ventas: VentaListado[];
  productos_alerta: Producto[];
};

export type TotalesGrupo = { nombre: string; total: number; cantidad: number };

export type ReporteVentas = {
  total: number;
  cantidad: number;
  ticket_promedio: number;
  por_metodo: TotalesGrupo[];
  por_usuario: TotalesGrupo[];
  servicios_top: TotalesGrupo[];
  ventas: VentaListado[];
};

export type DiaVenta = { fecha: string; total: number; cantidad: number };

export type ResumenVentas = {
  total: number;
  cantidad: number;
  ticket_promedio: number;
  por_metodo: TotalesGrupo[];
  serie: DiaVenta[];
};

export type EventoSistema = {
  id: number;
  tipo: string;
  usuario_nombre: string | null;
  mensaje: string;
  fecha: string;
};

export type StatusSistema = {
  version: string;
  db_bytes: number;
  disco_libre_bytes: number;
  disco_total_bytes: number;
  ultimo_respaldo_local: string | null;
  ultimo_respaldo_remoto: string | null;
  estado_respaldo: string;
  error_respaldo: string | null;
  started_at: string;
  sesion_inicio: string | null;
  online: boolean;
  impresora: string;
  ultimo_error_impresion: string | null;
  ultimo_escaneo: string | null;
  logins_hoy: { nombre: string; usuario: string; rol: string; inicio: string }[];
  ultimos_logins: EventoSistema[];
  ventas_hoy: number;
  items_hoy: number;
  movimientos_hoy: number;
  tickets_hoy: number;
  total_productos: number;
  total_servicios: number;
  total_usuarios: number;
  ventas_mes: number;
  errores_recientes: EventoSistema[];
  alertas: { nivel: string; mensaje: string }[];
  bitacora: EventoSistema[];
};

export type ConfigApp = {
  negocio_nombre: string;
  negocio_direccion: string;
  ticket_pie: string;
  umbral_db_mb: string;
  umbral_respaldo_dias: string;
  caja_puede_descuento: string;
  negocio_logo: string | null;
  ticket_encabezado: string;
  ticket_mostrar_direccion: string;
  ticket_mostrar_fecha: string;
  ticket_mostrar_cajero: string;
  ticket_mostrar_cliente: string;
  ticket_mostrar_pago: string;
  ticket_mostrar_recibido: string;
};

export type MarcaNegocio = {
  nombre: string;
  logo: string | null;
};

export type CartLine = VentaItemIn & {
  nombre: string;
  stock?: number;
};
