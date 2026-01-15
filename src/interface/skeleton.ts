import * as LinearAlgebra from '@/lib/linalg/linear-algebra.js';
let Vector = LinearAlgebra.Vector;
let Matrix = LinearAlgebra.DenseMatrix;

var graphlib = require("graphlib");

type Matrix = InstanceType<typeof Matrix>;
type Vector = InstanceType<typeof Vector>;

export class Skeleton {
    private skeleton_graph: typeof graphlib.Graph;
    private topology_order: number[] = [];
    private root_index: number;

    constructor(joints: Vector[], bones: [number, number][]) {
        this.skeleton_graph = new graphlib.Graph({ directed: false });

        for (let i = 0; i < joints.length; i++)
            this.skeleton_graph.setNode(i, {
                parent: -1,
                R: Matrix.identity(3, 3),
                T: joints[i]
            });
        
        for (let [x, y] of bones)
            this.skeleton_graph.setEdge(x, y);

        this.set_root(0);
    }
    
    root(): number {
        return this.root_index;
    }
    size(): number {
        return this.skeleton_graph.nodeCount();
    }
    node(x: number): { R: Matrix, T: Vector } {
        return {
            R: this.skeleton_graph.node(x).R,
            T: this.skeleton_graph.node(x).T,
        };
    }
    nodes(): number[] {
        return this.skeleton_graph.nodes().map(n => parseInt(n));
    }
    bones(): [number, number][] {
        return this.skeleton_graph.edges().map((e) => [
            parseInt(e.v),
            parseInt(e.w)
        ]);
    }
    hasBone(x: number, y: number): boolean {
        return this.skeleton_graph.hasEdge(x, y);
    }
    hasNode(x: number): boolean {
        return this.skeleton_graph.hasNode(x);
    }

    private update_bone_matrix(x: number): void {
        let p = this.skeleton_graph.node(x).parent;
        if (p >= 0) {
            let R_p = this.skeleton_graph.node(p).R;
            let T_p = this.skeleton_graph.node(p).T;
            let R_x = this.skeleton_graph.node(x).R;
            let T_x = this.skeleton_graph.node(x).T;

            let R_inv = R_p.transpose();
            let T_inv = T_x.minus(T_p);

            this.skeleton_graph.setEdge(p, x, {
                R: R_inv.timesDense(R_x),
                T: new Vector(
                    R_inv.get(0, 0) * T_inv.x + R_inv.get(0, 1) * T_inv.y + R_inv.get(0, 2) * T_inv.z,
                    R_inv.get(1, 0) * T_inv.x + R_inv.get(1, 1) * T_inv.y + R_inv.get(1, 2) * T_inv.z,
                    R_inv.get(2, 0) * T_inv.x + R_inv.get(2, 1) * T_inv.y + R_inv.get(2, 2) * T_inv.z
                )
            });
        }
    }
    private update_node_matrix(x: number): void {
        let p = this.skeleton_graph.node(x).parent;
        if (p >= 0) {
            let R_p = this.skeleton_graph.node(p).R;
            let T_p = this.skeleton_graph.node(p).T;
            let R_pk = this.skeleton_graph.edge(p, x).R;
            let T_pk = this.skeleton_graph.edge(p, x).T;

            this.skeleton_graph.node(x).R = R_p.timesDense(R_pk);
            this.skeleton_graph.node(x).T = new Vector(
                R_p.get(0, 0) * T_pk.x + R_p.get(0, 1) * T_pk.y + R_p.get(0, 2) * T_pk.z + T_p.x,
                R_p.get(1, 0) * T_pk.x + R_p.get(1, 1) * T_pk.y + R_p.get(1, 2) * T_pk.z + T_p.y,
                R_p.get(2, 0) * T_pk.x + R_p.get(2, 1) * T_pk.y + R_p.get(2, 2) * T_pk.z + T_p.z
            );
        }
    }

    private update_joint_frame_local_to_global(): void {
        for (const k of this.topology_order)
            this.update_node_matrix(k);
    }
    private update_joint_frame_global_to_local(): void {
        for (const k of this.topology_order)
            this.update_bone_matrix(k);
    }
    
    set_root(r: number) {
        let N = this.size();
        let pos = new Array(N).fill(-1);

        this.root_index = r;
        this.topology_order = graphlib.alg.preorder(this.skeleton_graph, String(this.root_index)).map(u => parseInt(u));
        this.topology_order.forEach((u, i) => {
            pos[u] = i;
        });
        this.skeleton_graph.node(this.topology_order[0]).parent = -1;
        this.skeleton_graph.edges().forEach((e) => {
            let x = parseInt(e.v);
            let y = parseInt(e.w);

            if (pos[x] < pos[y])
                [x, y] = [y, x];
            
            this.skeleton_graph.node(x).parent = y;
        });
        this.update_joint_frame_global_to_local();
    }
    set_position(x: number, T: Vector): void {
        let chain_idx = [x];
        let chain_pos = [this.skeleton_graph.node(x).T];
        let chain_len = [];

        while (true) {
            let u = chain_idx[chain_idx.length - 1];
            let p = this.skeleton_graph.node(u).parent;
            if (p < 0)
                break;

            let T_u = this.skeleton_graph.node(u).T;
            let T_p = this.skeleton_graph.node(p).T;
            
            chain_idx.push(p);
            chain_pos.push(T_p);
            chain_len.push(T_u.minus(T_p).norm());
        }
        let N = chain_idx.length;

        for (let _ = 0; _ < 4; ++_) {
            let chain_new = [T];

            for (let i = 1; i < N; ++i) {
                let dir = chain_pos[i].minus(chain_new[i-1]).unit();
                let len = chain_len[i-1];
                chain_new.push(chain_new[i-1].plus(dir.times(len)));
            }
            chain_new[N-1] = chain_pos[N-1];

            for (let i = N-2; i >= 0; --i) {
                let dir = chain_new[i].minus(chain_new[i+1]).unit();
                let len = chain_len[i];
                chain_new[i] = chain_new[i+1].plus(dir.times(len));
            }
            chain_pos = chain_new;
        }
        chain_pos[0] = this.skeleton_graph.node(x).T = T;

        for (let i = 1; i < N; ++i) {
            let dir = chain_pos[i].minus(chain_pos[i-1]).unit();
            let len = chain_len[i-1];

            this.skeleton_graph.node(chain_idx[i]).T = chain_pos[i] = chain_pos[i-1].plus(dir.times(len));
            this.update_bone_matrix(chain_idx[i-1]);
        }
        this.update_joint_frame_local_to_global();
    }
    set_rotation(x: number, R: Matrix): void {
        this.skeleton_graph.node(x).R = R;
        this.update_bone_matrix(x);
        this.update_joint_frame_local_to_global();
    }
}