/*
* Copyright (c) 2015, Leon Sorokin
* All rights reserved. (MIT Licensed)
*
* RgbQuant.js - an image quantization lib
*/

/// <reference path='./hueStatistics.ts' />
/// <reference path='./dither.ts' />
/// <reference path='./utils.ts' />
module ColorQuantization {

	export enum RgbQuantDitheringKernel {
		NONE = 0
	}
	export class RgbQuant {
		// 1 = by global population, 2 = subregion population threshold
		private _method : number = 2;

		// desired final palette size
		private _colors : number = 256;

		// # of highest-frequency colors to start with for palette reduction
		private _initColors : number;

		// color-distance threshold for initial reduction pass
		private _initDist = 0.01;

		// subsequent passes threshold
		private _distIncr : number = 0.005;

		// palette grouping
		private _hueGroups : number = 10;
		private _satGroups : number = 10;
		private _lumGroups : number = 10;

		// if > 0, enables hues stats and min-color retention per group
		private _minHueCols : number;

		// HueStatistics instance
		private _hueStats : HueStatistics;

		// subregion partitioning box size
		private _boxSize = [ 64, 64 ];

		// number of same pixels required within box for histogram inclusion
		private _boxPxls = 2;

		// palette locked indicator
		private _palLocked = false;

		// palette sort order
//		this.sortPal = ['hue-','lum-','sat-'];

		// dithering/error diffusion kernel name
		private _dithKern : RgbQuantDitheringKernel = RgbQuantDitheringKernel.NONE;

		// dither serpentine pattern
		private _dithSerp = true;

		// minimum color difference (0-1) needed to dither
		private _dithDelta = 0;

		// accumulated histogram
		private _histogram = {};

		// palette - rgb triplets
		private _idxrgb = [];

		// palette - int32 vals
		private _idxi32 = [];

		// reverse lookup {i32:idx}
		private _i32idx = {};

		// {i32:rgb}
		private _i32rgb = {};

		// enable color caching (also incurs overhead of cache misses and cache building)
		private _useCache = true;

		// min color occurance count needed to qualify for caching
		private _cacheFreq = 10;

		// allows pre-defined palettes to be re-indexed (enabling palette compacting and sorting)
		private _reIndex = true;

		// TODO: make interface for options
		constructor(opts : any) {
			opts = opts || {};

			// 1 = by global population, 2 = subregion population threshold
			if (typeof opts.method === "number") this._method = opts.method;

			// desired final palette size
			if (typeof opts.colors === "number") this._colors = opts.colors;

			// # of highest-frequency colors to start with for palette reduction
			this._initColors = this._colors << 2;//opts.initColors || 65536; //4096;
			// if > 0, enables hues stats and min-color retention per group
			this._minHueCols = this._colors << 2;//opts.minHueCols || 0;

			// HueStatistics instance
			this._hueStats = this._minHueCols ? new HueStatistics(this._hueGroups, this._minHueCols) : null;

			// dithering/error diffusion kernel name
			if (typeof this._dithKern === "number") this._dithKern = opts.dithKern;

			// accumulated histogram
			this._histogram = {};
			// palette - rgb triplets
			if (Object.prototype.toString.call(opts.palette) === "[object Array]") this._idxrgb = opts.palette.slice(0);

			// if pre-defined palette, build lookups
			if (this._idxrgb.length > 0) {
				this._idxrgb.forEach(function (rgb, i) {
					var alpha = rgb.length >= 4 ? rgb[ 3 ] : 255,
						i32 = (
							(alpha << 24) |	// alpha
							(rgb[ 2 ] << 16) |	// blue
							(rgb[ 1 ] << 8) |	// green
							rgb[ 0 ]				// red
							) >>> 0;

					this._idxi32[ i ] = i32;
					this._i32idx[ i32 ] = i;
					this._i32rgb[ i32 ] = rgb;
				}, this);
			}
		}

