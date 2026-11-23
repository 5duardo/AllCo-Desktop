/**
 * Convierte un archivo de imagen en un data URL optimizado para guardarlo
 * en la base de datos local (se limita el tamaño y se comprime a WebP).
 */
export async function archivoAImagen(
  file: File,
  max = 640,
  calidad = 0.82,
): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("El archivo debe ser una imagen.");
  }

  const bruto = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("No se pudo leer la imagen."));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });

  // SVG y GIF se conservan tal cual para no perder vector ni animación.
  if (file.type === "image/svg+xml" || file.type === "image/gif") {
    return bruto;
  }

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("No se pudo procesar la imagen."));
    image.src = bruto;
  });

  const escala = Math.min(1, max / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * escala));
  canvas.height = Math.max(1, Math.round(img.height * escala));

  const ctx = canvas.getContext("2d");
  if (!ctx) return bruto;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/webp", calidad);
}
