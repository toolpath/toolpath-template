/**
 * A component as a STEP file, revolved from its published profile.
 *
 * Paul asked for a STEP per row on the bill (2026-08-31): what a shop wants is
 * a solid it can drop into CAM or a fixture model to check what fouls what.
 * Everything needed is already in the catalog — a cutter and a holder are
 * bodies of revolution, and every diameter and length on them is stated.
 *
 * **Faceted, and deliberately so.** The solid is a `manifold_solid_brep` of
 * planar triangles, the same form an STL-to-STEP conversion produces. A
 * cylindrical-surface B-rep would read as fewer, exact faces, but every face,
 * loop and orientation of it would be hand-plumbed against a standard nothing
 * here can check the output against; a triangulated shell is mechanically
 * generated and mechanically checkable — every edge shared by exactly two
 * faces, every loop closed — which is what the tests below assert.
 *
 * What is drawn is what the vendor stated. A component that publishes no
 * shape gets no file rather than a guessed cylinder.
 */

/** One step of a profile: everything from this height up is at this radius. */
export interface ProfileStep {
  readonly fromHeight: number
  readonly radius: number
}

/** How many facets go round: enough that a ⌀6 mm shank reads as round. */
const SEGMENTS = 48

interface Vertex {
  readonly x: number
  readonly y: number
  readonly z: number
}

/**
 * The profile as rings, bottom to top.
 *
 * A step change in radius becomes two rings at the same height — the shoulder
 * is a flat annulus, which is what a stepped tool actually has.
 */
const ringsOf = (steps: ReadonlyArray<ProfileStep>, top: number): Array<ProfileStep> => {
  const ordered = [...steps].sort((a, b) => a.fromHeight - b.fromHeight)
  const rings: Array<ProfileStep> = []
  for (const step of ordered) {
    if (step.radius <= 0 || step.fromHeight > top) {
      continue
    }
    const last = rings[rings.length - 1]
    if (last === undefined) {
      rings.push({ fromHeight: step.fromHeight, radius: step.radius })
      continue
    }
    if (step.fromHeight === last.fromHeight) {
      rings[rings.length - 1] = step
      continue
    }
    rings.push({ fromHeight: step.fromHeight, radius: last.radius })
    rings.push(step)
  }
  const last = rings[rings.length - 1]
  if (last === undefined || last.fromHeight >= top) {
    return rings
  }
  return [...rings, { fromHeight: top, radius: last.radius }]
}

/** The triangles of the revolved shell, wound outward. */
const meshOf = (
  rings: ReadonlyArray<ProfileStep>,
): { vertices: Array<Vertex>; triangles: Array<[number, number, number]> } => {
  const vertices: Array<Vertex> = []
  const triangles: Array<[number, number, number]> = []
  const around = (radius: number, height: number): Array<number> => {
    const start = vertices.length
    for (let at = 0; at < SEGMENTS; at += 1) {
      const angle = (2 * Math.PI * at) / SEGMENTS
      vertices.push({
        x: radius * Math.cos(angle),
        y: radius * Math.sin(angle),
        z: height,
      })
    }
    return Array.from({ length: SEGMENTS }, (_, at) => start + at)
  }

  const first = rings[0]
  const last = rings[rings.length - 1]
  if (first === undefined || last === undefined) {
    return { vertices, triangles }
  }

  const loops = rings.map((ring) => around(ring.radius, ring.fromHeight))
  for (let at = 0; at + 1 < loops.length; at += 1) {
    const lower = loops[at]
    const upper = loops[at + 1]
    if (lower === undefined || upper === undefined) {
      continue
    }
    for (let step = 0; step < SEGMENTS; step += 1) {
      const next = (step + 1) % SEGMENTS
      const a = lower[step]!
      const b = lower[next]!
      const c = upper[next]!
      const d = upper[step]!
      triangles.push([a, b, c], [a, c, d])
    }
  }

  // The caps: a fan from the axis at each end, wound so both point outward.
  const bottom = vertices.length
  vertices.push({ x: 0, y: 0, z: first.fromHeight })
  const top = vertices.length
  vertices.push({ x: 0, y: 0, z: last.fromHeight })
  const lowest = loops[0]!
  const highest = loops[loops.length - 1]!
  for (let step = 0; step < SEGMENTS; step += 1) {
    const next = (step + 1) % SEGMENTS
    triangles.push([bottom, lowest[next]!, lowest[step]!])
    triangles.push([top, highest[step]!, highest[next]!])
  }
  return { vertices, triangles }
}

/**
 * A number in STEP's own words.
 *
 * A REAL must carry a decimal point — `3` is an integer literal and a strict
 * reader refuses it where a coordinate is expected — so a whole number is
 * written `3.`, which is what every exporter emits.
 */
const real = (value: number): string => {
  const fixed = Number(value.toFixed(6)) + 0
  return Number.isInteger(fixed) ? `${String(fixed)}.` : String(fixed)
}

/**
 * The STEP text for one revolved component.
 *
 * @param name what the file calls the body — a catalog number
 * @param steps the profile, bottom-up, each step the radius from that height
 * @param top where the body ends, mm above the bottom of the profile
 * @returns the file, or null where there is no shape to write
 */
