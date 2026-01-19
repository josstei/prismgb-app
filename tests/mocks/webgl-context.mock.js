/**
 * WebGL Context Mock
 *
 * Comprehensive mock for WebGL/WebGL2 rendering context.
 * Enables testing of GPU-accelerated rendering pipelines.
 */

import { vi } from 'vitest';

/**
 * WebGL constants (subset of most commonly used)
 */
export const GL = Object.freeze({
  // Clear buffer bits
  COLOR_BUFFER_BIT: 0x4000,
  DEPTH_BUFFER_BIT: 0x0100,
  STENCIL_BUFFER_BIT: 0x0400,

  // Primitives
  POINTS: 0x0000,
  LINES: 0x0001,
  LINE_LOOP: 0x0002,
  LINE_STRIP: 0x0003,
  TRIANGLES: 0x0004,
  TRIANGLE_STRIP: 0x0005,
  TRIANGLE_FAN: 0x0006,

  // Shader types
  VERTEX_SHADER: 0x8B31,
  FRAGMENT_SHADER: 0x8B30,

  // Buffer objects
  ARRAY_BUFFER: 0x8892,
  ELEMENT_ARRAY_BUFFER: 0x8893,
  STATIC_DRAW: 0x88E4,
  DYNAMIC_DRAW: 0x88E8,

  // Texture targets
  TEXTURE_2D: 0x0DE1,
  TEXTURE_CUBE_MAP: 0x8513,

  // Texture parameters
  TEXTURE_MIN_FILTER: 0x2801,
  TEXTURE_MAG_FILTER: 0x2800,
  TEXTURE_WRAP_S: 0x2802,
  TEXTURE_WRAP_T: 0x2803,
  NEAREST: 0x2600,
  LINEAR: 0x2601,
  CLAMP_TO_EDGE: 0x812F,
  REPEAT: 0x2901,

  // Pixel formats
  RGBA: 0x1908,
  RGB: 0x1907,
  UNSIGNED_BYTE: 0x1401,
  FLOAT: 0x1406,

  // Shader status
  COMPILE_STATUS: 0x8B81,
  LINK_STATUS: 0x8B82,

  // Errors
  NO_ERROR: 0,
  INVALID_ENUM: 0x0500,
  INVALID_VALUE: 0x0501,
  INVALID_OPERATION: 0x0502,

  // Framebuffers
  FRAMEBUFFER: 0x8D40,
  RENDERBUFFER: 0x8D41,
  COLOR_ATTACHMENT0: 0x8CE0,

  // Blending
  BLEND: 0x0BE2,
  SRC_ALPHA: 0x0302,
  ONE_MINUS_SRC_ALPHA: 0x0303,
});

/**
 * Creates a mock WebGL rendering context
 * @param {Object} options - Context options
 * @returns {Object} Mock WebGL context
 */
