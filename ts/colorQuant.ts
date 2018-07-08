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
		private _boxSize = [64, 64];

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

			// dithering/error diffusion kernel name
			if (typeof this._dithKern === "number") this._dithKern = opts.dithKern;

			// accumulated histogram
			this._histogram = {};

			// HueStatistics instance
			this._hueStats = new HueStatistics(this._hueGroups, this._minHueCols);
		}

		// gathers histogram info
		public sample(pointBuffer : PointBuffer) {
			switch (this._method) {
				case 1:
					this._colorStats1D(pointBuffer);
					break;
				case 2:
					this._colorStats2D(pointBuffer);
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

			//console.profile("__!dither");
			if (dithKern) {
				//pointBuffer = this.ditherRiemer(pointBuffer, palette);

				if(typeof window["ditherx"] === "undefined") window["ditherx"] = true;
				if( window["ditherx"]) {
					pointBuffer = this.ditherFixWithCyclic(pointBuffer, palette, dithKern);
					console.log("new (FIXED) dither")
				} else {
					pointBuffer = this.dither(pointBuffer, palette, dithKern);
					console.log("old dither")
				}
				window["ditherx"] = !window["ditherx"];
			} else {
				var pointArray = pointBuffer.getPointArray();
				for (var i = 0, len = pointArray.length; i < len; i++) {
					pointArray[ i ].from(palette.nearestColor(pointArray[ i ]));
				}
			}
			var pointArray = pointBuffer.getPointArray(),
				len = pointArray.length;

			for (var i = 0; i < len; i++) {
				for (var p = 0, found = false; p < palette._paletteArray.length; p++) {
					if (palette._paletteArray[p].uint32 === pointArray[i].uint32) {
						found = true;
					}
				}
				if (!found) throw new Error("x");
			}
			//(<any>console).profileEnd("__!dither");
			console.log("[dither]: " + (Date.now() - start));

			/*
			 var pointArray = pointBuffer.getPointArray(),
			 len : number = pointArray.length;

			 for (var i = 0; i < len; i++) {
			 for(var p = 0, found = false; p < palette._paletteArray.length; p++) {
			 if(palette._paletteArray[p].uint32 === pointArray[i].uint32) {
			 found = true;
			 }
			 }
			 if(!found) throw new Error("x");
			 //pointArray[ i ].from(palette.nearestColor(pointArray[ i ]));
			 }

			 */
			return pointBuffer;
		}

		// adapted from http://jsbin.com/iXofIji/2/edit by PAEz
		public dither(pointBuffer : PointBuffer, palette : Palette, kernel) : PointBuffer {
			if (!kernel || !kernels[kernel]) {
				throw 'Unknown dithering kernel: ' + kernel;
			}

			var ds = kernels[kernel];

			var pointArray = pointBuffer.getPointArray(),
				width      = pointBuffer.getWidth(),
				height     = pointBuffer.getHeight(),
				dir        = 1;

			//(<any>console).profile("dither");
			for (var y = 0; y < height; y++) {
				// always serpentine
				if (true) dir = dir * -1;

				var lni    = y * width,
					xStart = dir == 1 ? 0 : width - 1,
					xEnd   = dir == 1 ? width : -1;

				for (var x = xStart, idx = lni + xStart; x !== xEnd; x += dir, idx += dir) {
					// Image pixel
					var p1 = pointArray[idx];

					// Reduced pixel
					var point = palette.nearestColor(p1);

					pointArray[idx] = point;

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

					var dStart = dir == 1 ? 0 : ds.length - 1,
						dEnd   = dir == 1 ? ds.length : -1;

					for (var i = dStart; i !== dEnd; i += dir) {
						var x1 = ds[i][1] * dir,
							y1 = ds[i][2];

						var lni2 = y1 * width;

						if (x1 + x >= 0 && x1 + x < width && y1 + y >= 0 && y1 + y < height) {
							var d = ds[i][0];
							var idx2 = idx + (lni2 + x1),
								p3   = pointArray[idx2];

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

		// adapted from http://jsbin.com/iXofIji/2/edit by PAEz
		// TODO: fixed version. it doesn't use image pixels as error storage
		public ditherFix(pointBuffer : PointBuffer, palette : Palette, kernel) : PointBuffer {
			if (!kernel || !kernels[kernel]) {
				throw 'Unknown dithering kernel: ' + kernel;
			}

			var ds = kernels[kernel];

			var pointArray = pointBuffer.getPointArray(),
				width      = pointBuffer.getWidth(),
				height     = pointBuffer.getHeight(),
				dir        = 1,
				errors = [];

			for(var i = 0; i < width * height; i++) errors[i] = [0,0,0,0];

			//(<any>console).profile("dither");
			for (var y = 0; y < height; y++) {
				// always serpentine
				if (true) dir = dir * -1;

				var lni    = y * width,
					xStart = dir == 1 ? 0 : width - 1,
					xEnd   = dir == 1 ? width : -1;

				for (var x = xStart, idx = lni + xStart; x !== xEnd; x += dir, idx += dir) {
					// Image pixel
					var p1 = pointArray[idx];

					var r4 = Math.max(0, Math.min(255, p1.r + errors[idx][0])),
						g4 = Math.max(0, Math.min(255, p1.g + errors[idx][1])),
						b4 = Math.max(0, Math.min(255, p1.b + errors[idx][2])),
						a4 = Math.max(0, Math.min(255, p1.a + errors[idx][3]));

					var np = Point.createByRGBA(r4, g4, b4, a4);

					// Reduced pixel
					var point = palette.nearestColor(np);

					pointArray[idx].from(point);

					// dithering strength
					if (this._dithDelta) {
						var dist = Utils.distEuclidean(p1.rgba, point.rgba);
						if (dist < this._dithDelta)
							continue;
					}

					// Component distance
					point = np;
					var er = p1.r - point.r,
						eg = p1.g - point.g,
						eb = p1.b - point.b,
						ea = p1.a - point.a;

					var dStart = dir == 1 ? 0 : ds.length - 1,
						dEnd   = dir == 1 ? ds.length : -1;

					for (var i = dStart; i !== dEnd; i += dir) {
						var x1 = ds[i][1] * dir,
							y1 = ds[i][2];

						var lni2 = y1 * width;

						if (x1 + x >= 0 && x1 + x < width && y1 + y >= 0 && y1 + y < height) {
							var d = ds[i][0];
							var idx2 = idx + (lni2 + x1),
								e = errors[idx2];

							e[0] = e[0] -er * d;
							e[1] = e[1] -eg * d;
							e[2] = e[2] -eb * d;
							e[3] = e[3] -ea * d;

							//pointArray[idx2].set(r4, g4, b4, a4);
						}
					}
				}
			}

			//(<any>console).profileEnd("dither");
			return pointBuffer;
		}
		// adapted from http://jsbin.com/iXofIji/2/edit by PAEz
		// TODO: fixed version. it doesn't use image pixels as error storage
		public ditherFixWithCyclic(pointBuffer : PointBuffer, palette : Palette, kernel) : PointBuffer {
			if (!kernel || !kernels[kernel]) {
				throw 'Unknown dithering kernel: ' + kernel;
			}

			var ds = kernels[kernel];

			function fillErrorLine(errorLine : number[][], width : number) {
				for(var i = 0; i < width; i++) {
					errorLine[i] = [0, 0,0 , 0];
				}
				if(errorLine.length > width) {
					errorLine.length = width;
				}
			}

			var pointArray = pointBuffer.getPointArray(),
				width      = pointBuffer.getWidth(),
				height     = pointBuffer.getHeight(),
				dir        = 1,
				errorLines = [];

			// initial error lines (number is taken from kernel)
			for(var i = 0, maxErrorLines = 1; i < ds.length; i++) {
				maxErrorLines = Math.max(maxErrorLines, ds[i][2] + 1);
			}
			for(var i = 0; i < maxErrorLines; i++) {
				fillErrorLine(errorLines[ i ] = [], width);
			}

			//(<any>console).profile("dither");
			for (var y = 0; y < height; y++) {
				// always serpentine
				if (true) dir = dir * -1;

				var lni    = y * width,
					xStart = dir == 1 ? 0 : width - 1,
					xEnd   = dir == 1 ? width : -1;

				// cyclic shift with erasing
				fillErrorLine(errorLines[ 0 ], width);
				errorLines.push(errorLines.shift());

				var errorLine = errorLines[0];

				for (var x = xStart, idx = lni + xStart; x !== xEnd; x += dir, idx += dir) {
					// Image pixel
					var p1 = pointArray[idx],
						error = errorLine[x];

					var r4 = Math.max(0, Math.min(255, p1.r + error[0])),
						g4 = Math.max(0, Math.min(255, p1.g + error[1])),
						b4 = Math.max(0, Math.min(255, p1.b + error[2])),
						a4 = Math.max(0, Math.min(255, p1.a + error[3]));

					var np = Point.createByRGBA(r4, g4, b4, a4);

					// Reduced pixel
					var point = palette.nearestColor(np);

					pointArray[idx].from(point);

					// dithering strength
					if (this._dithDelta) {
						var dist = Utils.distEuclidean(p1.rgba, point.rgba);
						if (dist < this._dithDelta)
							continue;
					}

					// Component distance
					point = np;
					var er = p1.r - point.r,
						eg = p1.g - point.g,
						eb = p1.b - point.b,
						ea = p1.a - point.a;

					var dStart = dir == 1 ? 0 : ds.length - 1,
						dEnd   = dir == 1 ? ds.length : -1;

					for (var i = dStart; i !== dEnd; i += dir) {
						var x1 = ds[i][1] * dir,
							y1 = ds[i][2];

						if (x1 + x >= 0 && x1 + x < width && y1 + y >= 0 && y1 + y < height) {
							var d = ds[i][0],
								e = errorLines[y1][x1 + x];

							e[0] = e[0] -er * d;
							e[1] = e[1] -eg * d;
							e[2] = e[2] -eb * d;
							e[3] = e[3] -ea * d;
						}
					}
				}
			}

			//(<any>console).profileEnd("dither");
			return pointBuffer;
		}

		// adapted from http://jsbin.com/iXofIji/2/edit by PAEz
		/*
		 public ditherRiemer(pointBuffer : PointBuffer, palette : Palette) : PointBuffer {
		 var pointArray = pointBuffer.getPointArray(),
		 width = pointBuffer.getWidth(),
		 height = pointBuffer.getHeight(),
		 errorArray = [],
		 weightsArray = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32];

		 var sum = 0;
		 for(var i = 0; i < weightsArray.length; i++) {
		 sum += weightsArray[i];
		 }
		 for(var i = 0; i < weightsArray.length; i++) {
		 weightsArray[i] /= sum;
		 }

		 for(var i = 0; i < 4; i++) {
		 errorArray[i] = [];
		 for(var j = 0; j < weightsArray.length; j++) {
		 errorArray[i].push(0);
		 }
		 }

		 function simpleCurve(width, height, callback : (x : number, y : number, index : number) => void) {
		 for (var y = 0, index = 0; y < height; y++) {
		 for (var x = 0; x < width; x++, index++) {
		 callback(x, y, index);
		 }

		 }
		 }

		 simpleCurve(width, height, (x, y, index) => {
		 var p = pointArray[ index];

		 for(var quadrupletIndex = 0; quadrupletIndex < errorArray.length; quadrupletIndex++) {
		 var sum = 0;
		 for(var errorArrayIndex = 0; errorArrayIndex < errorArray.length; errorArrayIndex++) {
		 sum += errorArray[quadrupletIndex][errorArrayIndex] * weightsArray[errorArrayIndex];
		 }

		 p.rgba[quadrupletIndex] = Math.max(0, Math.min(255, (p.rgba[quadrupletIndex] + sum) | 0));
		 }

		 var correctedPoint = Point.createByQuadruplet(p.rgba),
		 palettePoint = palette.nearestColor(correctedPoint);

		 for(var quadrupletIndex = 0; quadrupletIndex < errorArray.length; quadrupletIndex++) {
		 var componentErrorArray = errorArray[quadrupletIndex];
		 componentErrorArray.shift();
		 componentErrorArray.push(p.rgba[quadrupletIndex] - palettePoint.rgba[quadrupletIndex]);
		 }

		 p.from(palettePoint);
		 });
		 return pointBuffer;
		 }

		 */

/*
		public paletteMedianCut () {
			var idxi32            = this._getImportanceSortedColorsIDXI32(),
				palette : Palette = new Palette();

			var idxrgb = idxi32.map(function (i32) {
				return [
					(i32 & 0xff),
					(i32 >>> 8) & 0xff,
					(i32 >>> 16) & 0xff,
					(i32 >>> 24) & 0xff
				];
			});

			init(idxrgb);
			var arr = get_fixed_size_palette(this._colors);
			for(var i = 0; i < arr.length; i++) {
				palette._paletteArray.push(Point.createByQuadruplet(arr[i]));
			}
			console.log("MedianCut");
			return palette;
		}
*/

		// reduces histogram to palette, remaps & memoizes reduced colors
		public palette() : Palette {
			var idxi32            = this._getImportanceSortedColorsIDXI32(),
				palette : Palette = this._buildPalette(idxi32);

			palette.sort(this._hueGroups);
			console.log("Original");
			return palette;
			/*
			 var uint32Array = this._palette._paletteArray.map(point => point.uint32);
			 return tuples ? this._palette._paletteArray : new Uint8Array((new Uint32Array(uint32Array)).buffer);
			 */
		}

		private _getImportanceSortedColorsIDXI32() {
			var sorted = Utils.sortedHashKeys(this._histogram, true);

			if (sorted.length == 0)
				throw "Nothing has been sampled, palette cannot be built.";

			switch (this._method) {
				case 1:
					var initialColorsLimit = Math.min(sorted.length, this._initColors),
						last               = sorted[initialColorsLimit - 1],
						freq               = this._histogram[last];

					var idxi32 = sorted.slice(0, initialColorsLimit);

					// add any cut off colors with same freq as last
					var pos = initialColorsLimit, len = sorted.length;
					while (pos < len && this._histogram[sorted[pos]] == freq)
						idxi32.push(sorted[pos++]);

					// inject min huegroup colors
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

		// reduces similar colors from an importance-sorted Uint32 rgba array
		private _buildPalette(idxi32) {
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
			/*
			 var workPalette : Palette = new Palette(),
			 pointArray = workPalette._paletteArray,
			 pointIndex, l;

			 for(pointIndex = 0, l = idxi32.length; pointIndex < l; pointIndex++) {
			 pointArray.push(new Point(idxi32[pointIndex]));
			 }
			 */

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
					while (palLen < this._colors && k < memDist.length) {
						// re-inject rgb into final palette
						idxrgb[memDist[k][0]] = memDist[k][1];

						palLen++;
						k++;
					}
				}
			}

			var palette : Palette = new Palette();
			for (var pointIndex = 0, l = idxrgb.length; pointIndex < l; pointIndex++) {
				if (!idxrgb[pointIndex]) continue;
				palette._paletteArray.push(Point.createByQuadruplet(idxrgb[pointIndex]));
			}
			/*
			 var palette : Palette = new Palette();
			 for (pointIndex = 0, l = pointArray.length; pointIndex < l; pointIndex++) {
			 if (!pointArray[pointIndex]) continue;
			 palette._paletteArray.push(pointArray[pointIndex]);
			 }
			 */

			return palette;
		}

		// TODO: not tested method
		private _reducePalette(palette : Palette, colors : number) {
			if (palette._paletteArray.length > colors) {
				var idxi32 = this._getImportanceSortedColorsIDXI32();

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

		// global top-population
		private _colorStats1D(pointBuffer : PointBuffer) {
			var histG      = this._histogram,
				pointArray = pointBuffer.getPointArray(),
				len        = pointArray.length;

			for (var i = 0; i < len; i++) {
				var col = pointArray[i].uint32;

				// skip transparent
				//if ((col & 0xff000000) >> 24 == 0) continue;

				// collect hue stats
				this._hueStats.check(col);

				if (col in histG)
					histG[col]++;
				else
					histG[col] = 1;
			}
		}

		// population threshold within subregions
		// FIXME: this can over-reduce (few/no colors same?), need a way to keep
		// important colors that dont ever reach local thresholds (gradients?)
		private _colorStats2D(pointBuffer : PointBuffer) {
			var width      = pointBuffer.getWidth(),
				height     = pointBuffer.getHeight(),
				pointArray = pointBuffer.getPointArray();

			var boxW  = this._boxSize[0],
				boxH  = this._boxSize[1],
				area  = boxW * boxH,
				boxes = Utils.makeBoxes(width, height, boxW, boxH),
				histG = this._histogram;

			boxes.forEach(function (box) {
				var effc  = Math.max(Math.round((box.w * box.h) / area) * this._boxPxls, 2),
					histL = {},
					col;

				this._iterBox(box, width, function (i) {
					col = pointArray[i].uint32;

					// skip transparent
					//if ((col & 0xff000000) >> 24 == 0) return;

					// collect hue stats
					this._hueStats.check(col);

					if (col in histG)
						histG[col]++;
					else if (col in histL) {
						if (++histL[col] >= effc)
							histG[col] = histL[col];
					}
					else
						histL[col] = 1;
				});
			}, this);

			// inject min huegroup colors
			this._hueStats.inject(histG);
		}

		// iterates @bbox within a parent rect of width @wid; calls @fn, passing index within parent
		private _iterBox(bbox, wid, fn) {
			var b   = bbox,
				i0  = b.y * wid + b.x,
				i1  = (b.y + b.h - 1) * wid + (b.x + b.w - 1),
				cnt = 0, incr = wid - b.w + 1, i = i0;

			do {
				fn.call(this, i);
				i += (++cnt % b.w == 0) ? incr : 1;
			} while (i <= i1);
		}
	}

}
