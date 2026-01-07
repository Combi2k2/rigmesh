const Vector = require('@/lib/linalg/vector');

export { Vector as Vec3 };
export type Vec3 = InstanceType<typeof Vector>;

export class Vec2 {
	/**
	 * This class represents an element of Euclidean 2-space, along with all the usual
	 * vector space operations (addition, multiplication by scalars, etc.).
	 * @constructor Vec2
	 * @property {number} x The x component of this vector. Default value is 0.
	 * @property {number} y The y component of this vector. Default value is 0.
	 */
	public x: number;
	public y: number;
	constructor(x = 0, y = 0) {
		this.x = x;
		this.y = y;
	}

	/**
	 * Computes the Euclidean length of this vector.
	 * @method Vec2#norm
	 * @returns {number}
	 */
	norm() {
		return Math.sqrt(this.norm2());
	}

	/**
	 * Computes the Euclidean length squared of this vector.
	 * @method Vec2#norm2
	 * @returns {number}
	 */
	norm2() {
		return this.dot(this);
	}

	/**
	 * Divides this vector by its Euclidean length.
	 * @method Vec2#normalize
	 */
	normalize() {
		let n = this.norm();
		this.x /= n;
		this.y /= n;
	}

	/**
	 * Returns a normalized copy of this vector.
	 * @method Vec2#unit
	 * @returns {Vec2}
	 */
	unit() {
		let n = this.norm();
		let x = this.x / n;
		let y = this.y / n;

		return new Vec2(x, y);
	}

	/**
	 * Checks whether this vector's components are finite.
	 * @method Vec2#isValid
	 * @returns {boolean}
	 */
	isValid() {
		return !isNaN(this.x) && !isNaN(this.y) &&
			isFinite(this.x) && isFinite(this.y);
	}

	/**
	 * u += v
	 * @method Vec2#incrementBy
	 * @param {Vec2} v The vector added to this vector.
	 */
	incrementBy(v) {
		this.x += v.x;
		this.y += v.y;
	}

	/**
	 * u -= v
	 * @method Vec2#decrementBy
	 * @param {Vec2} v The vector subtracted from this vector.
	 */
	decrementBy(v) {
		this.x -= v.x;
		this.y -= v.y;
	}

	/**
	 * u *= s
	 * @method Vec2#scaleBy
	 * @param {number} s The number this vector is scaled by.
	 */
	scaleBy(s) {
		this.x *= s;
		this.y *= s;
	}

	/**
	 * u /= s
	 * @method Vec2#divideBy
	 * @param {number} s The number this vector is divided by.
	 */
	divideBy(s) {
		this.scaleBy(1 / s);
	}

	/**
	 * Returns u + v
	 * @method Vec2#plus
	 * @param {Vec2} v The vector added to this vector.
	 * @return {Vec2}
	 */
	plus(v) {
		return new Vec2(this.x + v.x, this.y + v.y);
	}

	/**
	 * Returns u - v
	 * @method Vec2#minus
	 * @param {Vec2} v The vector subtracted from this vector.
	 * @return {Vec2}
	 */
	minus(v) {
		return new Vec2(this.x - v.x, this.y - v.y);
	}

	/**
	 * Returns u * s
	 * @method Vec2#times
	 * @param {number} s The number this vector is multiplied by.
	 * @return {Vec2}
	 */
	times(s) {
		return new Vec2(this.x * s, this.y * s);
	}

	/**
	 * Returns u / s
	 * @method Vec2#over
	 * @param {number} s The number this vector is divided by.
	 * @return {Vec2}
	 */
	over(s) {
		return this.times(1 / s);
	}

	/**
	 * Returns -u
	* @method Vec2#negated
	 * @return {Vec2}
	 */
	negated() {
		return this.times(-1);
	}

	/**
	 * Computes the dot product of this vector and v
	 * @method Vec2#dot
	 * @param {Vec2} v The vector this vector is dotted with.
	 * @return {number}
	 */
	dot(v) {
		return this.x * v.x + this.y * v.y;
	}

	/**
	 * Computes the cross product of this vector and v
	 * @method Vec2#cross
	 * @param {Vec2} v The vector this vector is crossed with.
	 * @return {number}
	 */
	cross(v) {
		return this.x * v.y - this.y * v.x;
	}
}

export type Point = Vec2 | Vec3;