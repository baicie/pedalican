import * as THREE from 'three';
import { TAU } from './math';

export interface EllipticalLoftSection {
  z: number;
  x?: number;
  y: number;
  rx: number;
  ry: number;
}

/**
 * A smooth tapered tube following a spline. Useful for the pelican's neck and
 * other organic limbs where a constant-radius TubeGeometry is too generic.
 */
export function createTaperedTube(
  points: THREE.Vector3[],
  radiusAt: (t: number) => number,
  tubularSegments = 24,
  radialSegments = 10,
): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.45);
  const frames = curve.computeFrenetFrames(tubularSegments, false);
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= tubularSegments; i += 1) {
    const t = i / tubularSegments;
    const center = curve.getPoint(t);
    const normal = frames.normals[i] as THREE.Vector3;
    const binormal = frames.binormals[i] as THREE.Vector3;
    const radius = radiusAt(t);

    for (let j = 0; j <= radialSegments; j += 1) {
      const angle = (j / radialSegments) * TAU;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      positions.push(
        center.x + (normal.x * cos + binormal.x * sin) * radius,
        center.y + (normal.y * cos + binormal.y * sin) * radius,
        center.z + (normal.z * cos + binormal.z * sin) * radius,
      );
      uvs.push(t, j / radialSegments);
    }
  }

  const row = radialSegments + 1;
  for (let i = 0; i < tubularSegments; i += 1) {
    for (let j = 0; j < radialSegments; j += 1) {
      const a = i * row + j;
      const b = (i + 1) * row + j;
      const c = (i + 1) * row + j + 1;
      const d = i * row + j + 1;
      indices.push(a, b, d, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Elliptical cross-sections lofted along local Z. A versatile builder for beaks,
 * pouches, shoes, and other hand-modeled organic shapes.
 */
export function createEllipticalLoft(
  sections: readonly EllipticalLoftSection[],
  radialSegments = 12,
  capStart = true,
  capEnd = true,
): THREE.BufferGeometry {
  if (sections.length < 2) throw new Error('An elliptical loft needs at least two sections.');
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const row = radialSegments + 1;

  sections.forEach((section, sectionIndex) => {
    const x = section.x ?? 0;
    for (let j = 0; j <= radialSegments; j += 1) {
      const angle = (j / radialSegments) * TAU;
      positions.push(
        x + Math.cos(angle) * section.rx,
        section.y + Math.sin(angle) * section.ry,
        section.z,
      );
      uvs.push(sectionIndex / (sections.length - 1), j / radialSegments);
    }
  });

  for (let i = 0; i < sections.length - 1; i += 1) {
    for (let j = 0; j < radialSegments; j += 1) {
      const a = i * row + j;
      const b = (i + 1) * row + j;
      const c = (i + 1) * row + j + 1;
      const d = i * row + j + 1;
      indices.push(a, b, d, b, c, d);
    }
  }

  const first = sections[0] as EllipticalLoftSection;
  const last = sections[sections.length - 1] as EllipticalLoftSection;
  if (capStart) {
    const centerIndex = positions.length / 3;
    positions.push(first.x ?? 0, first.y, first.z);
    uvs.push(0, 0.5);
    for (let j = 0; j < radialSegments; j += 1) {
      indices.push(centerIndex, j + 1, j);
    }
  }
  if (capEnd) {
    const offset = (sections.length - 1) * row;
    const centerIndex = positions.length / 3;
    positions.push(last.x ?? 0, last.y, last.z);
    uvs.push(1, 0.5);
    for (let j = 0; j < radialSegments; j += 1) {
      indices.push(centerIndex, offset + j, offset + j + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** A flattened leaf/feather with a pointed tip, modelled in local XY and extruded. */
export function createFeatherGeometry(length: number, width: number, thickness = 0.016): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.bezierCurveTo(width * 0.54, length * 0.13, width * 0.6, length * 0.48, 0, length);
  shape.bezierCurveTo(-width * 0.6, length * 0.48, -width * 0.54, length * 0.13, 0, 0);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
    steps: 1,
  });
  geometry.translate(0, 0, -thickness * 0.5);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * A softer, rounded covert feather. Body plumage and small wing coverts read
 * much better with a blunt tip than with the knife-point primary shape.
 */
export function createSoftFeatherGeometry(
  length: number,
  width: number,
  thickness = 0.014,
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.bezierCurveTo(width * 0.62, length * 0.16, width * 0.7, length * 0.58, width * 0.42, length * 0.83);
  shape.quadraticCurveTo(width * 0.22, length * 0.99, 0, length);
  shape.quadraticCurveTo(-width * 0.22, length * 0.99, -width * 0.42, length * 0.83);
  shape.bezierCurveTo(-width * 0.7, length * 0.58, -width * 0.62, length * 0.16, 0, 0);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
    steps: 1,
  });
  geometry.translate(0, 0, -thickness * 0.5);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * A broad, gently folded palm frond. Three vertex columns give the blade a
 * central ridge; alternating edge widths add a subtle leafy serration.
 */
export function createPalmFrondGeometry(length = 3.4, width = 0.48): THREE.BufferGeometry {
  const segmentCount = 14;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= segmentCount; i += 1) {
    const t = i / segmentCount;
    const taper = Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.03)), 0.52);
    const serration = i === 0 || i === segmentCount ? 0.72 : 0.86 + Math.sin(i * 2.35) * 0.16;
    const halfWidth = Math.max(0.025, width * taper * serration);
    const y = t * length;
    const bend = Math.sin(t * Math.PI * 0.62) * 0.22 - t * t * 0.18;
    const z = bend;
    // Left, raised centre, right. The fold catches light much better than a
    // flat plane and avoids the "stylised green lollipop" palm look.
    positions.push(-halfWidth, y, z - 0.02);
    positions.push(0, y + 0.018, z + 0.055);
    positions.push(halfWidth, y, z - 0.02);
  }

  for (let i = 0; i < segmentCount; i += 1) {
    const base = i * 3;
    const next = (i + 1) * 3;
    indices.push(base, next, base + 1, next, next + 1, base + 1);
    indices.push(base + 1, next + 1, base + 2, next + 1, next + 2, base + 2);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function makeCylinderBetween(
  start: THREE.Vector3,
  end: THREE.Vector3,
  radius: number,
  material: THREE.Material,
  radialSegments = 8,
): THREE.Mesh {
  const direction = new THREE.Vector3().subVectors(end, start);
  const geometry = new THREE.CylinderGeometry(radius, radius, direction.length(), radialSegments, 1);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return mesh;
}

export function makeTaperedCylinderBetween(
  start: THREE.Vector3,
  end: THREE.Vector3,
  radiusStart: number,
  radiusEnd: number,
  material: THREE.Material,
  radialSegments = 8,
): THREE.Mesh {
  const direction = new THREE.Vector3().subVectors(end, start);
  const geometry = new THREE.CylinderGeometry(radiusEnd, radiusStart, direction.length(), radialSegments, 1);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return mesh;
}

/**
 * Concatenates simple indexed or non-indexed geometry attributes. Intended for
 * small procedural assemblies such as palm fronds, not arbitrary multi-material
 * meshes.
 */
export function mergeSimpleGeometries(
  geometries: readonly THREE.BufferGeometry[],
  attributes: readonly string[] = ['position', 'normal'],
): THREE.BufferGeometry {
  const sources = geometries.map((geometry) => (geometry.index ? geometry.toNonIndexed() : geometry));
  const merged = new THREE.BufferGeometry();
  for (const attributeName of attributes) {
    const arrays: Float32Array[] = [];
    let itemSize = 0;
    for (const geometry of sources) {
      const attribute = geometry.getAttribute(attributeName);
      if (!attribute) continue;
      itemSize = attribute.itemSize;
      arrays.push(new Float32Array(attribute.array as ArrayLike<number>));
    }
    if (arrays.length === 0) continue;
    const totalElements = arrays.reduce((sum, array) => sum + array.length, 0);
    const combined = new Float32Array(totalElements);
    let offset = 0;
    for (const array of arrays) {
      combined.set(array, offset);
      offset += array.length;
    }
    merged.setAttribute(attributeName, new THREE.BufferAttribute(combined, itemSize));
  }
  return merged;
}

export function setShadows(object: THREE.Object3D, cast = true, receive = true): void {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = cast;
      child.receiveShadow = receive;
    }
  });
}

export function disposeObject3D(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      if (object.geometry) geometries.add(object.geometry);
      const material = object.material;
      if (Array.isArray(material)) {
        material.forEach((entry) => materials.add(entry));
      } else if (material) {
        materials.add(material);
      }
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => {
    for (const value of Object.values(material)) {
      if (value instanceof THREE.Texture) value.dispose();
    }
    material.dispose();
  });
}

export function damp(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}
