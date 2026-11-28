use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsuarioPublico {
    pub id: i64,
    pub nombre: String,
    pub usuario: String,
    pub rol: String,
    pub activo: bool,
    pub dev: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Producto {
    pub id: i64,
    pub sku: String,
    pub codigo_barras: String,
    pub nombre: String,
    pub marca: String,
    pub medida: String,
    pub modelo: String,
    pub dot: String,
    pub proveedor_id: Option<i64>,
    pub proveedor_nombre: Option<String>,
    pub costo: Option<f64>,
    pub precio_venta: f64,
    pub stock: i64,
    pub stock_minimo: i64,
    pub sucursal_id: Option<i64>,
    pub sucursal_nombre: Option<String>,
    pub activo: bool,
    pub imagen: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ProductoIn {
    pub id: Option<i64>,
    pub sku: String,
    pub codigo_barras: String,
    pub nombre: String,
    pub marca: String,
    pub medida: String,
    pub modelo: String,
    pub dot: String,
    pub proveedor_id: Option<i64>,
    pub costo: f64,
    pub precio_venta: f64,
    pub stock: i64,
    pub stock_minimo: i64,
    pub sucursal_id: Option<i64>,
    pub activo: bool,
    #[serde(default)]
    pub imagen: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Servicio {
    pub id: i64,
    pub nombre: String,
    pub descripcion: String,
    pub precio: f64,
    pub duracion_min: i64,
    pub activo: bool,
}

#[derive(Debug, Deserialize)]
pub struct ServicioIn {
    pub id: Option<i64>,
    pub nombre: String,
    pub descripcion: String,
    pub precio: f64,
    pub duracion_min: i64,
    pub activo: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CatalogoSimple {
    pub id: i64,
    pub nombre: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Proveedor {
    pub id: i64,
    pub nombre: String,
    pub contacto: String,
    pub telefono: String,
    pub activo: bool,
}

#[derive(Debug, Deserialize)]
pub struct ProveedorIn {
    pub id: Option<i64>,
    pub nombre: String,
    pub contacto: String,
    pub telefono: String,
    pub activo: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Empleado {
    pub id: i64,
    pub nombre: String,
    pub puesto: String,
    pub telefono: String,
    pub activo: bool,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct PermisoModuloIn {
    pub modulo: String,
    pub crear: bool,
    pub editar: bool,
    pub eliminar: bool,
}

#[derive(Debug, Deserialize)]
pub struct EmpleadoIn {
    pub id: Option<i64>,
    pub nombre: String,
    pub puesto: String,
    pub telefono: String,
    pub activo: bool,
}

#[derive(Debug, Deserialize)]
pub struct VentaItemIn {
    pub tipo: String,
    pub referencia_id: i64,
    pub cantidad: i64,
    /// Lo envía el carrito para mostrarlo; el backend siempre vuelve a leer el precio de la BD.
    #[allow(dead_code)]
    pub precio_unitario: f64,
    pub descuento: f64,
}

#[derive(Debug, Deserialize)]
pub struct VentaIn {
    pub sucursal_id: Option<i64>,
    #[serde(default)]
    pub cliente_id: Option<i64>,
    pub items: Vec<VentaItemIn>,
    pub descuento: f64,
    pub metodo_pago: String,
    pub recibido: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Cliente {
    pub id: i64,
    pub nombre: String,
    pub telefono: String,
    pub correo: String,
    pub direccion: String,
    pub activo: bool,
    pub created_at: String,
    pub facturas: i64,
    pub total_comprado: f64,
}

#[derive(Debug, Deserialize)]
pub struct ClienteIn {
    pub id: Option<i64>,
    pub nombre: String,
    pub telefono: String,
    pub correo: String,
    pub direccion: String,
    pub activo: bool,
}

#[derive(Debug, Serialize)]
pub struct VentaResultado {
    pub id: i64,
    pub total: f64,
    pub cambio: f64,
    pub ticket: String,
    pub impresion_ok: bool,
    pub impresion_error: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct VentaListado {
    pub id: i64,
    pub fecha: String,
    pub usuario_nombre: String,
    pub total: f64,
    pub descuento: f64,
    pub metodo_pago: String,
    pub estado: String,
    pub items: i64,
    pub cliente_nombre: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct Movimiento {
    pub id: i64,
    pub producto_id: i64,
    pub producto_nombre: String,
    pub tipo: String,
    pub cantidad: i64,
    pub motivo: String,
    pub usuario_nombre: String,
    pub fecha: String,
}

#[derive(Debug, Serialize)]
pub struct DashboardData {
    pub ventas_hoy: f64,
    pub ventas_semana: f64,
    pub tickets_hoy: i64,
    pub ticket_promedio: f64,
    pub stock_bajo: i64,
    pub ultimas_ventas: Vec<VentaListado>,
    pub productos_alerta: Vec<Producto>,
}

#[derive(Debug, Serialize)]
pub struct TotalesGrupo {
    pub nombre: String,
    pub total: f64,
    pub cantidad: i64,
}

#[derive(Debug, Serialize)]
pub struct ReporteVentas {
    pub total: f64,
    pub cantidad: i64,
    pub ticket_promedio: f64,
    pub por_metodo: Vec<TotalesGrupo>,
    pub por_usuario: Vec<TotalesGrupo>,
    pub servicios_top: Vec<TotalesGrupo>,
    pub ventas: Vec<VentaListado>,
}

#[derive(Debug, Serialize)]
pub struct EstadoPruebas {
    pub productos: i64,
    pub servicios: i64,
    pub clientes: i64,
    pub ventas: i64,
}

#[derive(Debug, Serialize)]
pub struct DiaVenta {
    pub fecha: String,
    pub total: f64,
    pub cantidad: i64,
}

#[derive(Debug, Serialize)]
pub struct ResumenVentas {
    pub total: f64,
    pub cantidad: i64,
    pub ticket_promedio: f64,
    pub por_metodo: Vec<TotalesGrupo>,
    pub serie: Vec<DiaVenta>,
}

#[derive(Debug, Serialize)]
pub struct LoginHoy {
    pub nombre: String,
    pub usuario: String,
    pub rol: String,
    pub inicio: String,
}

#[derive(Debug, Serialize)]
pub struct EventoSistema {
    pub id: i64,
    pub tipo: String,
    pub usuario_nombre: Option<String>,
    pub mensaje: String,
    pub fecha: String,
}

#[derive(Debug, Serialize)]
pub struct AlertaSistema {
    pub nivel: String,
    pub mensaje: String,
}

#[derive(Debug, Serialize)]
pub struct StatusSistema {
    pub version: String,
    pub db_bytes: u64,
    pub disco_libre_bytes: u64,
    pub disco_total_bytes: u64,
    pub ultimo_respaldo_local: Option<String>,
    pub ultimo_respaldo_remoto: Option<String>,
    pub estado_respaldo: String,
    pub error_respaldo: Option<String>,
    pub started_at: String,
    pub sesion_inicio: Option<String>,
    pub online: bool,
    pub impresora: String,
    pub ultimo_error_impresion: Option<String>,
    pub ultimo_escaneo: Option<String>,
    pub logins_hoy: Vec<LoginHoy>,
    pub ultimos_logins: Vec<EventoSistema>,
    pub ventas_hoy: i64,
    pub items_hoy: i64,
    pub movimientos_hoy: i64,
    pub tickets_hoy: i64,
    pub total_productos: i64,
    pub total_servicios: i64,
    pub total_usuarios: i64,
    pub ventas_mes: i64,
    pub errores_recientes: Vec<EventoSistema>,
    pub alertas: Vec<AlertaSistema>,
    pub bitacora: Vec<EventoSistema>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ConfigApp {
    pub negocio_nombre: String,
    pub negocio_direccion: String,
    pub ticket_pie: String,
    pub umbral_db_mb: String,
    pub umbral_respaldo_dias: String,
    pub caja_puede_descuento: String,
    #[serde(default)]
    pub negocio_logo: Option<String>,
    #[serde(default)]
    pub ticket_encabezado: String,
    #[serde(default)]
    pub ticket_mostrar_direccion: String,
    #[serde(default)]
    pub ticket_mostrar_fecha: String,
    #[serde(default)]
    pub ticket_mostrar_cajero: String,
    #[serde(default)]
    pub ticket_mostrar_cliente: String,
    #[serde(default)]
    pub ticket_mostrar_pago: String,
    #[serde(default)]
    pub ticket_mostrar_recibido: String,
    #[serde(default = "ticket_si_default")]
    pub ticket_mostrar_logo: String,
    #[serde(default = "ancho_ticket_default")]
    pub ticket_ancho: String,
    #[serde(default)]
    pub fiscal_rtn: String,
    #[serde(default)]
    pub fiscal_cai: String,
    #[serde(default)]
    pub fiscal_rango_desde: String,
    #[serde(default)]
    pub fiscal_rango_hasta: String,
    #[serde(default)]
    pub fiscal_fecha_limite: String,
    #[serde(default = "fiscal_isv_default")]
    pub fiscal_isv: String,
    #[serde(default = "fiscal_si_default")]
    pub fiscal_precios_con_isv: String,
}

fn fiscal_isv_default() -> String {
    "15".into()
}

fn fiscal_si_default() -> String {
    "1".into()
}

fn ancho_ticket_default() -> String {
    "58".into()
}

fn ticket_si_default() -> String {
    "1".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarcaNegocio {
    pub nombre: String,
    /// Dirección / ubicación del negocio, configurable en Configuración.
    pub direccion: String,
    pub logo: Option<String>,
    /// Si el logo también se imprime en la factura.
    pub mostrar_logo_factura: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Licencia {
    pub titular: String,
    pub plan: String,
    pub inicio: String,
    pub expira: String,
    pub notas: String,
}

#[derive(Debug, Deserialize)]
pub struct UsuarioIn {
    pub id: Option<i64>,
    pub nombre: String,
    pub usuario: String,
    pub password: Option<String>,
    pub rol: String,
    pub activo: bool,
}

#[derive(Debug, Serialize)]
pub struct Gasto {
    pub id: i64,
    pub fecha: String,
    pub categoria: String,
    pub descripcion: String,
    pub monto: f64,
    pub metodo_pago: String,
    pub proveedor_id: Option<i64>,
    pub proveedor_nombre: Option<String>,
    pub usuario_nombre: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct GastoIn {
    pub id: Option<i64>,
    pub fecha: String,
    pub categoria: String,
    pub descripcion: String,
    pub monto: f64,
    pub metodo_pago: String,
    pub proveedor_id: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct FavoritoDispositivo {
    pub tipo: String,
    pub nombre: String,
    pub clase: String,
}

#[derive(Debug, Serialize)]
pub struct CompraInventario {
    pub id: i64,
    pub fecha: String,
    pub producto_id: i64,
    pub producto_nombre: String,
    pub cantidad: i64,
    pub costo_unitario: f64,
    pub total: f64,
    pub motivo: String,
}

#[derive(Debug, Serialize)]
pub struct DiaFinanza {
    pub fecha: String,
    pub ingresos: f64,
    pub gastos: f64,
    pub utilidad: f64,
}

#[derive(Debug, Serialize)]
pub struct ResumenFinanzas {
    pub desde: String,
    pub hasta: String,
    pub ingresos: f64,
    pub gastos_manuales: f64,
    pub compras_inventario: f64,
    pub gastos_totales: f64,
    pub utilidad_neta: f64,
    pub por_categoria: Vec<TotalesGrupo>,
    pub serie: Vec<DiaFinanza>,
    pub gastos: Vec<Gasto>,
    pub compras: Vec<CompraInventario>,
}
