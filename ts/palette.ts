/// <reference path='./point.ts' />
// TODO: make paletteArray via pointBuffer, so, export will be available via pointBuffer.exportXXX
module ColorQuantization {

	export class Palette {
		public _paletteArray : Point[] = [];
		private _i32idx : { [ key: string ] : number } = {};

		// TOTRY: use HUSL - http://boronine.com/husl/
		public nearestColor(point : Point) : Point {
			return this._paletteArray[this.nearestIndex_Point(point) | 0];
		}

		// TOTRY: use HUSL - http://boronine.com/husl/
		public nearestIndex(i32) {
			var idx : number = this._nearestPointFromCache("" + i32);
			if (idx >= 0) return idx;

			var min = 1000,
				rgb = [
					(i32 & 0xff),
					(i32 >>> 8) & 0xff,
					(i32 >>> 16) & 0xff,
					(i32 >>> 24) & 0xff
				],
				len = this._paletteArray.length;

			idx = 0;
			for (var i = 0; i < len; i++) {
				if (!this._paletteArray[i]) continue;		// sparse palettes

				var dist = Utils.distEuclidean(rgb, this._paletteArray[i].rgba);

				if (dist < min) {
					min = dist;
					idx = i;
				}
			}

			this._i32idx[i32] = idx;
			return idx;
		}

		private _nearestPointFromCache(key) {
			return typeof this._i32idx[key] === "number" ? this._i32idx[key] : -1;
		}

		public nearestIndex_Point(point : Point) : number {
			var idx : number = this._nearestPointFromCache("" + point.uint32);
			if (idx >= 0) return idx;

			var minimalDistance : number = 1000.0;

			for (var idx = 0, i = 0, l = this._paletteArray.length; i < l; i++) {
				if (!this._paletteArray[i]) continue;		// sparse palettes

				var distance = Utils.distEuclidean(point.rgba, this._paletteArray[i].rgba);

				if (distance < minimalDistance) {
					minimalDistance = distance;
					idx = i;
				}
			}

			this._i32idx[point.uint32] = idx;
			return idx;
		}

		// TODO: check usage, not tested!
		public prunePal(keep : number[]) {
			var point : Point;

			for (var j = 0; j < this._paletteArray.length; j++) {
				if (keep.indexOf(j) < 0) {
					this._paletteArray[j] = null;
				}
			}

			// compact
			var compactedPaletteArray : Point[] = [];

			for (var j = 0, i = 0; j < this._paletteArray.length; j++) {
				if (this._paletteArray[j]) {
					point = this._paletteArray[j];
					compactedPaletteArray[i] = point;
					i++;
				}
			}

			this._paletteArray = compactedPaletteArray;
		}

		// TODO: group very low lum and very high lum colors
		// TODO: pass custom sort order
		// TODO: sort criteria function should be placed to HueStats class
		public sort(hueGroups : number) {
			this._paletteArray.sort((a : Point, b : Point) => {
				var rgbA = a.rgba,
					rgbB = b.rgba;

				var hslA = Utils.rgb2hsl(rgbA[ 0 ], rgbA[ 1 ], rgbA[ 2 ]),
					hslB = Utils.rgb2hsl(rgbB[ 0 ], rgbB[ 1 ], rgbB[ 2 ]);

				// sort all grays + whites together
				var hueA = (rgbA[ 0 ] == rgbA[ 1 ] && rgbA[ 1 ] == rgbA[ 2 ]) ? 0 : 1 + Utils.hueGroup(hslA.h, hueGroups);
				var hueB = (rgbB[ 0 ] == rgbB[ 1 ] && rgbB[ 1 ] == rgbB[ 2 ]) ? 0 : 1 + Utils.hueGroup(hslB.h, hueGroups);

				var hueDiff = hueB - hueA;
				if (hueDiff) return -hueDiff;

				var lumDiff = Utils.lumGroup(+hslB.l.toFixed(2)) - Utils.lumGroup(+hslA.l.toFixed(2));
				if (lumDiff) return -lumDiff;

				var satDiff = Utils.satGroup(+hslB.s.toFixed(2)) - Utils.satGroup(+hslA.s.toFixed(2));
				if (satDiff) return -satDiff;
			});
		}

	}
}
