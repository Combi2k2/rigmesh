import memoryManager from './emscripten-memory-manager.js';

const Module = window.Module;

class DenseMatrix {
	constructor(data) {
		this.data = data;
		memoryManager.objectList.push(this);
	}

	delete() {
		this.data.delete();
	}

	static zeros(m, n = 1) {
		return new DenseMatrix(new Module.DenseMatrix(m, n));
	}

	static identity(m, n = 1) {
		return new DenseMatrix(Module.DenseMatrix.identity(m, n));
	}

	static ones(m, n = 1) {
		return new DenseMatrix(Module.DenseMatrix.ones(m, n));
	}

	static constant(x, m, n = 1) {
		return new DenseMatrix(Module.DenseMatrix.constant(m, n, x));
	}

	static random(m, n = 1) {
		return new DenseMatrix(Module.DenseMatrix.random(m, n));
	}

	transpose() {
		return new DenseMatrix(this.data.transpose());
	}

	nRows() {
		return this.data.nRows();
	}

	nCols() {
		return this.data.nCols();
	}

	norm(n = 2) {
		return this.data.norm(n);
	}

	rank() {
		return this.data.rank();
	}

	sum() {
		return this.data.sum();
	}

	subMatrix(r0, r1, c0 = 0, c1 = 1) {
		return new DenseMatrix(this.data.subMatrix(r0, r1, c0, c1));
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
		return new DenseMatrix(this.data.plus(B.data));
	}

	minus(B) {
		return new DenseMatrix(this.data.minus(B.data));
	}

	timesReal(s) {
		return new DenseMatrix(this.data.timesReal(s));
	}

	timesDense(B) {
		return new DenseMatrix(this.data.timesDense(B.data));
	}

	negated() {
		return new DenseMatrix(this.data.negated());
	}

	get(i, j = 0) {
		return this.data.get(i, j);
	}

	set(x, i, j = 0) {
		this.data.set(i, j, x);
	}

	hcat(B) {
		return new DenseMatrix(this.data.hcat(B.data));
	}

	vcat(B) {
		return new DenseMatrix(this.data.vcat(B.data));
	}
}

export default DenseMatrix;