		// gathers histogram info
		public sample(img, width) {
			if (this._palLocked)
				throw "Cannot sample additional images, palette already assembled.";

			var data = Utils.getImageData(img, width);

			switch (this._method) {
				case 1:
					this.colorStats1D(data.buf32);
					break;
				case 2:
					this.colorStats2D(data.buf32, data.width);
					break;
			}
		}

		// image quantizer
		// todo: memoize colors here also
		// @retType: 1 - Uint8Array (default), 2 - Indexed array, 3 - Match @img type (unimplemented, todo)
		public reduce(img, retType, dithKern, dithSerp) : any {
			if (!this._palLocked)
				this.buildPal();

			dithKern = dithKern || this._dithKern;
			dithSerp = typeof dithSerp != "undefined" ? dithSerp : this._dithSerp;

			retType = retType || 1;

			// reduce w/dither
			var buf32;
			if (dithKern)
				buf32 = this.dither(img, dithKern, dithSerp);
			else {
				var data = Utils.getImageData(img);
				buf32 = data.buf32;
			}

			var len : number = buf32.length,
				out32 = new Uint32Array(len);

			for (var i = 0; i < len; i++) {
				var i32 : number = buf32[ i ];
				out32[ i ] = this.nearestColor(i32);
			}

			if (retType == 1)
				return new Uint8Array(out32.buffer);

			if (retType == 2) {
				var out = [],
					len : number = out32.length;

				for (var i = 0; i < len; i++) {
					var i32 : number = out32[ i ];
					out[ i ] = this._i32idx[ i32 ];
				}

				return out;
			}
		}

		// adapted from http://jsbin.com/iXofIji/2/edit by PAEz
		public dither(img, kernel, serpentine) {
			if (!kernel || !kernels[ kernel ]) {
				throw 'Unknown dithering kernel: ' + kernel;
			}

			var ds = kernels[ kernel ];

			var data = Utils.getImageData(img),
//			buf8 = data.buf8,
				buf32 = data.buf32,
				width = data.width,
				height = data.height,
				len = buf32.length;

			var dir = serpentine ? -1 : 1;

			//(<any>console).profile("dither");
			for (var y = 0; y < height; y++) {
				if (serpentine)
					dir = dir * -1;

				var lni = y * width;

				for (var x = (dir == 1 ? 0 : width - 1), xend = (dir == 1 ? width : 0); x !== xend; x += dir) {
					// Image pixel
					var idx = lni + x,
						i32 = buf32[ idx ],
						r1 = (i32 & 0xff),
						g1 = (i32 >>> 8) & 0xff,
						b1 = (i32 >>> 16) & 0xff,
						a1 = (i32 >>> 24) & 0xff;

					// Reduced pixel
					var i32x = this.nearestColor(i32),
						r2 = (i32x & 0xff),
						g2 = (i32x >>> 8) & 0xff,
						b2 = (i32x >>> 16) & 0xff,
						a2 = (i32x >>> 24) & 0xff;

					buf32[ idx ] = i32x;

					// dithering strength
					if (this._dithDelta) {
						var dist = Utils.distEuclidean([ r1, g1, b1, a1 ], [ r2, g2, b2, a2 ]);
						if (dist < this._dithDelta)
							continue;
					}

					// Component distance
					var er = r1 - r2,
						eg = g1 - g2,
						eb = b1 - b2,
						ea = a1 - a2;

					for (var i = (dir == 1 ? 0 : ds.length - 1), end = (dir == 1 ? ds.length : 0); i !== end; i += dir) {
						var x1 = ds[ i ][ 1 ] * dir,
							y1 = ds[ i ][ 2 ];

						var lni2 = y1 * width;

						if (x1 + x >= 0 && x1 + x < width && y1 + y >= 0 && y1 + y < height) {
							var d = ds[ i ][ 0 ];
							var idx2 = idx + (lni2 + x1),
								i32y = buf32[ idx2 ];

							var r3 = (i32y & 0xff),
								g3 = (i32y >>> 8) & 0xff,
								b3 = (i32y >>> 16) & 0xff,
								a3 = (i32y >>> 24) & 0xff;

							var r4 = Math.max(0, Math.min(255, r3 + er * d)),
								g4 = Math.max(0, Math.min(255, g3 + eg * d)),
								b4 = Math.max(0, Math.min(255, b3 + eb * d)),
								a4 = Math.max(0, Math.min(255, a3 + ea * d));

							buf32[ idx2 ] = (
								(a4 << 24) |	// alpha
								(b4 << 16) |	// blue
								(g4 << 8) |	// green
								r4				// red
								) >>> 0;

							//if(this.idxi32.indexOf(buf32[idx2]) < 0) throw new Error("no palette entry!");
						}
					}
				}
			}

			//(<any>console).profileEnd("dither");
			return buf32;
		}

