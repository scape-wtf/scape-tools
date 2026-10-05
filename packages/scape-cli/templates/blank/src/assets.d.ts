/** The development bundler embeds model bytes; no remote URL is loaded. */
declare module '*.glb' {
  const base64: string;
  export default base64;
}
declare module '*.wav' {
  const base64: string;
  export default base64;
}
