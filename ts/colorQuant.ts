/*
* Copyright (c) 2015, Leon Sorokin
* All rights reserved. (MIT Licensed)
*
* RgbQuant.js - an image quantization lib
*/

/// <reference path='./point.ts' />
/// <reference path='./palette.ts' />
/// <reference path='./pointBuffer.ts' />
/// <reference path='./hueStatistics.ts' />
/// <reference path='./dither.ts' />
/// <reference path='./utils.ts' />
module ColorQuantization {

	// TODO: make input/output image and input/output palettes with instances of class Point only!
	export enum RgbQuantDitheringKernel {
		NONE = 0
	}
	export class RgbQuant {
		// 1 = by global population, 2 = subregion population threshold
		private _method : number = 1;

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

		//private _paletteArray : Point[] = [];
		private _palette : Palette;

		// enable color caching (also incurs overhead of cache misses and cache building)
		private _useCache = true;

		// min color occurance count needed to qualify for caching
		private _cacheFreq = 10;

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
		}

		// gathers histogram info
		public sample(pointBuffer : PointBuffer) {
			switch (this._method) {
				case 1:
					this.colorStats1D(pointBuffer);
					break;
				case 2:
					this.colorStats2D(pointBuffer);
					break;
			}
		}

		// image quantizer
		// todo: memoize colors here also
		// @retType: 1 - Uint8Array (default), 2 - Indexed array, 3 - Match @img type (unimplemented, todo)
		public reduce(pointBuffer : PointBuffer, palette : Palette, dithKern?, dithSerp?) : any {
			this._reducePalette(palette, this._colors);

			dithKern = dithKern || this._dithKern;
			dithSerp = typeof dithSerp != "undefined" ? dithSerp : this._dithSerp;

			// reduce w/dither
			var start = Date.now();

			console.profile("__!dither");
			if (dithKern) {
				pointBuffer = this.dither(pointBuffer, palette, dithKern, dithSerp);
			}
			(<any>console).profileEnd("__!dither");
			console.log("[dither]: " + (Date.now() - start));

			var pointArray = pointBuffer.getPointArray(),
				len : number = pointArray.length;

			for (var i = 0; i < len; i++) {
				pointArray[ i ].from(palette.nearestColor(pointArray[ i ]));
			}

			return pointBuffer;
		}

		// adapted from http://jsbin.com/iXofIji/2/edit by PAEz
		public dither(pointBuffer : PointBuffer, palette : Palette, kernel, serpentine) : PointBuffer {
			if (!kernel || !kernels[ kernel ]) {
				throw 'Unknown dithering kernel: ' + kernel;
			}

			var ds = kernels[ kernel ];

			var pointArray = pointBuffer.getPointArray(),
				width = pointBuffer.getWidth(),
				height = pointBuffer.getHeight(),
				dir = serpentine ? -1 : 1;

			//(<any>console).profile("dither");
			for (var y = 0; y < height; y++) {
				if (serpentine)
					dir = dir * -1;

				var lni = y * width;

				for (var x = (dir == 1 ? 0 : width - 1), xend = (dir == 1 ? width : 0); x !== xend; x += dir) {
					// Image pixel
					var idx = lni + x,
						p1 = pointArray[ idx ];

					// Reduced pixel
					var point = palette.nearestColor(p1);

					pointArray[ idx ] = point;

					// dithering strength
					if (this._dithDelta) {
						var dist = Utils.distEuclidean(p1.rgba, point.rgba);
						if (dist < this._dithDelta)
							continue;
					}

					// Component distance
					var er = p1.r - point.r,
						eg = p1.g - point.g,
						eb = p1.b - point.b,
						ea = p1.a - point.a;

					for (var i = (dir == 1 ? 0 : ds.length - 1), end = (dir == 1 ? ds.length : 0); i !== end; i += dir) {
						var x1 = ds[ i ][ 1 ] * dir,
							y1 = ds[ i ][ 2 ];

						var lni2 = y1 * width;

						if (x1 + x >= 0 && x1 + x < width && y1 + y >= 0 && y1 + y < height) {
							var d = ds[ i ][ 0 ];
							var idx2 = idx + (lni2 + x1),
								p3 = pointArray[idx2];

							var r4 = Math.max(0, Math.min(255, p3.r + er * d)),
								g4 = Math.max(0, Math.min(255, p3.g + eg * d)),
								b4 = Math.max(0, Math.min(255, p3.b + eb * d)),
								a4 = Math.max(0, Math.min(255, p3.a + ea * d));

							pointArray[idx2].set(r4, g4, b4, a4);
						}
					}
				}
			}

			//(<any>console).profileEnd("dither");
			return pointBuffer;
		}

