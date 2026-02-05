import { BasePipeline, type BasePipelineConfig } from '../base-pipeline';
import { loadShaders, type WebGL2Shaders } from './webgl2-shader-loader';

export class WebGL2Pipeline extends BasePipeline {
  private gl: WebGL2RenderingContext | null = null;
  private programs: WebGLProgram[] = [];
  private framebuffers: WebGLFramebuffer[] = [];
  private textures: WebGLTexture[] = [];
  private sourceTexture: WebGLTexture | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private shaders: WebGL2Shaders | null = null;

  async initialize(): Promise<void> {
    if (this._isInitialized) return;

    this.gl = (this.canvas as HTMLCanvasElement).getContext('webgl2', {
      alpha: false,
      desynchronized: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true
    });

    if (!this.gl) {
      throw new Error('WebGL2 context not available');
    }

    this.shaders = loadShaders();
    this.createPrograms();
    this.createGeometry();
    this.createTextures();
    this.createFramebuffers();

    this._isInitialized = true;
    this._isActive = true;
  }

  private createPrograms(): void {
    if (!this.gl || !this.shaders) return;

    const fragmentShaders = [
      this.shaders.pixelUpscale,
      this.shaders.unsharpMask,
      this.shaders.colorElevation,
      this.shaders.crtLcd
    ];

    for (const fragSrc of fragmentShaders) {
      const program = this.createProgram(this.shaders.vertex, fragSrc);
      if (program) {
        this.programs.push(program);
      }
    }
  }

  private createProgram(vertSrc: string, fragSrc: string): WebGLProgram | null {
    if (!this.gl) return null;

    const vert = this.compileShader(this.gl.VERTEX_SHADER, vertSrc);
    const frag = this.compileShader(this.gl.FRAGMENT_SHADER, fragSrc);
    if (!vert || !frag) return null;

    const program = this.gl.createProgram();
    if (!program) return null;

    this.gl.attachShader(program, vert);
    this.gl.attachShader(program, frag);
    this.gl.linkProgram(program);

    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      console.error('Program link error:', this.gl.getProgramInfoLog(program));
      return null;
    }

    this.gl.deleteShader(vert);
    this.gl.deleteShader(frag);
    return program;
  }

  private compileShader(type: number, source: string): WebGLShader | null {
    if (!this.gl) return null;

    const shader = this.gl.createShader(type);
    if (!shader) return null;

    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);

    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', this.gl.getShaderInfoLog(shader));
      this.gl.deleteShader(shader);
      return null;
    }

    return shader;
  }

  private createGeometry(): void {
    if (!this.gl) return;

    this.vao = this.gl.createVertexArray();
    this.gl.bindVertexArray(this.vao);

    const positions = new Float32Array([
      -1, -1, 0, 0,
       1, -1, 1, 0,
      -1,  1, 0, 1,
       1,  1, 1, 1
    ]);

    const buffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, positions, this.gl.STATIC_DRAW);

    this.gl.enableVertexAttribArray(0);
    this.gl.vertexAttribPointer(0, 2, this.gl.FLOAT, false, 16, 0);
    this.gl.enableVertexAttribArray(1);
    this.gl.vertexAttribPointer(1, 2, this.gl.FLOAT, false, 16, 8);

    this.gl.bindVertexArray(null);
  }

  private createTextures(): void {
    if (!this.gl) return;

    // Source texture for video frame
    this.sourceTexture = this.createTexture(this.nativeWidth, this.nativeHeight);

    // Intermediate textures for multi-pass
    const scaleFactor = this.uniforms.upscale.scaleFactor;
    const scaledWidth = this.nativeWidth * scaleFactor;
    const scaledHeight = this.nativeHeight * scaleFactor;

    this.textures = [
      this.createTexture(scaledWidth, scaledHeight)!,
      this.createTexture(scaledWidth, scaledHeight)!,
      this.createTexture(this.outputWidth, this.outputHeight)!
    ];
  }

  private createTexture(width: number, height: number): WebGLTexture | null {
    if (!this.gl) return null;

    const texture = this.gl.createTexture();
    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
    this.gl.texImage2D(
      this.gl.TEXTURE_2D, 0, this.gl.RGBA,
      width, height, 0,
      this.gl.RGBA, this.gl.UNSIGNED_BYTE, null
    );
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);

    return texture;
  }

  private createFramebuffers(): void {
    if (!this.gl) return;

    this.framebuffers = this.textures.map(texture => {
      const fb = this.gl!.createFramebuffer()!;
      this.gl!.bindFramebuffer(this.gl!.FRAMEBUFFER, fb);
      this.gl!.framebufferTexture2D(
        this.gl!.FRAMEBUFFER, this.gl!.COLOR_ATTACHMENT0,
        this.gl!.TEXTURE_2D, texture, 0
      );
      return fb;
    });

    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
  }

  renderFrame(source: TexImageSource): void {
    if (!this._isActive || !this.gl || !this.sourceTexture) return;

    const startTime = performance.now();

    // Upload source texture
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.sourceTexture);
    this.gl.texImage2D(
      this.gl.TEXTURE_2D, 0, this.gl.RGBA,
      this.gl.RGBA, this.gl.UNSIGNED_BYTE, source
    );

    this.gl.bindVertexArray(this.vao);

    // Execute 4-pass pipeline
    // Pass 1: Upscale
    // Pass 2: Unsharp (if enabled)
    // Pass 3: Color
    // Pass 4: CRT/LCD to screen

    // Simplified: just render to screen for now
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    this.gl.viewport(0, 0, this.outputWidth, this.outputHeight);
    this.gl.useProgram(this.programs[0]);
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.sourceTexture);
    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);

    this.gl.bindVertexArray(null);
    this.updateStats(performance.now() - startTime);
  }

  async captureFrame(): Promise<ImageBitmap> {
    return createImageBitmap(this.canvas as ImageBitmapSource);
  }

  protected onUniformsChanged(): void {
    // Update uniform values in programs
  }

  protected onResize(): void {
    this.releaseTextures();
    this.createTextures();
    this.createFramebuffers();
  }

  private releaseTextures(): void {
    if (!this.gl) return;
    this.textures.forEach(t => this.gl!.deleteTexture(t));
    this.framebuffers.forEach(f => this.gl!.deleteFramebuffer(f));
    this.textures = [];
    this.framebuffers = [];
  }

  releaseResources(): void {
    this.releaseTextures();
    if (this.gl && this.sourceTexture) {
      this.gl.deleteTexture(this.sourceTexture);
      this.sourceTexture = null;
    }
    this._isActive = false;
  }

  async dispose(): Promise<void> {
    this.releaseResources();
    this.programs.forEach(p => this.gl?.deleteProgram(p));
    this.programs = [];
    if (this.gl && this.vao) {
      this.gl.deleteVertexArray(this.vao);
      this.vao = null;
    }
    this.gl?.getExtension('WEBGL_lose_context')?.loseContext();
    this.gl = null;
    this._isInitialized = false;
  }
}