export function createWebGLContext(options = {}) {
  const {
    width = 640,
    height = 576,
    contextType = 'webgl',
  } = options;

  // Internal state
  const state = {
    programs: new Map(),
    shaders: new Map(),
    buffers: new Map(),
    textures: new Map(),
    framebuffers: new Map(),
    renderbuffers: new Map(),
    uniformLocations: new Map(),
    attribLocations: new Map(),
    viewport: { x: 0, y: 0, width, height },
    clearColor: [0, 0, 0, 0],
    currentProgram: null,
    boundTextures: new Map(),
    boundBuffers: new Map(),
    boundFramebuffer: null,
    error: GL.NO_ERROR,
    drawCalls: [],
    nextId: 1,
  };

  const generateId = () => state.nextId++;

  const ctx = {
    // Canvas reference
    canvas: {
      width,
      height,
      clientWidth: width,
      clientHeight: height,
    },

    // ==========================================
    // Context info
    // ==========================================

    getParameter: vi.fn((pname) => {
      // Return common parameter values
      const params = {
        [0x0BA2]: width,  // MAX_VIEWPORT_DIMS
        [0x0D33]: 4096,   // MAX_TEXTURE_SIZE
        [0x8869]: 16,     // MAX_VERTEX_ATTRIBS
        [0x8872]: 32,     // MAX_TEXTURE_IMAGE_UNITS
      };
      return params[pname] ?? null;
    }),

    getExtension: vi.fn((name) => {
      // Return mock extensions
      const extensions = {
        'OES_texture_float': {},
        'OES_texture_float_linear': {},
        'WEBGL_lose_context': {
          loseContext: vi.fn(),
          restoreContext: vi.fn(),
        },
      };
      return extensions[name] || null;
    }),

    getSupportedExtensions: vi.fn(() => [
      'OES_texture_float',
      'OES_texture_float_linear',
      'WEBGL_lose_context',
    ]),

    getError: vi.fn(() => {
      const error = state.error;
      state.error = GL.NO_ERROR;
      return error;
    }),

    // ==========================================
    // Viewport and clear
    // ==========================================

    viewport: vi.fn((x, y, w, h) => {
      state.viewport = { x, y, width: w, height: h };
    }),

    clearColor: vi.fn((r, g, b, a) => {
      state.clearColor = [r, g, b, a];
    }),

    clear: vi.fn((mask) => {
      state.drawCalls.push({ type: 'clear', mask });
    }),

    // ==========================================
    // Shader operations
    // ==========================================

    createShader: vi.fn((type) => {
      const id = generateId();
      const shader = { id, type, source: null, compiled: false };
      state.shaders.set(id, shader);
      return id;
    }),

    shaderSource: vi.fn((shader, source) => {
      const s = state.shaders.get(shader);
      if (s) s.source = source;
    }),

    compileShader: vi.fn((shader) => {
      const s = state.shaders.get(shader);
      if (s) s.compiled = true;
    }),

    getShaderParameter: vi.fn((shader, pname) => {
      const s = state.shaders.get(shader);
      if (!s) return null;
      if (pname === GL.COMPILE_STATUS) return s.compiled;
      return null;
    }),

    getShaderInfoLog: vi.fn((shader) => ''),

    deleteShader: vi.fn((shader) => {
      state.shaders.delete(shader);
    }),

    // ==========================================
    // Program operations
    // ==========================================

    createProgram: vi.fn(() => {
      const id = generateId();
      const program = {
        id,
        shaders: [],
        linked: false,
        uniforms: new Map(),
        attribs: new Map(),
      };
      state.programs.set(id, program);
      return id;
    }),

    attachShader: vi.fn((program, shader) => {
      const p = state.programs.get(program);
      if (p) p.shaders.push(shader);
    }),

    linkProgram: vi.fn((program) => {
      const p = state.programs.get(program);
      if (p) p.linked = true;
    }),

    getProgramParameter: vi.fn((program, pname) => {
      const p = state.programs.get(program);
      if (!p) return null;
      if (pname === GL.LINK_STATUS) return p.linked;
      return null;
    }),

    getProgramInfoLog: vi.fn((program) => ''),

    useProgram: vi.fn((program) => {
      state.currentProgram = program;
    }),

    deleteProgram: vi.fn((program) => {
      state.programs.delete(program);
    }),

    // ==========================================
    // Uniforms and attributes
    // ==========================================

    getUniformLocation: vi.fn((program, name) => {
      const key = `${program}:${name}`;
      if (!state.uniformLocations.has(key)) {
        state.uniformLocations.set(key, generateId());
      }
      return state.uniformLocations.get(key);
    }),

    getAttribLocation: vi.fn((program, name) => {
      const key = `${program}:${name}`;
      if (!state.attribLocations.has(key)) {
        state.attribLocations.set(key, state.attribLocations.size);
      }
      return state.attribLocations.get(key);
    }),

    uniform1i: vi.fn(),
    uniform1f: vi.fn(),
    uniform2f: vi.fn(),
    uniform3f: vi.fn(),
    uniform4f: vi.fn(),
    uniform1fv: vi.fn(),
    uniform2fv: vi.fn(),
    uniform3fv: vi.fn(),
    uniform4fv: vi.fn(),
    uniformMatrix2fv: vi.fn(),
    uniformMatrix3fv: vi.fn(),
    uniformMatrix4fv: vi.fn(),

    enableVertexAttribArray: vi.fn(),
    disableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),

    // ==========================================
    // Buffer operations
    // ==========================================

    createBuffer: vi.fn(() => {
      const id = generateId();
      state.buffers.set(id, { id, data: null, size: 0 });
      return id;
    }),

    bindBuffer: vi.fn((target, buffer) => {
      state.boundBuffers.set(target, buffer);
    }),

    bufferData: vi.fn((target, data, usage) => {
      const bufferId = state.boundBuffers.get(target);
      const buffer = state.buffers.get(bufferId);
      if (buffer) {
        buffer.data = data;
        buffer.size = data?.byteLength || data;
      }
    }),

    deleteBuffer: vi.fn((buffer) => {
      state.buffers.delete(buffer);
    }),

    // ==========================================
    // Texture operations
    // ==========================================

    createTexture: vi.fn(() => {
      const id = generateId();
      state.textures.set(id, { id, width: 0, height: 0 });
      return id;
    }),

    bindTexture: vi.fn((target, texture) => {
      state.boundTextures.set(target, texture);
    }),

    texImage2D: vi.fn((target, level, internalformat, ...args) => {
      const textureId = state.boundTextures.get(target);
      const texture = state.textures.get(textureId);
      if (texture) {
        // Handle different overloads
        if (typeof args[0] === 'number') {
          texture.width = args[0];
          texture.height = args[1];
        } else if (args[0]?.width) {
          texture.width = args[0].width;
          texture.height = args[0].height;
        }
      }
    }),

    texParameteri: vi.fn(),
    texParameterf: vi.fn(),
    generateMipmap: vi.fn(),

    activeTexture: vi.fn(),

    deleteTexture: vi.fn((texture) => {
      state.textures.delete(texture);
    }),

    // ==========================================
    // Framebuffer operations
    // ==========================================

    createFramebuffer: vi.fn(() => {
      const id = generateId();
      state.framebuffers.set(id, { id, attachments: new Map() });
      return id;
    }),

    bindFramebuffer: vi.fn((target, framebuffer) => {
      state.boundFramebuffer = framebuffer;
    }),

    framebufferTexture2D: vi.fn((target, attachment, textarget, texture, level) => {
      const fb = state.framebuffers.get(state.boundFramebuffer);
      if (fb) fb.attachments.set(attachment, texture);
    }),

    checkFramebufferStatus: vi.fn(() => 0x8CD5), // FRAMEBUFFER_COMPLETE

    deleteFramebuffer: vi.fn((framebuffer) => {
      state.framebuffers.delete(framebuffer);
    }),

    // ==========================================
    // Renderbuffer operations
    // ==========================================

    createRenderbuffer: vi.fn(() => {
      const id = generateId();
      state.renderbuffers.set(id, { id });
      return id;
    }),

    bindRenderbuffer: vi.fn(),
    renderbufferStorage: vi.fn(),
    framebufferRenderbuffer: vi.fn(),

    deleteRenderbuffer: vi.fn((renderbuffer) => {
      state.renderbuffers.delete(renderbuffer);
    }),

    // ==========================================
    // Drawing
    // ==========================================

    drawArrays: vi.fn((mode, first, count) => {
      state.drawCalls.push({ type: 'drawArrays', mode, first, count });
    }),

    drawElements: vi.fn((mode, count, type, offset) => {
      state.drawCalls.push({ type: 'drawElements', mode, count, dataType: type, offset });
    }),

    // ==========================================
    // State management
    // ==========================================

    enable: vi.fn(),
    disable: vi.fn(),
    blendFunc: vi.fn(),
    blendFuncSeparate: vi.fn(),
    depthFunc: vi.fn(),
    depthMask: vi.fn(),
    cullFace: vi.fn(),
    frontFace: vi.fn(),
    scissor: vi.fn(),
    colorMask: vi.fn(),
    pixelStorei: vi.fn(),

    // ==========================================
    // Reading
    // ==========================================

    readPixels: vi.fn((x, y, width, height, format, type, pixels) => {
      // Fill with dummy data
      if (pixels) {
        for (let i = 0; i < pixels.length; i++) {
          pixels[i] = 128; // Gray
        }
      }
    }),

    // ==========================================
    // Test Helpers
    // ==========================================

    _state: state,

    _getProgram(id) {
      return state.programs.get(id);
    },

    _getShader(id) {
      return state.shaders.get(id);
    },

    _getTexture(id) {
      return state.textures.get(id);
    },

    _getDrawCalls() {
      return [...state.drawCalls];
    },

    _clearDrawCalls() {
      state.drawCalls.length = 0;
    },

    _setError(error) {
      state.error = error;
    },

    _reset() {
      state.programs.clear();
      state.shaders.clear();
      state.buffers.clear();
      state.textures.clear();
      state.framebuffers.clear();
      state.renderbuffers.clear();
      state.uniformLocations.clear();
      state.attribLocations.clear();
      state.boundTextures.clear();
      state.boundBuffers.clear();
      state.boundFramebuffer = null;
      state.currentProgram = null;
      state.drawCalls.length = 0;
      state.error = GL.NO_ERROR;
      vi.clearAllMocks();
    },
  };

  // Copy GL constants to context
  Object.assign(ctx, GL);

  return ctx;
}

