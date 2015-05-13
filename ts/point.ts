module ColorQuantization {

	export class Point {
		public r : number;
		public g : number;
		public b : number;
		public a : number;
		public uint32 : number;

		constructor(...args : number[]) {
			this.set(args);
		}

		public set(...args) {
			switch(args.length) {
				case 1:
					this.uint32 = args[0];

					this._loadRGBA();
					break;

				case 4:
					this.r = args[0];
					this.g = args[1];
					this.b = args[2];
					this.a = args[3];
					this._loadUINT32();
					break;

				default:
					throw new Error("Point.constructor/set should have parameter/s");
			}
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
	}

}
