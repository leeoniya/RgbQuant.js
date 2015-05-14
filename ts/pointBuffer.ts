/// <reference path='./point.ts' />
module ColorQuantization {

	// TODO: http://www.javascripture.com/Uint8ClampedArray
	// TODO: Uint8ClampedArray is better than Uint8Array to avoid checking for out of bounds
	// TODO: check performance (it seems identical) http://jsperf.com/uint8-typed-array-vs-imagedata/4
	/*

	 TODO: Examples:

	 var x = new Uint8ClampedArray([17, -45.3]);
	 console.log(x[0]); // 17
	 console.log(x[1]); // 0
	 console.log(x.length); // 2

	 var x = new Uint8Array([17, -45.3]);
	 console.log(x[0]); // 17
	 console.log(x[1]); // 211
	 console.log(x.length); // 2

	 */

	export class PointBuffer {
		private _pointArray : Point[];
		private _width : number;
		private _height : number;

		constructor() {
		}

		public getWidth() : number {
			return this._width;
		}

		public getHeight() : number {
			return this._height;
		}

		public getPointArray() : Point[] {
			return this._pointArray;
		}

		public importHTMLImageElement(img : HTMLImageElement) : void {
			var width = img.naturalWidth,
				height = img.naturalHeight;

			var canvas = document.createElement("canvas");
			canvas.width = width;
			canvas.height = height;

			var ctx = <CanvasRenderingContext2D>canvas.getContext("2d");
			ctx.drawImage(img, 0, 0, width,height, 0, 0, width, height);

			this.importHTMLCanvasElement(canvas);
		}

		public importHTMLCanvasElement(canvas : HTMLCanvasElement) : void {
			var width = canvas.width,
				height = canvas.height;

			var ctx = <CanvasRenderingContext2D>canvas.getContext("2d"),
				imgData = ctx.getImageData(0, 0, width, height);

			this.importImageData(imgData);
		}

		public importNodeCanvas(canvas : any) : void {
			this.importHTMLCanvasElement(canvas);
		}

		public importImageData(imageData : ImageData) : void {
			var width = imageData.width,
				height = imageData.height;

			this.importCanvasPixelArray(imageData.data, width, height);
/*
			var buf8;
			if (Utils.typeOf(imageData.data) == "CanvasPixelArray")
				buf8 = new Uint8Array(imageData.data);
			else
				buf8 = imageData.data;

			this.importUint32Array(new Uint32Array(buf8.buffer), width, height);
*/
		}

		public importArray(data : number[], width : number, height : number) : void {
			var uint8array = new Uint8Array(data);
			this.importUint32Array(new Uint32Array(uint8array.buffer), width, height);
		}

		public importCanvasPixelArray(data : any, width : number, height : number) {
			this.importArray(data, width, height);
		}

		public importUint32Array(uint32array : Uint32Array, width : number, height : number) : void {
			this._width = width;
			this._height = height;

			this._pointArray = [];//new Array(uint32array.length);
			for(var i = 0, l = uint32array.length; i < l; i++) {
				this._pointArray[i] = new Point(uint32array[i]);
			}
		}

		public exportUint32Array() : Uint32Array {
			var l = this._pointArray.length,
				uint32Array = new Uint32Array(l);

			for(var i = 0; i < l; i++) {
				uint32Array[i] = this._pointArray[i].uint32;
			}

			return uint32Array;
		}

		public exportUint8Array() : Uint8Array {
			return new Uint8Array(this.exportUint32Array().buffer);
		}

	}

}
