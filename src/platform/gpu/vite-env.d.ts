/// <reference types="vite/client" />

declare module '*.wgsl?raw' {
  const content: string;
  export default content;
}

declare module '*.glsl?raw' {
  const content: string;
  export default content;
}

declare module '*.vert.glsl?raw' {
  const content: string;
  export default content;
}

declare module '*.frag.glsl?raw' {
  const content: string;
  export default content;
}
