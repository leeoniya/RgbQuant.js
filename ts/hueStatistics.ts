/// <reference path='./utils.ts' />
module ColorQuantization {

	class HueGroup {
		public num : number = 0;
		public cols : number[] = [];
	}

	export class HueStatistics {
		private _numGroups;
		private _minCols;
		private _stats;
		private _groupsFull;

		constructor(numGroups : number, minCols : number) {
			this._numGroups = numGroups;
			this._minCols = minCols;
			this._stats = [];

			for (var i = 0; i <= numGroups; i++) {
				this._stats[i] = new HueGroup();
			}

			this._groupsFull = 0;
		}

		public check(i32) {
			if (this._groupsFull == this._numGroups + 1) {
				this.check = function () {
				};
			}

			var r = (i32 & 0xff),
				g = (i32 >>> 8) & 0xff,
				b = (i32 >>> 16) & 0xff,
				a = (i32 >>> 24) & 0xff,
				hg = (r == g && g == b) ? 0 : 1 + Utils.hueGroup(Utils.rgb2hsl(r, g, b).h, this._numGroups),
				gr : HueGroup = this._stats[ hg ],
				min = this._minCols;

			gr.num++;

			if (gr.num > min)
				return;
			if (gr.num == min)
				this._groupsFull++;

			if (gr.num <= min)
				this._stats[ hg ].cols.push(i32);
		}

		public inject(histG) {
			for (var i = 0; i <= this._numGroups; i++) {
				if (this._stats[ i ].num <= this._minCols) {
					switch (Utils.typeOf(histG)) {
						case "Array":
							this._stats[ i ].cols.forEach(function (col) {
								if (histG.indexOf(col) == -1)
									histG.push(col);
							});
							break;
						case "Object":
							this._stats[ i ].cols.forEach(function (col) {
								if (!histG[ col ])
									histG[ col ] = 1;
								else
									histG[ col ]++;
							});
							break;
					}
				}
			}
		}
	}

}
