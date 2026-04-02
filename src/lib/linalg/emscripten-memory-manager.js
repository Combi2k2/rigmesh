class EmscriptenMemoryManager {
	constructor() {
		this.objectList = [];
	}

	deleteExcept(exceptList) {
		for (let object of this.objectList) {
			let deleteObject = true;

			for (let except of exceptList) {
				if (object === except) {
					deleteObject = false;
				}
			}

			if (deleteObject) {
				object.delete();
			}
		}

		this.objectList = exceptList;
	}
}

const memoryManager = new EmscriptenMemoryManager();
export default memoryManager;
