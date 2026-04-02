class Vector {
	constructor(x = 0, y = 0, z = 0) {
		this.x = x;
		this.y = y;
		this.z = z;
	}

	norm() {
		return Math.sqrt(this.norm2());
	}

	norm2() {
		return this.dot(this);
	}

	normalize() {
		let n = this.norm();
		this.x /= n;
		this.y /= n;
		this.z /= n;
	}

	unit() {
		let n = this.norm();
		let x = this.x / n;
		let y = this.y / n;
		let z = this.z / n;

		return new Vector(x, y, z);
	}

	isValid() {
		return !isNaN(this.x) && !isNaN(this.y) && !isNaN(this.z) &&
			isFinite(this.x) && isFinite(this.y) && isFinite(this.z);
	}

	incrementBy(v) {
		this.x += v.x;
		this.y += v.y;
		this.z += v.z;
	}

	decrementBy(v) {
		this.x -= v.x;
		this.y -= v.y;
		this.z -= v.z;
	}

	scaleBy(s) {
		this.x *= s;
		this.y *= s;
		this.z *= s;
	}

	divideBy(s) {
		this.scaleBy(1 / s);
	}

	plus(v) {
		return new Vector(this.x + v.x, this.y + v.y, this.z + v.z);
	}

	minus(v) {
		return new Vector(this.x - v.x, this.y - v.y, this.z - v.z);
	}

	times(s) {
		return new Vector(this.x * s, this.y * s, this.z * s);
	}

	over(s) {
		return this.times(1 / s);
	}

	negated() {
		return this.times(-1);
	}

	dot(v) {
		return this.x * v.x + this.y * v.y + this.z * v.z;
	}

	cross(v) {
		return new Vector(
			this.y * v.z - this.z * v.y,
			this.z * v.x - this.x * v.z,
			this.x * v.y - this.y * v.x);
	}
}

export default Vector;