		public getImportanceSortedColorsIDXI32() {
			var sorted = Utils.sortedHashKeys(this._histogram, true);

			if (sorted.length == 0)
				throw "Nothing has been sampled, palette cannot be built.";

			switch (this._method) {
				case 1:
					var initialColorsLimit = Math.min(sorted.length, this._initColors ),
						last = sorted[ initialColorsLimit - 1 ],
						freq = this._histogram[ last ];

					var idxi32 = sorted.slice(0, initialColorsLimit);

					// add any cut off colors with same freq as last
					var pos = initialColorsLimit, len = sorted.length;
					while (pos < len && this._histogram[ sorted[ pos ] ] == freq)
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

			return idxi32;
		}

		// reduces histogram to palette, remaps & memoizes reduced colors
		public palette() : Palette {
			var idxi32 = this.getImportanceSortedColorsIDXI32(),
				palette : Palette = this._buildPalette(idxi32);

			palette.sort(this._hueGroups);
			return palette;
/*
			var uint32Array = this._palette._paletteArray.map(point => point.uint32);
			return tuples ? this._palette._paletteArray : new Uint8Array((new Uint32Array(uint32Array)).buffer);
*/
		}

		// TODO: not tested method
		private _reducePalette(palette : Palette, colors : number) {
			if (palette._paletteArray.length > colors) {
				var idxi32 = this.getImportanceSortedColorsIDXI32();

				// quantize histogram to existing palette
				var keep = [], uniqueColors = 0, idx, pruned = false;

				for (var i = 0, len = idxi32.length; i < len; i++) {
					// palette length reached, unset all remaining colors (sparse palette)
					if (uniqueColors >= colors) {
						palette.prunePal(keep);
						pruned = true;
						break;
					} else {
						idx = palette.nearestIndex(idxi32[i]);
						if (keep.indexOf(idx) < 0) {
							keep.push(idx);
							uniqueColors++;
						}
					}
				}

				if (!pruned) {
					palette.prunePal(keep);
					pruned = true;
				}
			}
		}

		// reduces similar colors from an importance-sorted Uint32 rgba array
		private _buildPalette(idxi32) {
			var palette : Palette = new Palette();

			// reduce histogram to create initial palette
			// build full rgb palette
			var idxrgb = idxi32.map(function (i32) {
				return [
					(i32 & 0xff),
					(i32 >>> 8) & 0xff,
					(i32 >>> 16) & 0xff,
					(i32 >>> 24) & 0xff
				];
			});

			var len    = idxrgb.length,
				palLen = len,
				thold  = this._initDist;

			// palette already at or below desired length
			if (palLen > this._colors) {
				while (palLen > this._colors) {
					var memDist = [];

					// iterate palette
					for (var i = 0; i < len; i++) {
						var pxi = idxrgb[i];
						if (!pxi) continue;

						for (var j = i + 1; j < len; j++) {
							var pxj = idxrgb[j];
							if (!pxj) continue;

							var dist = Utils.distEuclidean(pxi, pxj);

							if (dist < thold) {
								// store index,rgb,dist
								memDist.push([j, pxj, dist]);

								idxrgb[j] = null;
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
						return b[2] - a[2];
					});

					var k = 0;
					while (palLen < this._colors) {
						// re-inject rgb into final palette
						idxrgb[memDist[k][0]] = memDist[k][1];

						palLen++;
						k++;
					}
				}
			}

			for (var i = 0, len = idxrgb.length; i < len; i++) {
				if (!idxrgb[i]) continue;

				var point : Point = new Point(idxrgb[i]);
				palette._paletteArray.push(point);
			}

			return palette;
		}

		// global top-population
		public colorStats1D(pointBuffer : PointBuffer) {
			var histG = this._histogram,
				pointArray = pointBuffer.getPointArray(),
				len = pointArray.length;

			for (var i = 0; i < len; i++) {
				var col = pointArray[i].uint32;

				// skip transparent
				//if ((col & 0xff000000) >> 24 == 0) continue;

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
		public colorStats2D(pointBuffer : PointBuffer) {
			var width = pointBuffer.getWidth(),
				height = pointBuffer.getHeight(),
				pointArray = pointBuffer.getPointArray();

			var boxW = this._boxSize[ 0 ],
				boxH = this._boxSize[ 1 ],
				area = boxW * boxH,
				boxes = Utils.makeBoxes(width, height, boxW, boxH),
				histG = this._histogram;

			boxes.forEach(function (box) {
				var effc = Math.max(Math.round((box.w * box.h) / area) * this._boxPxls, 2),
					histL = {}, col;

				this.iterBox(box, width, function (i) {
					col = pointArray[i].uint32;

					// skip transparent
					//if ((col & 0xff000000) >> 24 == 0) return;

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


		// TODO: do we need this caching? we will build cache during first usage of each color. disabled for now
		public cacheHistogram(idxi32) {
/*
			for (var i = 0, i32 = idxi32[ i ]; i < idxi32.length && this._histogram[ i32 ] >= this._cacheFreq; i32 = idxi32[ i++ ])
				this._i32idx[ i32 ] = this.nearestIndex(i32);
*/
		}
	}

}
