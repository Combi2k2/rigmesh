export function deepCopy(obj) {
    return JSON.parse(JSON.stringify(obj));
}

export default class Queue {
    constructor() {
        this.data = [];
        this.head = 0;
        this.tail = 0;
    }

    push(value) {
        this.data.push(value);
        this.tail++;
    }

    pop() {
        return this.data[this.head++];
    }

    empty() {
        return this.head >= this.tail;
    }

    size() {
        return this.tail - this.head;
    }
}