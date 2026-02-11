import Queue from './misc';

var graphlib = require("graphlib");
var cdt2d = require('cdt2d');

const Graph = graphlib.Graph;
type Graph = InstanceType<typeof Graph>;

export function expand(g: Graph, src: number[], dst: number): [number[], number[]] {
    const visited = new Set<number>();
    const queue = new Queue();
    const layer = [];
    const expand = [];

    for (let u of src) {
        queue.push(u);
        visited.add(u);
    }
    for (let i = 0; i < dst; i++) {
        let size = queue.size();
        while (size--) {
            let u = queue.pop();
            expand.push(u);

            for (let e of g.outEdges(u)) {
                let v = Number(e.w);
                if (!visited.has(v)) {
                    visited.add(v);
                    queue.push(v);
                }
            }
        }
    }
    while (queue.size() > 0) {
        let u = queue.pop();
        layer.push(u);
    }
    return [expand, layer];
}
export function extraceBoundaryLoops(g: Graph): number[][] {
    const edgeMap = new Map<String, [number, number]>();
    const tmpGraph = new Graph();

    for (let e of g.edges()) {
        const u = Number(e.v);
        const v = Number(e.w);
        const key = u < v ? u + '-' + v : v + '-' + u;

        if (!edgeMap.has(key)) {
            edgeMap.set(key, [v, u]);
        } else {
            edgeMap.delete(key);
        }
    }
    for (let [_, [u, v]] of edgeMap)
        tmpGraph.setEdge(u, v);
    
    const componenets = graphlib.alg.components(tmpGraph);
    const boundaryLoops = [];
    componenets.forEach(component => {
        const node = component[0];
        const loop = graphlib.alg.preorder(tmpGraph, node).map(x => Number(x));
        boundaryLoops.push(loop);
    });

    return boundaryLoops;
}