/**
 * Creates a mock WebGL2 context (extends WebGL1)
 */
export function createWebGL2Context(options = {}) {
  const gl = createWebGLContext({ ...options, contextType: 'webgl2' });

  // Add WebGL2-specific methods
  Object.assign(gl, {
    // Vertex Array Objects
    createVertexArray: vi.fn(() => gl._state.nextId++),
    bindVertexArray: vi.fn(),
    deleteVertexArray: vi.fn(),

    // Uniform buffers
    createUniformBuffer: vi.fn(() => gl._state.nextId++),
    bindBufferBase: vi.fn(),
    uniformBlockBinding: vi.fn(),

    // Transform feedback
    createTransformFeedback: vi.fn(),
    bindTransformFeedback: vi.fn(),
    beginTransformFeedback: vi.fn(),
    endTransformFeedback: vi.fn(),

    // Queries
    createQuery: vi.fn(),
    beginQuery: vi.fn(),
    endQuery: vi.fn(),
    getQueryParameter: vi.fn(),

    // Sync
    fenceSync: vi.fn(),
    clientWaitSync: vi.fn(() => 0x911A), // ALREADY_SIGNALED

    // Textures
    texStorage2D: vi.fn(),
    texSubImage3D: vi.fn(),
    texImage3D: vi.fn(),
    copyTexSubImage3D: vi.fn(),
  });

  return gl;
}

/**
 * Installs WebGL mock on canvas prototype
 */
export function installWebGLMock() {
  const originalGetContext = HTMLCanvasElement.prototype.getContext;

  HTMLCanvasElement.prototype.getContext = vi.fn(function(type, options) {
    if (type === 'webgl' || type === 'experimental-webgl') {
      return createWebGLContext({
        width: this.width,
        height: this.height,
        ...options,
      });
    }
    if (type === 'webgl2') {
      return createWebGL2Context({
        width: this.width,
        height: this.height,
        ...options,
      });
    }
    return originalGetContext.call(this, type, options);
  });

  return () => {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
  };
}

export default {
  GL,
  createWebGLContext,
  createWebGL2Context,
  installWebGLMock,
};
