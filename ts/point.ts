module ColorQuantization {

	/**
	 * v8 optimized class
	 * 1) "constructor" should have initialization with worst types
	 * 2) "set" should have |0 / >>> 0
	 */
	export class Point {
		public r : number;
		public g : number;
		public b : number;
		public a : number;
		public uint32 : number;
		public rgba : number[]; // TODO: better name is quadruplet or quad may be?

		constructor(...args : number[]) {
			this.r = this.g = this.b = this.a = 0;
			this.rgba = [ this.r , this.g , this.b , this.a ];
			this.uint32 = -1 >>> 0;
			this.set(...args);
		}

		public from(point : Point) {
			this.r = point.r;
			this.g = point.g;
			this.b = point.b;
			this.a = point.a;
			this.uint32 = point.uint32;
			this.rgba = point.rgba.slice(0);
		}

		public set(...args : number[]) {
			switch(args.length) {
				case 1:
					if(typeof args[0] === "number") {
						this.uint32 = args[0] >>> 0;
						this._loadRGBA();
					} else if(Utils.typeOf(args[0]) === "Array") {
						this.r = args[0][0] | 0;
						this.g = args[0][1] | 0;
						this.b = args[0][2] | 0;
						this.a = args[0][3] | 0;
						this._loadUINT32();
					} else {
						throw new Error("Point.constructor/set: unsupported single parameter");
					}
					break;

				case 4:
					this.r = args[0] | 0;
					this.g = args[1] | 0;
					this.b = args[2] | 0;
					this.a = args[3] | 0;
					this._loadUINT32();
					break;

				default:
					throw new Error("Point.constructor/set should have parameter/s");
			}

			this._loadQuadruplet();
		}

		private _loadUINT32() {
			this.uint32 = (
				(this.a << 24) |	// alpha
				(this.b << 16) |	// blue
				(this.g << 8)  |    // green
				this.r				// red
				) >>> 0;
		}

		private _loadRGBA() {
			this.r = this.uint32 & 0xff;
			this.g = (this.uint32 >>> 8) & 0xff;
			this.b = (this.uint32 >>> 16) & 0xff;
			this.a = (this.uint32 >>> 24) & 0xff;
		}

		private _loadQuadruplet() {
			this.rgba = [
				this.r,
				this.g,
				this.b,
				this.a
			];
		}
	}

}
