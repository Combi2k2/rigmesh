import * as THREE from 'three';
import { Vec3 } from '@/interface';
import { MeshData, SkelData, SkinnedMeshData } from '@/interface';
import {
    buildMesh,
    buildSkel,
    setSkinWeights,
    getSkinWeights,
    extractMeshData,
    extractSkelData,
    skinnedMeshFromData,
    skinnedMeshToData,
} from '@/utils/threeMesh';

// ---------------------------------------------------------------------------
// Helpers: minimal mesh & skeleton fixtures
// ---------------------------------------------------------------------------

/** A single-triangle mesh in the XY plane. */
function makeTriangleMesh(): MeshData {
    const verts = [
        new Vec3(0, 0, 0),
        new Vec3(1, 0, 0),
        new Vec3(0, 1, 0),
    ];
    const faces = [[0, 1, 2]];
    return [verts, faces];
}

/** A quad (two triangles) for slightly richer tests. */
function makeQuadMesh(): MeshData {
    const verts = [
        new Vec3(0, 0, 0),
        new Vec3(1, 0, 0),
        new Vec3(1, 1, 0),
        new Vec3(0, 1, 0),
    ];
    const faces = [
        [0, 1, 2],
        [0, 2, 3],
    ];
    return [verts, faces];
}

/** Two joints connected by a single bone along the X axis. */
function makeSimpleSkel(): SkelData {
    const joints = [new Vec3(0, 0, 0), new Vec3(1, 0, 0)];
    const bones: [number, number][] = [[0, 1]];
    return [joints, bones];
}

/** Three joints in a chain: 0 -- 1 -- 2, along the X axis. */
function makeChainSkel(): SkelData {
    const joints = [
        new Vec3(0, 0, 0),
        new Vec3(1, 0, 0),
        new Vec3(2, 0, 0),
    ];
    const bones: [number, number][] = [[0, 1], [1, 2]];
    return [joints, bones];
}

/** Build a fully assembled SkinnedMesh with skeleton bound and userData.bones set. */
function assembleSkinnedMesh(
    meshData: MeshData,
    skelData: SkelData,
): THREE.SkinnedMesh {
    const mesh = buildMesh(meshData, true) as THREE.SkinnedMesh;
    const skel = buildSkel(skelData);

    // Store bone pairs in userData (used by setSkinWeights / extractSkelData)
    mesh.userData.bones = skelData[1];

    // Placeholder skin attributes so bind() doesn't complain
    const nV = meshData[0].length;
    mesh.geometry.setAttribute(
        'skinWeight',
        new THREE.Float32BufferAttribute(new Array(nV * 4).fill(0), 4),
    );
    mesh.geometry.setAttribute(
        'skinIndex',
        new THREE.Uint16BufferAttribute(new Array(nV * 4).fill(0), 4),
    );

    mesh.add(skel.bones[0]);
    mesh.bind(skel);
    mesh.updateMatrixWorld(true);

    return mesh;
}

// ---------------------------------------------------------------------------
// buildMesh
// ---------------------------------------------------------------------------
describe('buildMesh', () => {
    const meshData = makeTriangleMesh();

    it('returns a SkinnedMesh when skin=true (default)', () => {
        const result = buildMesh(meshData);
        expect(result).toBeInstanceOf(THREE.SkinnedMesh);
    });

    it('returns a plain Mesh when skin=false', () => {
        const result = buildMesh(meshData, false);
        expect(result).toBeInstanceOf(THREE.Mesh);
        expect(result).not.toBeInstanceOf(THREE.SkinnedMesh);
    });

    it('sets correct vertex positions', () => {
        const result = buildMesh(meshData);
        const posAttr = result.geometry.getAttribute('position') as THREE.BufferAttribute;

        expect(posAttr.count).toBe(3);
        expect(posAttr.getX(0)).toBe(0);
        expect(posAttr.getY(0)).toBe(0);
        expect(posAttr.getZ(0)).toBe(0);
        expect(posAttr.getX(1)).toBe(1);
        expect(posAttr.getY(1)).toBe(0);
        expect(posAttr.getX(2)).toBe(0);
        expect(posAttr.getY(2)).toBe(1);
    });

    it('sets correct face indices', () => {
        const result = buildMesh(meshData);
        const index = result.geometry.getIndex()!;

        expect(index).not.toBeNull();
        expect(index.count).toBe(3);
        expect([index.getX(0), index.getX(1), index.getX(2)]).toEqual([0, 1, 2]);
    });

    it('computes vertex normals', () => {
        const result = buildMesh(meshData);
        const normals = result.geometry.getAttribute('normal');
        expect(normals).toBeDefined();
        expect(normals.count).toBe(3);
    });

    it('handles a quad mesh with two faces', () => {
        const quad = makeQuadMesh();
        const result = buildMesh(quad);
        const posAttr = result.geometry.getAttribute('position') as THREE.BufferAttribute;
        const index = result.geometry.getIndex()!;

        expect(posAttr.count).toBe(4);
        expect(index.count).toBe(6); // 2 triangles * 3 indices
    });
});