		// reduces histogram to palette, remaps & memoizes reduced colors
		public buildPal(noSort?) {
			if (this._palLocked || this._idxrgb.length > 0 && this._idxrgb.length <= this._colors) return;

			var histG = this._histogram,
				sorted = Utils.sortedHashKeys(histG, true);

			if (sorted.length == 0)
				throw "Nothing has been sampled, palette cannot be built.";

			switch (this._method) {
				case 1:
					var cols = this._initColors,
						last = sorted[ cols - 1 ],
						freq = histG[ last ];

					var idxi32 = sorted.slice(0, cols);

					// add any cut off colors with same freq as last
					var pos = cols, len = sorted.length;
					while (pos < len && histG[ sorted[ pos ] ] == freq)
						idxi32.push(sorted[ pos++ ]);

					// inject min huegroup colors
					if (this._hueStats)
						this._hueStats.inject(idxi32);

					break;
				case 2:
					var idxi32 = sorted;
					break;
			}

			// int32-ify values
			idxi32 = idxi32.map(function (v) {
				return +v;
			});

			this.reducePal(idxi32);

			if (!noSort && this._reIndex)
				this.sortPal();

			// build cache of top histogram colors
			if (this._useCache)
				this.cacheHistogram(idxi32);

			this._palLocked = true;
		}

		public palette(tuples, noSort) : any {
			this.buildPal(noSort);
			return tuples ? this._idxrgb : new Uint8Array((new Uint32Array(this._idxi32)).buffer);
		}

		public prunePal(keep) {
			var i32;

			for (var j = 0; j < this._idxrgb.length; j++) {
				if (!keep[ j ]) {
					i32 = this._idxi32[ j ];
					this._idxrgb[ j ] = null;
					this._idxi32[ j ] = null;
					delete this._i32idx[ i32 ];
				}
			}

			// compact
			if (this._reIndex) {
				var idxrgb = [],
					idxi32 = [],
					i32idx = {};

				for (var j = 0, i = 0; j < this._idxrgb.length; j++) {
					if (this._idxrgb[ j ]) {
						i32 = this._idxi32[ j ];
						idxrgb[ i ] = this._idxrgb[ j ];
						i32idx[ i32 ] = i;
						idxi32[ i ] = i32;
						i++;
					}
				}

				this._idxrgb = idxrgb;
				this._idxi32 = idxi32;
				this._i32idx = i32idx;
			}
		}