export const stepFile = (
  name: string,
  steps: ReadonlyArray<ProfileStep>,
  top: number,
): string | null => {
  const rings = ringsOf(steps, top)
  if (rings.length < 2) {
    return null
  }
  const { vertices, triangles } = meshOf(rings)
  if (triangles.length === 0) {
    return null
  }

  const lines: Array<string> = []
  let next = 1
  const write = (text: string): number => {
    const id = next
    next += 1
    lines.push(`#${String(id)}=${text};`)
    return id
  }

  const direction = (x: number, y: number, z: number) =>
    write(`DIRECTION('',(${real(x)},${real(y)},${real(z)}))`)
  const zAxis = direction(0, 0, 1)
  const xAxis = direction(1, 0, 0)
  const origin = write(`CARTESIAN_POINT('',(0.,0.,0.))`)
  const frame = write(
    `AXIS2_PLACEMENT_3D('',#${String(origin)},#${String(zAxis)},#${String(xAxis)})`,
  )

  const points = vertices.map((vertex) =>
    write(`CARTESIAN_POINT('',(${real(vertex.x)},${real(vertex.y)},${real(vertex.z)}))`),
  )
  const vertexIds = points.map((point) => write(`VERTEX_POINT('',#${String(point)})`))

  /** One edge per pair of vertices, shared by the two faces that meet on it. */
  const edges = new Map<string, number>()
  const edgeFor = (from: number, to: number): { id: number; forward: boolean } => {
    const key = from < to ? `${String(from)}:${String(to)}` : `${String(to)}:${String(from)}`
    const had = edges.get(key)
    const forward = from < to
    if (had !== undefined) {
      return { id: had, forward }
    }
    const low = forward ? from : to
    const high = forward ? to : from
    const a = vertices[low]!
    const b = vertices[high]!
    const along = direction(b.x - a.x, b.y - a.y, b.z - a.z)
    const start = write(`CARTESIAN_POINT('',(${real(a.x)},${real(a.y)},${real(a.z)}))`)
    const vector = write(`VECTOR('',#${String(along)},1.)`)
    const line = write(`LINE('',#${String(start)},#${String(vector)})`)
    const id = write(
      `EDGE_CURVE('',#${String(vertexIds[low]!)},#${String(vertexIds[high]!)},#${String(line)},.T.)`,
    )
    edges.set(key, id)
    return { id, forward }
  }

  const faces = triangles.map(([a, b, c]) => {
    const oriented = [
      [a, b],
      [b, c],
      [c, a],
    ].map(([from, to]) => {
      const edge = edgeFor(from!, to!)
      return write(`ORIENTED_EDGE('',*,*,#${String(edge.id)},${edge.forward ? '.T.' : '.F.'})`)
    })
    const loop = write(`EDGE_LOOP('',(${oriented.map((id) => `#${String(id)}`).join(',')}))`)
    const bound = write(`FACE_OUTER_BOUND('',#${String(loop)},.T.)`)
    const first = vertices[a]!
    const second = vertices[b]!
    const third = vertices[c]!
    const ux = { x: second.x - first.x, y: second.y - first.y, z: second.z - first.z }
    const vx = { x: third.x - first.x, y: third.y - first.y, z: third.z - first.z }
    const normal = {
      x: ux.y * vx.z - ux.z * vx.y,
      y: ux.z * vx.x - ux.x * vx.z,
      z: ux.x * vx.y - ux.y * vx.x,
    }
    const length = Math.hypot(normal.x, normal.y, normal.z) || 1
    const at = write(`CARTESIAN_POINT('',(${real(first.x)},${real(first.y)},${real(first.z)}))`)
    const up = direction(normal.x / length, normal.y / length, normal.z / length)
    const along = direction(ux.x, ux.y, ux.z)
    const placement = write(
      `AXIS2_PLACEMENT_3D('',#${String(at)},#${String(up)},#${String(along)})`,
    )
    const plane = write(`PLANE('',#${String(placement)})`)
    return write(`ADVANCED_FACE('',(#${String(bound)}),#${String(plane)},.T.)`)
  })

  const shell = write(`CLOSED_SHELL('',(${faces.map((id) => `#${String(id)}`).join(',')}))`)
  const solid = write(`MANIFOLD_SOLID_BREP('${name}',#${String(shell)})`)
  const millimetre = write(`( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.) )`)
  const angle = write(`( NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.) )`)
  const solidAngle = write(`( NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT() )`)
  const tolerance = write(
    `UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-06),#${String(millimetre)},'','')`,
  )
  const context = write(
    `( GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#${String(tolerance)})) GLOBAL_UNIT_ASSIGNED_CONTEXT((#${String(millimetre)},#${String(angle)},#${String(solidAngle)})) REPRESENTATION_CONTEXT('','3D') )`,
  )
  const shape = write(
    `ADVANCED_BREP_SHAPE_REPRESENTATION('${name}',(#${String(frame)},#${String(solid)}),#${String(context)})`,
  )
  const application = write(`APPLICATION_CONTEXT('automotive design')`)
  const productContext = write(`PRODUCT_CONTEXT('',#${String(application)},'mechanical')`)
  const product = write(`PRODUCT('${name}','${name}','',(#${String(productContext)}))`)
  const formation = write(`PRODUCT_DEFINITION_FORMATION('','',#${String(product)})`)
  const definitionContext = write(
    `PRODUCT_DEFINITION_CONTEXT('part definition',#${String(application)},'design')`,
  )
  const definition = write(
    `PRODUCT_DEFINITION('design','',#${String(formation)},#${String(definitionContext)})`,
  )
  const shaped = write(`PRODUCT_DEFINITION_SHAPE('','',#${String(definition)})`)
  write(`SHAPE_DEFINITION_REPRESENTATION(#${String(shaped)},#${String(shape)})`)

  return [
    'ISO-10303-21;',
    'HEADER;',
    `FILE_DESCRIPTION(('${name}'),'2;1');`,
    `FILE_NAME('${name}','',(''),(''),'Toolpath tool catalog','',''); `.trim(),
    "FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));",
    'ENDSEC;',
    'DATA;',
    ...lines,
    'ENDSEC;',
    'END-ISO-10303-21;',
    '',
  ].join('\n')
}
