declare module "piexifjs" {
  const piexif: {
    load(data: string): Record<string, Record<number, unknown>>;
  };
  export default piexif;
}