		// reduces similar colors from an importance-sorted Uint32 rgba array
		public reducePal(idxi32) {
			// if pre-defined palette's length exceeds target
			if (this._idxrgb.length > this._colors) {
				// quantize histogram to existing palette
				var len = idxi32.length, keep = {}, uniques = 0, idx, pruned = false;

				for (var i = 0; i < len; i++) {
					// palette length reached, unset all remaining colors (sparse palette)
					if (uniques == this._colors && !pruned) {
						this.prunePal(keep);
						pruned = true;
					}

					idx = this.nearestIndex(idxi32[ i ]);

					if (uniques < this._colors && !keep[ idx ]) {
						keep[ idx ] = true;
						uniques++;
					}
				}

				if (!pruned) {
					this.prunePal(keep);
					pruned = true;
				}
			}
			// reduce histogram to create initial palette
			else {
				// build full rgb palette
				var idxrgb = idxi32.map(function (i32) {
					return [
						(i32 & 0xff),
						(i32 >>> 8) & 0xff,
						(i32 >>> 16) & 0xff,
						(i32 >>> 24) & 0xff
					];
				});

				var len = idxrgb.length,
					palLen = len,
					thold = this._initDist;

				// palette already at or below desired length
				if (palLen > this._colors) {
					while (palLen > this._colors) {
						var memDist = [];

						// iterate palette
						for (var i = 0; i < len; i++) {
							var pxi = idxrgb[ i ], i32i = idxi32[ i ];
							if (!pxi) continue;

							for (var j = i + 1; j < len; j++) {
								var pxj = idxrgb[ j ], i32j = idxi32[ j ];
								if (!pxj) continue;

								var dist = Utils.distEuclidean(pxi, pxj);

								if (dist < thold) {
									// store index,rgb,dist
									memDist.push([ j, pxj, i32j, dist ]);

									// kill squashed value
									delete(idxrgb[ j ]);
									palLen--;
								}
							}
						}

						// palette reduction pass
						// console.log("palette length: " + palLen);

						// if palette is still much larger than target, increment by larger initDist
						thold += (palLen > this._colors * 3) ? this._initDist : this._distIncr;
					}

					// if palette is over-reduced, re-add removed colors with largest distances from last round
					if (palLen < this._colors) {
						// sort descending
						Utils.sort.call(memDist, function (a, b) {
							return b[ 3 ] - a[ 3 ];
						});

						var k = 0;
						while (palLen < this._colors) {
							// re-inject rgb into final palette
							idxrgb[ memDist[ k ][ 0 ] ] = memDist[ k ][ 1 ];

							palLen++;
							k++;
						}
					}
				}

				var len = idxrgb.length;
				for (var i = 0; i < len; i++) {
					if (!idxrgb[ i ]) continue;

					this._idxrgb.push(idxrgb[ i ]);
					this._idxi32.push(idxi32[ i ]);

					this._i32idx[ idxi32[ i ] ] = this._idxi32.length - 1;
					this._i32rgb[ idxi32[ i ] ] = idxrgb[ i ];
				}
			}
		}

		// global top-population
		public colorStats1D(buf32) {
			var histG = this._histogram,
				num = 0, col,
				len = buf32.length;

			for (var i = 0; i < len; i++) {
				col = buf32[ i ];

				// skip transparent
				if ((col & 0xff000000) >> 24 == 0) continue;

				// collect hue stats
				if (this._hueStats)
					this._hueStats.check(col);

				if (col in histG)
					histG[ col ]++;
				else
					histG[ col ] = 1;
			}
		}

		// population threshold within subregions
		// FIXME: this can over-reduce (few/no colors same?), need a way to keep
		// important colors that dont ever reach local thresholds (gradients?)
		public colorStats2D(buf32, width) {
			var boxW = this._boxSize[ 0 ],
				boxH = this._boxSize[ 1 ],
				area = boxW * boxH,
				boxes = Utils.makeBoxes(width, buf32.length / width, boxW, boxH),
				histG = this._histogram;

			boxes.forEach(function (box) {
				var effc = Math.max(Math.round((box.w * box.h) / area) * this._boxPxls, 2),
					histL = {}, col;

				this.iterBox(box, width, function (i) {
					col = buf32[ i ];

					// skip transparent
					if ((col & 0xff000000) >> 24 == 0) return;

					// collect hue stats
					if (this._hueStats)
						this._hueStats.check(col);

					if (col in histG)
						histG[ col ]++;
					else if (col in histL) {
						if (++histL[ col ] >= effc)
							histG[ col ] = histL[ col ];
					}
					else
						histL[ col ] = 1;
				});
			}, this);

			if (this._hueStats)
				this._hueStats.inject(histG);
		}

