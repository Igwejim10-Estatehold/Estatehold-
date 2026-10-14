declare module 'piexifjs' {
  const piexif: {
    dump(data: Record<string, unknown>): string;
    insert(exif: string, jpegDataUrl: string): string;
  };
  export default piexif;
}
