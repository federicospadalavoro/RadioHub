export function decodeText(value: string) {
  const field = document.createElement("textarea");
  field.innerHTML = value;
  return field.value;
}