		// TODO: group very low lum and very high lum colors
		// TODO: pass custom sort order
		public sortPal() {
			var self = this;

			this._idxi32.sort(function (a, b) {
				var idxA = self._i32idx[ a ],
					idxB = self._i32idx[ b ],
					rgbA = self._idxrgb[ idxA ],
					rgbB = self._idxrgb[ idxB ];

				var hslA = Utils.rgb2hsl(rgbA[ 0 ], rgbA[ 1 ], rgbA[ 2 ]),
					hslB = Utils.rgb2hsl(rgbB[ 0 ], rgbB[ 1 ], rgbB[ 2 ]);

				// sort all grays + whites together
				var hueA = (rgbA[ 0 ] == rgbA[ 1 ] && rgbA[ 1 ] == rgbA[ 2 ]) ? -1 : Utils.hueGroup(hslA.h, self._hueGroups);
				var hueB = (rgbB[ 0 ] == rgbB[ 1 ] && rgbB[ 1 ] == rgbB[ 2 ]) ? -1 : Utils.hueGroup(hslB.h, self._hueGroups);

				var hueDiff = hueB - hueA;
				if (hueDiff) return -hueDiff;

				var lumDiff = Utils.lumGroup(+hslB.l.toFixed(2)) - Utils.lumGroup(+hslA.l.toFixed(2));
				if (lumDiff) return -lumDiff;

				var satDiff = Utils.satGroup(+hslB.s.toFixed(2)) - Utils.satGroup(+hslA.s.toFixed(2));
				if (satDiff) return -satDiff;
			});

			// sync idxrgb & i32idx
			this._idxi32.forEach(function (i32, i) {
				this._idxrgb[ i ] = this._i32rgb[ i32 ];
				this._i32idx[ i32 ] = i;
			}, this);
		}

		// iterates @bbox within a parent rect of width @wid; calls @fn, passing index within parent
		public iterBox(bbox, wid, fn) {
			var b = bbox,
				i0 = b.y * wid + b.x,
				i1 = (b.y + b.h - 1) * wid + (b.x + b.w - 1),
				cnt = 0, incr = wid - b.w + 1, i = i0;

			do {
				fn.call(this, i);
				i += (++cnt % b.w == 0) ? incr : 1;
			} while (i <= i1);
		}

		// TOTRY: use HUSL - http://boronine.com/husl/
		public nearestColor(i32) {
			var idx = this.nearestIndex(i32);
			return idx === null ? 0 : this._idxi32[ idx ];
		}

		// TOTRY: use HUSL - http://boronine.com/husl/
		public nearestIndex(i32) {
			// alpha 0 returns null index
			if ((i32 & 0xff000000) >> 24 == 0)
				return null;

			if (this._useCache && ("" + i32) in this._i32idx)
				return this._i32idx[ i32 ];

			var min = 1000,
				idx,
				rgb = [
					(i32 & 0xff),
					(i32 >>> 8) & 0xff,
					(i32 >>> 16) & 0xff,
					(i32 >>> 24) & 0xff
				],
				len = this._idxrgb.length;

			for (var i = 0; i < len; i++) {
				if (!this._idxrgb[ i ]) continue;		// sparse palettes

				var dist = Utils.distEuclidean(rgb, this._idxrgb[ i ]);

				if (dist < min) {
					min = dist;
					idx = i;
				}
			}

			return idx;
		}

		public cacheHistogram(idxi32) {
			for (var i = 0, i32 = idxi32[ i ]; i < idxi32.length && this._histogram[ i32 ] >= this._cacheFreq; i32 = idxi32[ i++ ])
				this._i32idx[ i32 ] = this.nearestIndex(i32);
		}
	}

}
