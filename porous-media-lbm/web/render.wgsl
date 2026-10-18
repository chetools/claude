// Draws the lattice straight from the simulation buffers: one fragment per cell.
// mode 0: speed |u|, 1: vorticity, 2: tracer concentration, 3: pressure (rho - 1) / 3

struct View { nx: u32, ny: u32, mode: u32, pad: u32, vmax: f32, p0: f32, p1: f32, p2: f32 };

@group(0) @binding(0) var<uniform> V: View;
@group(0) @binding(1) var<storage, read> fields: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> solid: array<u32>;

struct VOut { @builtin(position) pos: vec4<f32> };

@vertex
fn vs(@builtin(vertex_index) i: u32) -> VOut {
  // one triangle that covers the whole canvas
  var p = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
  var o: VOut;
  o.pos = vec4<f32>(p[i], 0.0, 1.0);
  return o;
}

// viridis, polynomial fit (Matt Zucker, CC0)
fn viridis(t: f32) -> vec3<f32> {
  let c0 = vec3<f32>(0.2777273272, 0.0054073445, 0.3340998053);
  let c1 = vec3<f32>(0.1050930431, 1.4046134720, 1.3845901620);
  let c2 = vec3<f32>(-0.3308618287, 0.2148475595, 0.0950952280);
  let c3 = vec3<f32>(-4.6342304990, -5.7991009740, -19.3324409200);
  let c4 = vec3<f32>(6.2282699360, 14.1799333600, 56.6905526000);
  let c5 = vec3<f32>(4.7763849320, -13.7451453600, -65.3530326300);
  let c6 = vec3<f32>(-5.4354558530, 4.6458526150, 26.3124352500);
  return c0 + t * (c1 + t * (c2 + t * (c3 + t * (c4 + t * (c5 + t * c6)))));
}

// diverging blue - white - red for signed fields, t in [-1, 1]
fn diverging(t: f32) -> vec3<f32> {
  let blue = vec3<f32>(0.23, 0.30, 0.75);
  let red = vec3<f32>(0.71, 0.02, 0.15);
  let white = vec3<f32>(0.97, 0.97, 0.97);
  if (t < 0.0) { return mix(white, blue, -t); }
  return mix(white, red, t);
}

fn at(x: i32, y: i32) -> vec4<f32> {
  let nx = i32(V.nx);
  let ny = i32(V.ny);
  return fields[u32(((y + ny) % ny) * nx + (x + nx) % nx)];
}

@fragment
fn fs(in: VOut) -> @location(0) vec4<f32> {
  let x = i32(in.pos.x);
  let y = i32(V.ny) - 1 - i32(in.pos.y);        // y up
  let idx = u32(y) * V.nx + u32(x);
  if (solid[idx] != 0u) { return vec4<f32>(0.36, 0.38, 0.44, 1.0); }
  let q = fields[idx];
  var col: vec3<f32>;
  if (V.mode == 0u) {
    col = viridis(clamp(length(q.xy) / V.vmax, 0.0, 1.0));
  } else if (V.mode == 1u) {
    let w = 0.5 * ((at(x + 1, y).y - at(x - 1, y).y) - (at(x, y + 1).x - at(x, y - 1).x));
    col = diverging(clamp(w / V.vmax, -1.0, 1.0));
  } else if (V.mode == 2u) {
    col = viridis(clamp(q.w / V.vmax, 0.0, 1.0));
  } else {
    col = diverging(clamp((q.z - 1.0) / 3.0 / V.vmax, -1.0, 1.0));
  }
  return vec4<f32>(col, 1.0);
}