// ---------------------------------------------------------------------------
// buildSkel
// ---------------------------------------------------------------------------
describe('buildSkel', () => {
    it('creates correct number of bones', () => {
        const skelData = makeSimpleSkel();
        const skel = buildSkel(skelData);
        expect(skel.bones.length).toBe(2);
    });

    it('sets bone positions from joint data', () => {
        const skelData = makeSimpleSkel();
        const skel = buildSkel(skelData);

        expect(skel.bones[0].position.x).toBe(0);
        expect(skel.bones[1].position.x).toBe(1);
    });

    it('establishes parent-child hierarchy', () => {
        const skelData = makeChainSkel();
        const skel = buildSkel(skelData);

        // Root bone (0) should have bone 1 as child
        expect(skel.bones[0].children).toContain(skel.bones[1]);
        // Bone 1 should have bone 2 as child
        expect(skel.bones[1].children).toContain(skel.bones[2]);
    });

    it('handles single-joint skeleton (no bones)', () => {
        const skelData: SkelData = [[new Vec3(0, 0, 0)], []];
        const skel = buildSkel(skelData);
        expect(skel.bones.length).toBe(1);
    });

    it('uses custom root parameter', () => {
        // Chain 0--1--2, root at 1 means 1 is the parent of both 0 and 2
        const skelData = makeChainSkel();
        const skel = buildSkel(skelData, 1);

        expect(skel.bones[1].children).toContain(skel.bones[0]);
        expect(skel.bones[1].children).toContain(skel.bones[2]);
        expect(skel.bones[0].children.length).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// extractMeshData
// ---------------------------------------------------------------------------
describe('extractMeshData', () => {
    it('round-trips vertex positions through build → extract', () => {
        const original = makeTriangleMesh();
        const mesh = buildMesh(original, false);
        mesh.updateMatrixWorld(true);

        const extracted = extractMeshData(mesh);

        expect(extracted[0].length).toBe(3);
        for (let i = 0; i < 3; i++) {
            expect(extracted[0][i].x).toBeCloseTo(original[0][i].x, 5);
            expect(extracted[0][i].y).toBeCloseTo(original[0][i].y, 5);
            expect(extracted[0][i].z).toBeCloseTo(original[0][i].z, 5);
        }
    });

    it('round-trips face indices through build → extract', () => {
        const original = makeQuadMesh();
        const mesh = buildMesh(original, false);
        mesh.updateMatrixWorld(true);

        const extracted = extractMeshData(mesh);

        expect(extracted[1].length).toBe(2);
        expect(extracted[1][0]).toEqual([0, 1, 2]);
        expect(extracted[1][1]).toEqual([0, 2, 3]);
    });

    it('applies matrixWorld to extracted positions', () => {
        const original = makeTriangleMesh();
        const mesh = buildMesh(original, false);
        mesh.position.set(10, 20, 30);
        mesh.updateMatrixWorld(true);

        const extracted = extractMeshData(mesh);

        // Vertex 0 was at (0,0,0), should now be at (10,20,30)
        expect(extracted[0][0].x).toBeCloseTo(10, 5);
        expect(extracted[0][0].y).toBeCloseTo(20, 5);
        expect(extracted[0][0].z).toBeCloseTo(30, 5);
    });
});

// ---------------------------------------------------------------------------
// extractSkelData
// ---------------------------------------------------------------------------
describe('extractSkelData', () => {
    it('extracts joint world positions', () => {
        const meshData = makeTriangleMesh();
        const skelData = makeSimpleSkel();
        const mesh = assembleSkinnedMesh(meshData, skelData);

        const [joints] = extractSkelData(mesh);

        expect(joints.length).toBe(2);
        expect(joints[0].x).toBeCloseTo(0, 5);
        expect(joints[1].x).toBeCloseTo(1, 5);
    });

    it('extracts bone pairs from userData.bones', () => {
        const meshData = makeTriangleMesh();
        const skelData = makeChainSkel();
        const mesh = assembleSkinnedMesh(meshData, skelData);

        const [, bones] = extractSkelData(mesh);

        expect(bones.length).toBe(2);
        expect(bones[0]).toEqual([0, 1]);
        expect(bones[1]).toEqual([1, 2]);
    });
});

// ---------------------------------------------------------------------------
// setSkinWeights / getSkinWeights round-trip
// ---------------------------------------------------------------------------
describe('setSkinWeights + getSkinWeights', () => {
    it('stores and retrieves per-bone skin weights', () => {
        const meshData = makeTriangleMesh();
        const skelData = makeSimpleSkel();
        const mesh = assembleSkinnedMesh(meshData, skelData);

        const inputWeights = [[1.0], [0.5], [0.3]];
        setSkinWeights(mesh, inputWeights, null);

        const { skinWeights, skinIndices } = getSkinWeights(mesh);

        expect(skinWeights.length).toBe(3);
        expect(skinIndices.length).toBe(3);

        // Each vertex should have its original weight preserved
        for (let i = 0; i < 3; i++) {
            expect(skinWeights[i][0]).toBeCloseTo(inputWeights[i][0], 5);
        }
    });

    it('sets skinWeight buffer attribute with 4 components per vertex', () => {
        const meshData = makeTriangleMesh();
        const skelData = makeSimpleSkel();
        const mesh = assembleSkinnedMesh(meshData, skelData);

        setSkinWeights(mesh, [[1], [1], [1]], null);

        const attr = mesh.geometry.getAttribute('skinWeight') as THREE.BufferAttribute;
        expect(attr).toBeDefined();
        expect(attr.itemSize).toBe(4);
        expect(attr.count).toBe(3);
    });

    it('getSkinWeights returns a deep copy (not aliased)', () => {
        const meshData = makeTriangleMesh();
        const skelData = makeSimpleSkel();
        const mesh = assembleSkinnedMesh(meshData, skelData);

        setSkinWeights(mesh, [[1], [1], [1]], null);

        const result1 = getSkinWeights(mesh);
        const result2 = getSkinWeights(mesh);

        // Different object references
        expect(result1.skinWeights).not.toBe(result2.skinWeights);
        expect(result1.skinWeights[0]).not.toBe(result2.skinWeights[0]);

        // Mutating one should not affect the other
        result1.skinWeights[0][0] = 999;
        expect(result2.skinWeights[0][0]).not.toBe(999);
    });
});

// ---------------------------------------------------------------------------
// skinnedMeshFromData
// ---------------------------------------------------------------------------
describe('skinnedMeshFromData', () => {
    function makeSkinnedMeshData(): SkinnedMeshData {
        return {
            mesh: makeTriangleMesh(),
            skel: makeSimpleSkel(),
            skinWeights: [[], [], []],
            skinIndices: null,
        };
    }

    it('returns a SkinnedMesh', () => {
        const data = makeSkinnedMeshData();
        const mesh = skinnedMeshFromData(data);
        expect(mesh).toBeInstanceOf(THREE.SkinnedMesh);
    });

    it('has a bound skeleton', () => {
        const data = makeSkinnedMeshData();
        const mesh = skinnedMeshFromData(data);
        expect(mesh.skeleton).toBeDefined();
        expect(mesh.skeleton.bones.length).toBe(2);
    });

    it('centers geometry around centroid', () => {
        const data = makeSkinnedMeshData();
        // Centroid of triangle (0,0,0),(1,0,0),(0,1,0) is (1/3, 1/3, 0)
        const mesh = skinnedMeshFromData(data);

        expect(mesh.position.x).toBeCloseTo(1 / 3, 4);
        expect(mesh.position.y).toBeCloseTo(1 / 3, 4);
        expect(mesh.position.z).toBeCloseTo(0, 4);
    });

    it('creates default single-joint skeleton when no bones provided', () => {
        const data: SkinnedMeshData = {
            mesh: makeTriangleMesh(),
            skel: [[], []],
            skinWeights: [[], [], []],
            skinIndices: null,
        };
        const mesh = skinnedMeshFromData(data);
        expect(mesh.skeleton.bones.length).toBe(1);
    });

    it('has no NaN in position attribute', () => {
        const data = makeSkinnedMeshData();
        const mesh = skinnedMeshFromData(data);
        const posAttr = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;

        for (let i = 0; i < posAttr.count; i++) {
            expect(Number.isNaN(posAttr.getX(i))).toBe(false);
            expect(Number.isNaN(posAttr.getY(i))).toBe(false);
            expect(Number.isNaN(posAttr.getZ(i))).toBe(false);
        }
    });

    it('has no NaN in skinWeight attribute', () => {
        const data = makeSkinnedMeshData();
        const mesh = skinnedMeshFromData(data);
        const attr = mesh.geometry.getAttribute('skinWeight') as THREE.BufferAttribute;

        for (let i = 0; i < attr.count; i++) {
            for (let j = 0; j < 4; j++) {
                expect(Number.isNaN(attr.getComponent(i, j))).toBe(false);
            }
        }
    });

    it('stores bone pairs in userData.bones', () => {
        const data = makeSkinnedMeshData();
        const mesh = skinnedMeshFromData(data);

        expect(mesh.userData.bones).toBeDefined();
        expect(mesh.userData.bones.length).toBe(1);
        expect(mesh.userData.bones[0]).toEqual([0, 1]);
    });

});

// ---------------------------------------------------------------------------
// skinnedMeshToData (round-trip with skinnedMeshFromData)
// ---------------------------------------------------------------------------
describe('skinnedMeshToData', () => {
    it('round-trips vertex count', () => {
        const original: SkinnedMeshData = {
            mesh: makeTriangleMesh(),
            skel: makeSimpleSkel(),
            skinWeights: [[], [], []],
            skinIndices: null,
        };
        const mesh = skinnedMeshFromData(original);
        const data = skinnedMeshToData(mesh);

        expect(data.mesh[0].length).toBe(3);
    });

    it('round-trips face count', () => {
        const original: SkinnedMeshData = {
            mesh: makeQuadMesh(),
            skel: makeSimpleSkel(),
            skinWeights: [[], [], [], []],
            skinIndices: null,
        };
        const mesh = skinnedMeshFromData(original);
        const data = skinnedMeshToData(mesh);

        expect(data.mesh[1].length).toBe(2);
    });

    it('round-trips joint count', () => {
        const original: SkinnedMeshData = {
            mesh: makeTriangleMesh(),
            skel: makeChainSkel(),
            skinWeights: [[], [], []],
            skinIndices: null,
        };
        const mesh = skinnedMeshFromData(original);
        const data = skinnedMeshToData(mesh);

        expect(data.skel[0].length).toBe(3);
        expect(data.skel[1].length).toBe(2);
    });

    it('preserves vertex positions in world space', () => {
        const origVerts = [
            new Vec3(0, 0, 0),
            new Vec3(1, 0, 0),
            new Vec3(0, 1, 0),
        ];
        const original: SkinnedMeshData = {
            mesh: [origVerts.map(v => new Vec3(v.x, v.y, v.z)), [[0, 1, 2]]],
            skel: makeSimpleSkel(),
            skinWeights: [[], [], []],
            skinIndices: null,
        };
        const mesh = skinnedMeshFromData(original);
        const data = skinnedMeshToData(mesh);

        // After centering + world transform they should come back close to originals
        for (let i = 0; i < 3; i++) {
            expect(data.mesh[0][i].x).toBeCloseTo(origVerts[i].x, 1);
            expect(data.mesh[0][i].y).toBeCloseTo(origVerts[i].y, 1);
            expect(data.mesh[0][i].z).toBeCloseTo(origVerts[i].z, 1);
        }
    });

    it('returns skinWeights and skinIndices arrays', () => {
        const original: SkinnedMeshData = {
            mesh: makeTriangleMesh(),
            skel: makeSimpleSkel(),
            skinWeights: [[], [], []],
            skinIndices: null,
        };
        const mesh = skinnedMeshFromData(original);
        const data = skinnedMeshToData(mesh);

        expect(data.skinWeights).toBeDefined();
        expect(data.skinIndices).toBeDefined();
        expect(data.skinWeights.length).toBe(3);
        expect(data.skinIndices.length).toBe(3);
    });
});

// ---------------------------------------------------------------------------
// Data → Mesh → Data round-trip identity tests
// ---------------------------------------------------------------------------
describe('fromData → toData round-trip identity', () => {
    const PRECISION = 4; // decimal places for position comparison

    // NOTE: skinnedMeshFromData mutates its input (centering via decrementBy),
    // so we snapshot the original values before calling it.

    /** Deep-clone a SkinnedMeshData so the original survives mutation. */
    function cloneData(d: SkinnedMeshData): SkinnedMeshData {
        return {
            mesh: [
                d.mesh[0].map(v => new Vec3(v.x, v.y, v.z)),
                d.mesh[1].map(f => [...f]),
            ],
            skel: [
                d.skel[0].map(j => new Vec3(j.x, j.y, j.z)),
                (d.skel[1] as [number, number][]).map(b => [...b] as [number, number]),
            ],
            skinWeights: d.skinWeights.map(w => [...w]),
            skinIndices: d.skinIndices ? d.skinIndices.map(i => [...i]) : null,
        };
    }

    /** Assert vertex arrays match within tolerance. */
    function expectVertsClose(actual: Vec3[], expected: Vec3[], precision: number) {
        expect(actual.length).toBe(expected.length);
        for (let i = 0; i < expected.length; i++) {
            expect(actual[i].x).toBeCloseTo(expected[i].x, precision);
            expect(actual[i].y).toBeCloseTo(expected[i].y, precision);
            expect(actual[i].z).toBeCloseTo(expected[i].z, precision);
        }
    }

    /** Assert face arrays match exactly. */
    function expectFacesEqual(actual: number[][], expected: number[][]) {
        expect(actual.length).toBe(expected.length);
        for (let i = 0; i < expected.length; i++) {
            expect(actual[i]).toEqual(expected[i]);
        }
    }

    /** Run a full round-trip and assert identity. */
    function runRoundTrip(label: string, makeData: () => SkinnedMeshData) {
        describe(label, () => {
            let original: SkinnedMeshData;
            let result: SkinnedMeshData;

            beforeAll(() => {
                const data = makeData();
                original = cloneData(data);
                const mesh = skinnedMeshFromData(data);
                result = skinnedMeshToData(mesh);
            });

            it('preserves vertex positions', () => {
                expectVertsClose(
                    result.mesh[0] as Vec3[],
                    original.mesh[0] as Vec3[],
                    PRECISION,
                );
            });

            it('preserves face indices', () => {
                expectFacesEqual(result.mesh[1], original.mesh[1]);
            });

            it('preserves joint positions', () => {
                expectVertsClose(
                    result.skel[0] as Vec3[],
                    original.skel[0] as Vec3[],
                    PRECISION,
                );
            });

            it('preserves bone pairs', () => {
                expect(result.skel[1]).toEqual(original.skel[1]);
            });

            it('preserves skin weight / index array shapes', () => {
                expect(result.skinWeights.length).toBe(original.skinWeights.length);
                expect(result.skinIndices!.length).toBe(original.mesh[0].length);
            });

            it('has no NaN in any output field', () => {
                for (const v of result.mesh[0] as Vec3[]) {
                    expect(Number.isFinite(v.x)).toBe(true);
                    expect(Number.isFinite(v.y)).toBe(true);
                    expect(Number.isFinite(v.z)).toBe(true);
                }
                for (const j of result.skel[0] as Vec3[]) {
                    expect(Number.isFinite(j.x)).toBe(true);
                    expect(Number.isFinite(j.y)).toBe(true);
                    expect(Number.isFinite(j.z)).toBe(true);
                }
            });
        });
    }

    // -----------------------------------------------------------------------
    // Sample 1: Single triangle + single bone (simplest case)
    // -----------------------------------------------------------------------
    runRoundTrip('sample 1: triangle + single bone', () => ({
        mesh: [
            [new Vec3(0, 0, 0), new Vec3(1, 0, 0), new Vec3(0, 1, 0)],
            [[0, 1, 2]],
        ],
        skel: [
            [new Vec3(0, 0, 0), new Vec3(1, 0, 0)],
            [[0, 1]],
        ],
        skinWeights: [[], [], []],
        skinIndices: null,
    }));

    // -----------------------------------------------------------------------
    // Sample 2: Quad + 3-joint chain skeleton
    // -----------------------------------------------------------------------
    runRoundTrip('sample 2: quad + chain skeleton', () => ({
        mesh: [
            [
                new Vec3(0, 0, 0),
                new Vec3(2, 0, 0),
                new Vec3(2, 2, 0),
                new Vec3(0, 2, 0),
            ],
            [[0, 1, 2], [0, 2, 3]],
        ],
        skel: [
            [new Vec3(0, 0, 0), new Vec3(1, 0, 0), new Vec3(2, 0, 0)],
            [[0, 1], [1, 2]],
        ],
        skinWeights: [[], [], [], []],
        skinIndices: null,
    }));

    // -----------------------------------------------------------------------
    // Sample 3: 3D pyramid (non-planar, Z depth)
    // -----------------------------------------------------------------------
    runRoundTrip('sample 3: 3D pyramid', () => ({
        mesh: [
            [
                new Vec3(0, 0, 0),
                new Vec3(1, 0, 0),
                new Vec3(0.5, 1, 0),
                new Vec3(0.5, 0.3, 1),   // apex above the base
            ],
            [
                [0, 1, 2],   // base
                [0, 1, 3],   // front
                [1, 2, 3],   // right
                [2, 0, 3],   // left
            ],
        ],
        skel: [
            [new Vec3(0.5, 0.3, 0), new Vec3(0.5, 0.3, 1)],
            [[0, 1]],
        ],
        skinWeights: [[], [], [], []],
        skinIndices: null,
    }));

    // -----------------------------------------------------------------------
    // Sample 4: Mesh far from origin (tests centering round-trip)
    // -----------------------------------------------------------------------
    runRoundTrip('sample 4: offset mesh (far from origin)', () => ({
        mesh: [
            [
                new Vec3(100, 200, 300),
                new Vec3(101, 200, 300),
                new Vec3(100, 201, 300),
            ],
            [[0, 1, 2]],
        ],
        skel: [
            [new Vec3(100, 200, 300), new Vec3(101, 200, 300)],
            [[0, 1]],
        ],
        skinWeights: [[], [], []],
        skinIndices: null,
    }));

    // -----------------------------------------------------------------------
    // Sample 5: L-shaped mesh with branching skeleton
    // -----------------------------------------------------------------------
    runRoundTrip('sample 5: L-shape + branching skeleton', () => ({
        mesh: [
            [
                new Vec3(0, 0, 0),   // 0
                new Vec3(1, 0, 0),   // 1
                new Vec3(1, 2, 0),   // 2
                new Vec3(0, 2, 0),   // 3
                new Vec3(1, 2, 0),   // 4 (shared edge vertex)
                new Vec3(3, 2, 0),   // 5
                new Vec3(3, 3, 0),   // 6
                new Vec3(1, 3, 0),   // 7
            ],
            [
                [0, 1, 2], [0, 2, 3],   // vertical bar
                [4, 5, 6], [4, 6, 7],   // horizontal bar
            ],
        ],
        skel: [
            [
                new Vec3(0.5, 0, 0),   // 0: bottom
                new Vec3(0.5, 2, 0),   // 1: elbow (root)
                new Vec3(3, 2.5, 0),   // 2: right tip
            ],
            [[1, 0], [1, 2]],          // star from joint 1
        ],
        skinWeights: [[], [], [], [], [], [], [], []],
        skinIndices: null,
    }));

    // -----------------------------------------------------------------------
    // Sample 6: Negative coordinates + 4-joint chain
    // -----------------------------------------------------------------------
    runRoundTrip('sample 6: negative coords + 4-joint chain', () => ({
        mesh: [
            [
                new Vec3(-2, -1, -0.5),
                new Vec3( 2, -1, -0.5),
                new Vec3( 2,  1, -0.5),
                new Vec3(-2,  1, -0.5),
                new Vec3(-2, -1,  0.5),
                new Vec3( 2, -1,  0.5),
                new Vec3( 2,  1,  0.5),
                new Vec3(-2,  1,  0.5),
            ],
            [
                [0, 1, 2], [0, 2, 3],   // front
                [4, 5, 6], [4, 6, 7],   // back
                [0, 1, 5], [0, 5, 4],   // bottom
                [2, 3, 7], [2, 7, 6],   // top
            ],
        ],
        skel: [
            [
                new Vec3(-2, 0, 0),
                new Vec3(-0.5, 0, 0),
                new Vec3( 0.5, 0, 0),
                new Vec3( 2, 0, 0),
            ],
            [[0, 1], [1, 2], [2, 3]],
        ],
        skinWeights: [[], [], [], [], [], [], [], []],
        skinIndices: null,
    }));
});

// ---------------------------------------------------------------------------
// extract(transform(fromData(data_v0))) === transform(data_v0)
//
// For each sample, we:
//   1. Snapshot data_v0 (vertices + joints)
//   2. Apply a transform matrix T to data_v0 directly → "expected"
//   3. Build a mesh from data_v0, apply the same T via mesh.position/rotation/scale,
//      updateMatrixWorld, then extract → "actual"
//   4. Assert actual === expected
// ---------------------------------------------------------------------------
describe('extracted transformed mesh equals directly transformed data', () => {
    const PRECISION = 4;

    /** Apply a THREE.Matrix4 to a Vec3, returning a new Vec3. */
    function applyMatrix(v: Vec3, m: THREE.Matrix4): Vec3 {
        const tv = new THREE.Vector3(v.x, v.y, v.z).applyMatrix4(m);
        return new Vec3(tv.x, tv.y, tv.z);
    }

    /** Transform data_v0 directly: apply matrix to all verts and joints. */
    function transformData(data: SkinnedMeshData, m: THREE.Matrix4): SkinnedMeshData {
        return {
            mesh: [
                data.mesh[0].map(v => applyMatrix(v as Vec3, m)),
                data.mesh[1].map(f => [...f]),
            ],
            skel: [
                (data.skel[0] as Vec3[]).map(j => applyMatrix(j, m)),
                (data.skel[1] as [number, number][]).map(b => [...b] as [number, number]),
            ],
            skinWeights: data.skinWeights.map(w => [...w]),
            skinIndices: data.skinIndices ? data.skinIndices.map(i => [...i]) : null,
        };
    }

    /** Deep-clone so skinnedMeshFromData's mutation doesn't clobber our snapshot. */
    function cloneData(d: SkinnedMeshData): SkinnedMeshData {
        return {
            mesh: [
                d.mesh[0].map(v => new Vec3(v.x, v.y, v.z)),
                d.mesh[1].map(f => [...f]),
            ],
            skel: [
                d.skel[0].map(j => new Vec3(j.x, j.y, j.z)),
                (d.skel[1] as [number, number][]).map(b => [...b] as [number, number]),
            ],
            skinWeights: d.skinWeights.map(w => [...w]),
            skinIndices: d.skinIndices ? d.skinIndices.map(i => [...i]) : null,
        };
    }

    /**
     * Build the world-space matrix that Three.js would compute for a mesh
     * created by skinnedMeshFromData (which sets mesh.position = centroid)
     * after applying a user transform on top.
     *
     * We replicate this by constructing a THREE.Object3D, setting the same
     * position / rotation / scale, and reading its matrixWorld.
     */
    function buildWorldMatrix(
        centroid: THREE.Vector3,
        opts: { translate?: THREE.Vector3; rotate?: THREE.Euler; scale?: THREE.Vector3 },
    ): THREE.Matrix4 {
        const obj = new THREE.Object3D();
        // skinnedMeshFromData sets mesh.position to the centroid
        obj.position.copy(centroid);
        // Then user applies transforms on top
        if (opts.translate) {
            obj.position.x += opts.translate.x;
            obj.position.y += opts.translate.y;
            obj.position.z += opts.translate.z;
        }
        if (opts.rotate)  obj.rotation.copy(opts.rotate);
        if (opts.scale)   obj.scale.copy(opts.scale);
        obj.updateMatrixWorld(true);
        return obj.matrixWorld.clone();
    }

    /** Compute centroid of vertices. */
    function centroidOf(verts: Vec3[]): THREE.Vector3 {
        const c = new THREE.Vector3();
        for (const v of verts) c.add(new THREE.Vector3(v.x, v.y, v.z));
        c.divideScalar(verts.length);
        return c;
    }

    /**
     * The core test runner.
     *
     * For a given data_v0 + transform, we:
     *  - Compute the full matrixWorld (centroid positioning + user transform)
     *  - Build a "reference matrix" that maps original world points to the
     *    transformed world. Since skinnedMeshFromData centers geometry around
     *    the centroid, the effective world transform for any original point p is:
     *        p' = matrixWorld * inv(T_centroid) * p
     *    where T_centroid is the translation-only matrix for the centroid.
     *    But it's simpler to just let Three.js do it: build the mesh, apply the
     *    transform, extract, and compare against transformData(data_v0, M).
     *
     *  We build M by composing: translate(-centroid), then scale, then rotate,
     *  then translate(centroid + userTranslate). This matches Three.js's TRS order.
     */
    function runTransformTest(
        label: string,
        makeData: () => SkinnedMeshData,
        opts: { translate?: THREE.Vector3; rotate?: THREE.Euler; scale?: THREE.Vector3 },
    ) {
        describe(label, () => {
            let expected: SkinnedMeshData;
            let actual: SkinnedMeshData;

            beforeAll(() => {
                const data_v0 = makeData();
                const snapshot = cloneData(data_v0);

                // --- "actual": build mesh, transform, extract ---
                const meshInput = cloneData(data_v0);
                const mesh = skinnedMeshFromData(meshInput);
                if (opts.translate) {
                    mesh.position.x += opts.translate.x;
                    mesh.position.y += opts.translate.y;
                    mesh.position.z += opts.translate.z;
                }
                if (opts.rotate)  mesh.rotation.copy(opts.rotate);
                if (opts.scale)   mesh.scale.copy(opts.scale);
                mesh.updateMatrixWorld(true);
                actual = skinnedMeshToData(mesh);

                // --- "expected": apply the same matrixWorld to data_v0 directly ---
                // Reconstruct the exact same matrix Three.js built for the mesh.
                const centroid = centroidOf(snapshot.mesh[0] as Vec3[]);
                const worldMat = buildWorldMatrix(centroid, opts);

                // The mesh stores centered local positions. extractMeshData does
                // localPos.applyMatrix4(matrixWorld), which is equivalent to
                // worldMat * (originalPos - centroid).
                // So the effective mapping for an original world point p is:
                //   p' = worldMat * (p - centroid)
                // We build a single matrix for this:
                const toCentered = new THREE.Matrix4().makeTranslation(
                    -centroid.x, -centroid.y, -centroid.z,
                );
                const fullTransform = worldMat.clone().multiply(toCentered);

                expected = transformData(snapshot, fullTransform);
            });

            it('vertex positions match', () => {
                expect(actual.mesh[0].length).toBe(expected.mesh[0].length);
                for (let i = 0; i < expected.mesh[0].length; i++) {
                    expect(actual.mesh[0][i].x).toBeCloseTo(expected.mesh[0][i].x, PRECISION);
                    expect(actual.mesh[0][i].y).toBeCloseTo(expected.mesh[0][i].y, PRECISION);
                    expect(actual.mesh[0][i].z).toBeCloseTo(expected.mesh[0][i].z, PRECISION);
                }
            });

            it('joint positions match', () => {
                expect(actual.skel[0].length).toBe(expected.skel[0].length);
                for (let i = 0; i < expected.skel[0].length; i++) {
                    expect(actual.skel[0][i].x).toBeCloseTo(expected.skel[0][i].x, PRECISION);
                    expect(actual.skel[0][i].y).toBeCloseTo(expected.skel[0][i].y, PRECISION);
                    expect(actual.skel[0][i].z).toBeCloseTo(expected.skel[0][i].z, PRECISION);
                }
            });

            it('face indices identical', () => {
                expect(actual.mesh[1]).toEqual(expected.mesh[1]);
            });

            it('bone pairs identical', () => {
                expect(actual.skel[1]).toEqual(expected.skel[1]);
            });

            it('no NaN in vertices or joints', () => {
                for (const v of actual.mesh[0] as Vec3[]) {
                    expect(Number.isFinite(v.x)).toBe(true);
                    expect(Number.isFinite(v.y)).toBe(true);
                    expect(Number.isFinite(v.z)).toBe(true);
                }
                for (const j of actual.skel[0] as Vec3[]) {
                    expect(Number.isFinite(j.x)).toBe(true);
                    expect(Number.isFinite(j.y)).toBe(true);
                    expect(Number.isFinite(j.z)).toBe(true);
                }
            });
        });
    }

    // -- Sample data factories --

    function triangleData(): SkinnedMeshData {
        return {
            mesh: [
                [new Vec3(0, 0, 0), new Vec3(1, 0, 0), new Vec3(0, 1, 0)],
                [[0, 1, 2]],
            ],
            skel: [
                [new Vec3(0, 0, 0), new Vec3(1, 0, 0)],
                [[0, 1]],
            ],
            skinWeights: [[], [], []],
            skinIndices: null,
        };
    }

    function quadChainData(): SkinnedMeshData {
        return {
            mesh: [
                [new Vec3(0, 0, 0), new Vec3(2, 0, 0), new Vec3(2, 2, 0), new Vec3(0, 2, 0)],
                [[0, 1, 2], [0, 2, 3]],
            ],
            skel: [
                [new Vec3(0, 0, 0), new Vec3(1, 0, 0), new Vec3(2, 0, 0)],
                [[0, 1], [1, 2]],
            ],
            skinWeights: [[], [], [], []],
            skinIndices: null,
        };
    }

    function pyramidData(): SkinnedMeshData {
        return {
            mesh: [
                [new Vec3(0, 0, 0), new Vec3(1, 0, 0), new Vec3(0.5, 1, 0), new Vec3(0.5, 0.3, 1)],
                [[0, 1, 2], [0, 1, 3], [1, 2, 3], [2, 0, 3]],
            ],
            skel: [
                [new Vec3(0.5, 0.3, 0), new Vec3(0.5, 0.3, 1)],
                [[0, 1]],
            ],
            skinWeights: [[], [], [], []],
            skinIndices: null,
        };
    }

    function offsetData(): SkinnedMeshData {
        return {
            mesh: [
                [new Vec3(100, 200, 300), new Vec3(101, 200, 300), new Vec3(100, 201, 300)],
                [[0, 1, 2]],
            ],
            skel: [
                [new Vec3(100, 200, 300), new Vec3(101, 200, 300)],
                [[0, 1]],
            ],
            skinWeights: [[], [], []],
            skinIndices: null,
        };
    }

    // -- Translation --

    runTransformTest('triangle + translation',      triangleData,  { translate: new THREE.Vector3(5, -3, 7) });
    runTransformTest('quad+chain + translation',     quadChainData, { translate: new THREE.Vector3(5, -3, 7) });
    runTransformTest('pyramid + translation',        pyramidData,   { translate: new THREE.Vector3(5, -3, 7) });
    runTransformTest('offset mesh + translation',    offsetData,    { translate: new THREE.Vector3(-50, 10, 0) });

    // -- Uniform scale --

    runTransformTest('triangle + uniform scale x3',  triangleData,  { scale: new THREE.Vector3(3, 3, 3) });
    runTransformTest('quad+chain + uniform scale x3', quadChainData, { scale: new THREE.Vector3(3, 3, 3) });
    runTransformTest('pyramid + uniform scale x0.5', pyramidData,   { scale: new THREE.Vector3(0.5, 0.5, 0.5) });

    // -- Rotation --

    runTransformTest('triangle + 90° Z rotation',   triangleData,  { rotate: new THREE.Euler(0, 0, Math.PI / 2) });
    runTransformTest('pyramid + 45° X rotation',     pyramidData,   { rotate: new THREE.Euler(Math.PI / 4, 0, 0) });
    runTransformTest('quad+chain + 180° Y rotation', quadChainData, { rotate: new THREE.Euler(0, Math.PI, 0) });

    // -- Combined transforms --

    runTransformTest('triangle + translate + rotate + scale', triangleData, {
        translate: new THREE.Vector3(10, -5, 3),
        rotate: new THREE.Euler(0, 0, Math.PI / 2),
        scale: new THREE.Vector3(2, 2, 2),
    });

    runTransformTest('pyramid + full 3-axis rotation + scale + translate', pyramidData, {
        translate: new THREE.Vector3(50, -30, 10),
        rotate: new THREE.Euler(Math.PI / 4, Math.PI / 6, Math.PI / 3),
        scale: new THREE.Vector3(2.5, 2.5, 2.5),
    });

    runTransformTest('offset mesh + combined transform', offsetData, {
        translate: new THREE.Vector3(-100, -200, -300),
        rotate: new THREE.Euler(0, Math.PI / 2, 0),
        scale: new THREE.Vector3(0.1, 0.1, 0.1),
    });

    runTransformTest('quad+chain + non-uniform scale + rotation', quadChainData, {
        rotate: new THREE.Euler(0, 0, Math.PI / 3),
        scale: new THREE.Vector3(2, 0.5, 1),
    });
});
