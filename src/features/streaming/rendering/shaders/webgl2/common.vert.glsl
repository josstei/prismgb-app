/**
 * Common Vertex Shader (WebGL2 - GLSL ES 3.0)
 *
 * Shared vertex shader for all fragment passes.
 * Renders a full-screen triangle (more efficient than quad).
 */

#version 300 es
precision highp float;

// Output to fragment shader
out vec2 vUV;

void main() {
  // Generate full-screen triangle from vertex ID
  // Using a single triangle that covers the entire screen is more efficient
  // than a quad because it avoids the diagonal edge and reduces overdraw
  //
  // Vertex 0: (-1, -1) UV (0, 0) - bottom left
  // Vertex 1: (3, -1)  UV (2, 0) - far right (off screen)
  // Vertex 2: (-1, 3)  UV (0, 2) - far top (off screen)
  //
  // The triangle extends beyond the screen bounds, but GPU clips it

  vec2 positions[3] = vec2[3](
    vec2(-1.0, -1.0),  // bottom-left
    vec2(3.0, -1.0),   // bottom-right (extended)
    vec2(-1.0, 3.0)    // top-left (extended)
  );

  vec2 uvs[3] = vec2[3](
    vec2(0.0, 0.0),    // bottom-left
    vec2(2.0, 0.0),    // bottom-right (extended)
    vec2(0.0, 2.0)     // top-left (extended)
  );

  gl_Position = vec4(positions[gl_VertexID], 0.0, 1.0);
  vUV = uvs[gl_VertexID];
}
