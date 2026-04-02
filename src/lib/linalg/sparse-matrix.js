import memoryManager from './emscripten-memory-manager.js';
import DenseMatrix from './dense-matrix.js';

const Module = window.Module;

class SparseMatrix {
	constructor(data) {
		this.data = data;
		memoryManager.objectList.push(this);
	}

	delete() {
		this.data.delete();
	}

	static fromTriplet(T) {
		return new SparseMatrix(new Module.SparseMatrix(T.data));
	}

	static identity(m, n) {
		return new SparseMatrix(Module.SparseMatrix.identity(m, n));
	}

	static diag(d) {
		return new SparseMatrix(Module.SparseMatrix.diag(d.data));
	}

	transpose() {
		return new SparseMatrix(this.data.transpose());
	}

	invertDiagonal() {
		let N = this.nRows();
		let X = this.timesDense(DenseMatrix.ones(N, 1));
		let T = new Triplet(N, N);
		for (let i = 0; i < N; i++) {
			T.addEntry(1 / X.get(i, 0), i, i);
		}
		return SparseMatrix.fromTriplet(T);
	}

	nRows() {
		return this.data.nRows();
	}

	nCols() {
		return this.data.nCols();
	}

	nnz() {
		return this.data.nnz();
	}

	frobeniusNorm() {
		return this.data.frobeniusNorm();
	}

	subMatrix(r0, r1, c0, c1) {
		return new SparseMatrix(this.data.subMatrix(r0, r1, c0, c1));
	}

	chol() {
		return new Cholesky(this.data.chol());
	}

	lu() {
		return new LU(this.data.lu());
	}

	qr() {
		return new QR(this.data.qr());
	}

	toDense() {
		return new DenseMatrix(this.data.toDense());
	}

	incrementBy(B) {
		this.data.incrementBy(B.data);
	}

	decrementBy(B) {
		this.data.decrementBy(B.data);
	}

	scaleBy(s) {
		this.data.scaleBy(s);
	}

	plus(B) {
		return new SparseMatrix(this.data.plus(B.data));
	}

	minus(B) {
		return new SparseMatrix(this.data.minus(B.data));
	}

	timesReal(s) {
		return new SparseMatrix(this.data.timesReal(s));
	}

	timesDense(X) {
		return new DenseMatrix(this.data.timesDense(X.data));
	}

	timesSparse(B) {
		return new SparseMatrix(this.data.timesSparse(B.data));
	}
}

class Triplet {
	constructor(m, n) {
		this.data = new Module.Triplet(m, n);
		memoryManager.objectList.push(this);
	}

	delete() {
		this.data.delete();
	}

	addEntry(x, i, j) {
		this.data.addEntry(i, j, x);
	}
}

class Cholesky {
	constructor(data) {
		this.data = data;
	}

	solvePositiveDefinite(b) {
		return new DenseMatrix(this.data.solvePositiveDefinite(b.data));
	}
}

class LU {
	constructor(data) {
		this.data = data;
	}

	solveSquare(b) {
		return new DenseMatrix(this.data.solveSquare(b.data));
	}
}

class QR {
	constructor(data) {
		this.data = data;
	}

	solve(b) {
		return new DenseMatrix(this.data.solve(b.data));
	}
}

export { SparseMatrix, Triplet };
