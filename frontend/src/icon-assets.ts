const icons = import.meta.glob<string>("./icons/*.svg", {
  eager: true,
  query: "?url",
  import: "default",
});

export const iconAssets = Object.values(icons);
export default icons;
