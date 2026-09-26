/**
 * Asset module declarations for the type checker. esbuild's `dataurl` loader
 * turns each import into an inlined `data:image/png;base64,…` string, which is
 * what the stylesheet and the custom-avatar path expect.
 */
declare module '*.png' {
  const dataUrl: string
  export default dataUrl
}
