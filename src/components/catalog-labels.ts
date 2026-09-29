// Formato de etiquetas de filtros para mostrar al cliente. Solo cambia cómo se ven:
// el valor que viaja en la URL y se compara en la base queda igual.
export function filterLabel(value: string) {
  const text = value.replace(/-/g, " ").trim();
  return text ? text.charAt(0).toLocaleUpperCase("es-AR") + text.slice(1) : value;
}
