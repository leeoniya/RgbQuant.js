/*
* Copyright (c) 2015, Leon Sorokin
* All rights reserved. (MIT Licensed)
*
* RgbQuant.js - an image quantization lib
*/

/// <reference path='./hueStatistics.ts' />
module ColorQuantization {

	// Rec. 709 (sRGB) luma coef
	var Pr = .2126,
		Pg = .7152,
		Pb = .0722,
		Pa = 1; // TODO: (igor-bezkrovny) what should be here?

	// http://alienryderflex.com/hsp.html
	function rgb2lum(r, g, b) {
		return Math.sqrt(
			Pr * r * r +
			Pg * g * g +
			Pb * b * b
		);
	}

	// http://rgb2hsl.nichabi.com/javascript-function.php
	function rgb2hsl(r, g, b) {
		var max, min, h, s, l, d;
		r /= 255;
		g /= 255;
		b /= 255;
		max = Math.max(r, g, b);
		min = Math.min(r, g, b);
		l = (max + min) / 2;
		if (max == min) {
			h = s = 0;
		} else {
			d = max - min;
			s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
			switch (max) {
				case r:
					h = (g - b) / d + (g < b ? 6 : 0);
					break;
				case g:
					h = (b - r) / d + 2;
					break;
				case b:
					h = (r - g) / d + 4;
					break
			}
			h /= 6;
		}
//		h = Math.floor(h * 360)
//		s = Math.floor(s * 100)
//		l = Math.floor(l * 100)
		return {
			h: h,
			s: s,
			l: rgb2lum(r, g, b)
		};
	}

	function hueGroup(hue, segs) {
		var seg = 1 / segs,
			haf = seg / 2;

		if (hue >= 1 - haf || hue <= haf)
			return 0;

		for (var i = 1; i < segs; i++) {
			var mid = i * seg;
			if (hue >= mid - haf && hue <= mid + haf)
				return i;
		}
	}

	function satGroup(sat) {
		return sat;
	}

	function lumGroup(lum) {
		return lum;
	}

	function typeOf(val) {
		return Object.prototype.toString.call(val).slice(8, -1);
	}

	var sort = isArrSortStable() ? Array.prototype.sort : stableSort;

	// must be used via stableSort.call(arr, fn)
	function stableSort(fn) {
		var type = typeOf(this[ 0 ]);

		if (type == "Number" || type == "String") {
			var ord = {}, len = this.length, val;

			for (var i = 0; i < len; i++) {
				val = this[ i ];
				if (ord[ val ] || ord[ val ] === 0) continue;
				ord[ val ] = i;
			}

			return this.sort(function (a, b) {
				return fn(a, b) || ord[ a ] - ord[ b ];
			});
		}
		else {
			var ord2 = this.map(function (v) {
				return v
			});

			return this.sort(function (a, b) {
				return fn(a, b) || ord2.indexOf(a) - ord2.indexOf(b);
			});
		}
	}

	// test if js engine's Array#sort implementation is stable
	function isArrSortStable() {
		var str = "abcdefghijklmnopqrstuvwxyz";

		return "xyzvwtursopqmnklhijfgdeabc" == str.split("").sort(function (a, b) {
				return ~~(str.indexOf(b) / 2.3) - ~~(str.indexOf(a) / 2.3);
			}).join("");
	}

	// returns uniform pixel data from various img
	// TODO?: if array is passed, createimagedata, createlement canvas? take a pxlen?
	function getImageData(img, width?) {
		var can, ctx, imgd, buf8, buf32, height;

		switch (typeOf(img)) {
			case "HTMLImageElement":
				can = document.createElement("canvas");
				can.width = img.naturalWidth;
				can.height = img.naturalHeight;
				ctx = can.getContext("2d");
				ctx.drawImage(img, 0, 0);
			case "Canvas":
			case "HTMLCanvasElement":
				can = can || img;
				ctx = ctx || can.getContext("2d");
			case "CanvasRenderingContext2D":
				ctx = ctx || img;
				can = can || ctx.canvas;
				imgd = ctx.getImageData(0, 0, can.width, can.height);
			case "ImageData":
				imgd = imgd || img;
				width = imgd.width;
				if (typeOf(imgd.data) == "CanvasPixelArray")
					buf8 = new Uint8Array(imgd.data);
				else
					buf8 = imgd.data;
			case "Array":
			case "CanvasPixelArray":
				buf8 = buf8 || new Uint8Array(img);
			case "Uint8Array":
			case "Uint8ClampedArray":
				buf8 = buf8 || img;
				buf32 = new Uint32Array(buf8.buffer);
			case "Uint32Array":
				buf32 = buf32 || img;
				buf8 = buf8 || new Uint8Array(buf32.buffer);
				width = width || buf32.length;
				height = buf32.length / width;
		}

		return {
			can   : can,
			ctx   : ctx,
			imgd  : imgd,
			buf8  : buf8,
			buf32 : buf32,
			width : width,
			height: height
		};
	}

	// partitions a rect of wid x hgt into
	// array of bboxes of w0 x h0 (or less)
	function makeBoxes(wid, hgt, w0, h0) {
		var wnum = ~~(wid / w0), wrem = wid % w0,
			hnum = ~~(hgt / h0), hrem = hgt % h0,
			xend = wid - wrem, yend = hgt - hrem;

		var bxs = [];
		for (var y = 0; y < hgt; y += h0)
			for (var x = 0; x < wid; x += w0)
				bxs.push({x: x, y: y, w: (x == xend ? wrem : w0), h: (y == yend ? hrem : h0)});

		return bxs;
	}

	// returns array of hash keys sorted by their values
	function sortedHashKeys(obj, desc) {
		var keys = [];

		for (var key in obj)
			keys.push(key);

		return sort.call(keys, function (a, b) {
			return desc ? obj[ b ] - obj[ a ] : obj[ a ] - obj[ b ];
		});
	}

	var rd = 255,
		gd = 255,
		bd = 255,
		ad = 255;

	var euclMax = Math.sqrt(Pr * rd * rd + Pg * gd * gd + Pb * bd * bd + Pa * ad * ad);
	// perceptual Euclidean color distance
	function distEuclidean(rgb0, rgb1) {
		var rd = rgb1[ 0 ] - rgb0[ 0 ],
			gd = rgb1[ 1 ] - rgb0[ 1 ],
			bd = rgb1[ 2 ] - rgb0[ 2 ],
			ad = rgb1[ 3 ] - rgb0[ 3 ];

		return Math.sqrt(Pr * rd * rd + Pg * gd * gd + Pb * bd * bd + Pa * ad * ad) / euclMax;
	}

	var manhMax = Pr * rd + Pg * gd + Pb * bd + Pa * ad;
	// perceptual Manhattan color distance
	function distManhattan(rgb0, rgb1) {
		var rd = Math.abs(rgb1[ 0 ] - rgb0[ 0 ]),
			gd = Math.abs(rgb1[ 1 ] - rgb0[ 1 ]),
			bd = Math.abs(rgb1[ 2 ] - rgb0[ 2 ]),
			ad = Math.abs(rgb1[ 3 ] - rgb0[ 3 ]);

		return (Pr * rd + Pg * gd + Pb * bd + Pa * ad) / manhMax;
	}

	/*
	 Finally, I've found it! After thorough testing and experimentation my conclusions are:

	 The correct way is to calculate maximum possible difference between the two colors.
	 Formulas with any kind of estimated average/typical difference had room for non-linearities.

	 I was unable to find correct formula that calculates the distance without blending RGBA colors with backgrounds.

	 There is no need to take every possible background color into account, only extremes per R/G/B channel, i.e. for red channel:

	 blend both colors with 0 red as background, measure squared difference
	 blend both colors with max red background, measure squared difference
	 take higher of the two.
	 Fortunately blending with "white" and "black" is trivial when you use premultiplied alpha (r = r×a).

	 The complete formula is:
	 max((r?-r?)², (r?-r? - a?+a?)²) +
	 max((g?-g?)², (g?-g? - a?+a?)²) +
	 max((b?-b?)², (b?-b? - a?+a?)²)
	 */
	function colordifference_ch(x, y, alphas) {
		// maximum of channel blended on white, and blended on black
		// premultiplied alpha and backgrounds 0/1 shorten the formula
		var black = x - y, // [-255; 255]
			white = black + alphas; // [-255; 255*2]

		return Math.max(black * black, white * white); // [0; 255^2 + (255*2)^2]
	}

	//var rgbaMax = (255*255 + (255*2) * (255*2)) * 3;
	var rgbaMax = Math.pow(255 << 1, 2) * 3;

	function distRGBA(rgb0, rgb1) {
		/*
		 var r1 = rgb0[0],
		 g1 = rgb0[1],
		 b1 = rgb0[2],
		 a1 = rgb0[3];

		 var r2 = rgb1[0],
		 g2 = rgb1[1],
		 b2 = rgb1[2],
		 a2 = rgb1[3];

		 var dr = r1 - r2,
		 dg = g1 - g2,
		 db = b1 - b2,
		 da = a1 - a2;

		 return (Math.max(dr << 1, dr - da << 1) +
		 Math.max(dg << 1, dg - da << 1) +
		 Math.max(db << 1, db - da << 1)) / rgbaMax;

		 */
		var alphas = rgb1[ 3 ] - rgb0[ 3 ],
			dist = colordifference_ch(rgb0[ 0 ], rgb1[ 0 ], alphas) +
				colordifference_ch(rgb0[ 1 ], rgb1[ 1 ], alphas) +
				colordifference_ch(rgb0[ 2 ], rgb1[ 2 ], alphas);

		if (dist > rgbaMax) {
			console.log(dist);
		}

		return dist / rgbaMax;
	}

	// http://www.tannerhelland.com/4660/dithering-eleven-algorithms-source-code/
	var kernels = {
		FloydSteinberg     : [
			[ 7 / 16, 1, 0 ],
			[ 3 / 16, -1, 1 ],
			[ 5 / 16, 0, 1 ],
			[ 1 / 16, 1, 1 ]
		],
		FalseFloydSteinberg: [
			[ 3 / 8, 1, 0 ],
			[ 3 / 8, 0, 1 ],
			[ 2 / 8, 1, 1 ]
		],
		Stucki             : [
			[ 8 / 42, 1, 0 ],
			[ 4 / 42, 2, 0 ],
			[ 2 / 42, -2, 1 ],
			[ 4 / 42, -1, 1 ],
			[ 8 / 42, 0, 1 ],
			[ 4 / 42, 1, 1 ],
			[ 2 / 42, 2, 1 ],
			[ 1 / 42, -2, 2 ],
			[ 2 / 42, -1, 2 ],
			[ 4 / 42, 0, 2 ],
			[ 2 / 42, 1, 2 ],
			[ 1 / 42, 2, 2 ]
		],
		Atkinson           : [
			[ 1 / 8, 1, 0 ],
			[ 1 / 8, 2, 0 ],
			[ 1 / 8, -1, 1 ],
			[ 1 / 8, 0, 1 ],
			[ 1 / 8, 1, 1 ],
			[ 1 / 8, 0, 2 ]
		],
		Jarvis             : [			// Jarvis, Judice, and Ninke / JJN?
			[ 7 / 48, 1, 0 ],
			[ 5 / 48, 2, 0 ],
			[ 3 / 48, -2, 1 ],
			[ 5 / 48, -1, 1 ],
			[ 7 / 48, 0, 1 ],
			[ 5 / 48, 1, 1 ],
			[ 3 / 48, 2, 1 ],
			[ 1 / 48, -2, 2 ],
			[ 3 / 48, -1, 2 ],
			[ 5 / 48, 0, 2 ],
			[ 3 / 48, 1, 2 ],
			[ 1 / 48, 2, 2 ]
		],
		Burkes             : [
			[ 8 / 32, 1, 0 ],
			[ 4 / 32, 2, 0 ],
			[ 2 / 32, -2, 1 ],
			[ 4 / 32, -1, 1 ],
			[ 8 / 32, 0, 1 ],
			[ 4 / 32, 1, 1 ],
			[ 2 / 32, 2, 1 ],
		],
		Sierra             : [
			[ 5 / 32, 1, 0 ],
			[ 3 / 32, 2, 0 ],
			[ 2 / 32, -2, 1 ],
			[ 4 / 32, -1, 1 ],
			[ 5 / 32, 0, 1 ],
			[ 4 / 32, 1, 1 ],
			[ 2 / 32, 2, 1 ],
			[ 2 / 32, -1, 2 ],
			[ 3 / 32, 0, 2 ],
			[ 2 / 32, 1, 2 ]
		],
		TwoSierra          : [
			[ 4 / 16, 1, 0 ],
			[ 3 / 16, 2, 0 ],
			[ 1 / 16, -2, 1 ],
			[ 2 / 16, -1, 1 ],
			[ 3 / 16, 0, 1 ],
			[ 2 / 16, 1, 1 ],
			[ 1 / 16, 2, 1 ]
		],
		SierraLite         : [
			[ 2 / 4, 1, 0 ],
			[ 1 / 4, -1, 1 ],
			[ 1 / 4, 0, 1 ]
		]
	};


	export enum RgbQuantDitheringKernel {
		NONE = 0
	}
	export class RgbQuant {
		// 1 = by global population, 2 = subregion population threshold
		private method : number = 2;

		// desired final palette size
		private colors : number = 256;

		// # of highest-frequency colors to start with for palette reduction
		private initColors : number;

		// color-distance threshold for initial reduction pass
		private initDist = 0.01;

		// subsequent passes threshold
		private distIncr : number = 0.005;

		// palette grouping
		private hueGroups : number = 10;
		private satGroups : number = 10;
		private lumGroups : number = 10;

		// if > 0, enables hues stats and min-color retention per group
		private minHueCols : number;

		// HueStatistics instance
		private hueStats : HueStatistics;

		// subregion partitioning box size
		private boxSize = [ 64, 64 ];

		// number of same pixels required within box for histogram inclusion
		private boxPxls = 2;

		// palette locked indicator
		private palLocked = false;

		// palette sort order
//		this.sortPal = ['hue-','lum-','sat-'];

		// dithering/error diffusion kernel name
		private dithKern : RgbQuantDitheringKernel = RgbQuantDitheringKernel.NONE;

		// dither serpentine pattern
		private dithSerp = true;

		// minimum color difference (0-1) needed to dither
		private dithDelta = 0;

		// accumulated histogram
		private histogram = {};

		// palette - rgb triplets
		private idxrgb = [];

		// palette - int32 vals
		private idxi32 = [];

		// reverse lookup {i32:idx}
		private i32idx = {};

		// {i32:rgb}
		private i32rgb = {};

		// enable color caching (also incurs overhead of cache misses and cache building)
		private useCache = true;

		// min color occurance count needed to qualify for caching
		private cacheFreq = 10;

		// allows pre-defined palettes to be re-indexed (enabling palette compacting and sorting)
		private reIndex = true;

		constructor(opts) {
			opts = opts || {};

			// 1 = by global population, 2 = subregion population threshold
			if (typeof opts.method === "number") this.method = opts.method;

			// desired final palette size
			if (typeof opts.colors === "number") this.colors = opts.colors;

			// # of highest-frequency colors to start with for palette reduction
			this.initColors = this.colors << 2;//opts.initColors || 65536; //4096;
			// if > 0, enables hues stats and min-color retention per group
			this.minHueCols = this.colors << 2;//opts.minHueCols || 0;

			// HueStatistics instance
			this.hueStats = this.minHueCols ? new HueStatistics(this.hueGroups, this.minHueCols) : null;

			// dithering/error diffusion kernel name
			if (typeof this.dithKern === "number") this.dithKern = opts.dithKern;

			// accumulated histogram
			this.histogram = {};
			// palette - rgb triplets
			if (Object.prototype.toString.call(opts.palette) === "[object Array]") this.idxrgb = opts.palette.slice(0);

			// if pre-defined palette, build lookups
			if (this.idxrgb.length > 0) {
				this.idxrgb.forEach(function (rgb, i) {
					var alpha = rgb.length >= 4 ? rgb[ 3 ] : 255,
						i32 = (
							(alpha << 24) |	// alpha
							(rgb[ 2 ] << 16) |	// blue
							(rgb[ 1 ] << 8) |	// green
							rgb[ 0 ]				// red
							) >>> 0;

					this.idxi32[ i ] = i32;
					this.i32idx[ i32 ] = i;
					this.i32rgb[ i32 ] = rgb;
				}, this);
			}
		}

		// gathers histogram info
		public sample(img, width) {
			if (this.palLocked)
				throw "Cannot sample additional images, palette already assembled.";

			var data = getImageData(img, width);

			switch (this.method) {
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
			if (!this.palLocked)
				this.buildPal();

			dithKern = dithKern || this.dithKern;
			dithSerp = typeof dithSerp != "undefined" ? dithSerp : this.dithSerp;

			retType = retType || 1;

			// reduce w/dither
			var buf32;
			if (dithKern)
				buf32 = this.dither(img, dithKern, dithSerp);
			else {
				var data = getImageData(img);
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
					out[ i ] = this.i32idx[ i32 ];
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

			var data = getImageData(img),
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
					if (this.dithDelta) {
						var dist = distEuclidean([ r1, g1, b1, a1 ], [ r2, g2, b2, a2 ]);
						if (dist < this.dithDelta)
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
			if (this.palLocked || this.idxrgb.length > 0 && this.idxrgb.length <= this.colors) return;

			var histG = this.histogram,
				sorted = sortedHashKeys(histG, true);

			if (sorted.length == 0)
				throw "Nothing has been sampled, palette cannot be built.";

			switch (this.method) {
				case 1:
					var cols = this.initColors,
						last = sorted[ cols - 1 ],
						freq = histG[ last ];

					var idxi32 = sorted.slice(0, cols);

					// add any cut off colors with same freq as last
					var pos = cols, len = sorted.length;
					while (pos < len && histG[ sorted[ pos ] ] == freq)
						idxi32.push(sorted[ pos++ ]);

					// inject min huegroup colors
					if (this.hueStats)
						this.hueStats.inject(idxi32);

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

			if (!noSort && this.reIndex)
				this.sortPal();

			// build cache of top histogram colors
			if (this.useCache)
				this.cacheHistogram(idxi32);

			this.palLocked = true;
		}

		public palette(tuples, noSort) : any {
			this.buildPal(noSort);
			return tuples ? this.idxrgb : new Uint8Array((new Uint32Array(this.idxi32)).buffer);
		}

		public prunePal(keep) {
			var i32;

			for (var j = 0; j < this.idxrgb.length; j++) {
				if (!keep[ j ]) {
					i32 = this.idxi32[ j ];
					this.idxrgb[ j ] = null;
					this.idxi32[ j ] = null;
					delete this.i32idx[ i32 ];
				}
			}

			// compact
			if (this.reIndex) {
				var idxrgb = [],
					idxi32 = [],
					i32idx = {};

				for (var j = 0, i = 0; j < this.idxrgb.length; j++) {
					if (this.idxrgb[ j ]) {
						i32 = this.idxi32[ j ];
						idxrgb[ i ] = this.idxrgb[ j ];
						i32idx[ i32 ] = i;
						idxi32[ i ] = i32;
						i++;
					}
				}

				this.idxrgb = idxrgb;
				this.idxi32 = idxi32;
				this.i32idx = i32idx;
			}
		}

		// reduces similar colors from an importance-sorted Uint32 rgba array
		public reducePal(idxi32) {
			// if pre-defined palette's length exceeds target
			if (this.idxrgb.length > this.colors) {
				// quantize histogram to existing palette
				var len = idxi32.length, keep = {}, uniques = 0, idx, pruned = false;

				for (var i = 0; i < len; i++) {
					// palette length reached, unset all remaining colors (sparse palette)
					if (uniques == this.colors && !pruned) {
						this.prunePal(keep);
						pruned = true;
					}

					idx = this.nearestIndex(idxi32[ i ]);

					if (uniques < this.colors && !keep[ idx ]) {
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
					thold = this.initDist;

				// palette already at or below desired length
				if (palLen > this.colors) {
					while (palLen > this.colors) {
						var memDist = [];

						// iterate palette
						for (var i = 0; i < len; i++) {
							var pxi = idxrgb[ i ], i32i = idxi32[ i ];
							if (!pxi) continue;

							for (var j = i + 1; j < len; j++) {
								var pxj = idxrgb[ j ], i32j = idxi32[ j ];
								if (!pxj) continue;

								var dist = distEuclidean(pxi, pxj);

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
						thold += (palLen > this.colors * 3) ? this.initDist : this.distIncr;
					}

					// if palette is over-reduced, re-add removed colors with largest distances from last round
					if (palLen < this.colors) {
						// sort descending
						sort.call(memDist, function (a, b) {
							return b[ 3 ] - a[ 3 ];
						});

						var k = 0;
						while (palLen < this.colors) {
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

					this.idxrgb.push(idxrgb[ i ]);
					this.idxi32.push(idxi32[ i ]);

					this.i32idx[ idxi32[ i ] ] = this.idxi32.length - 1;
					this.i32rgb[ idxi32[ i ] ] = idxrgb[ i ];
				}
			}
		}

		// global top-population
		public colorStats1D(buf32) {
			var histG = this.histogram,
				num = 0, col,
				len = buf32.length;

			for (var i = 0; i < len; i++) {
				col = buf32[ i ];

				// skip transparent
				if ((col & 0xff000000) >> 24 == 0) continue;

				// collect hue stats
				if (this.hueStats)
					this.hueStats.check(col);

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
			var boxW = this.boxSize[ 0 ],
				boxH = this.boxSize[ 1 ],
				area = boxW * boxH,
				boxes = makeBoxes(width, buf32.length / width, boxW, boxH),
				histG = this.histogram;

			boxes.forEach(function (box) {
				var effc = Math.max(Math.round((box.w * box.h) / area) * this.boxPxls, 2),
					histL = {}, col;

				this.iterBox(box, width, function (i) {
					col = buf32[ i ];

					// skip transparent
					if ((col & 0xff000000) >> 24 == 0) return;

					// collect hue stats
					if (this.hueStats)
						this.hueStats.check(col);

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

			if (this.hueStats)
				this.hueStats.inject(histG);
		}

		// TODO: group very low lum and very high lum colors
		// TODO: pass custom sort order
		public sortPal() {
			var self = this;

			this.idxi32.sort(function (a, b) {
				var idxA = self.i32idx[ a ],
					idxB = self.i32idx[ b ],
					rgbA = self.idxrgb[ idxA ],
					rgbB = self.idxrgb[ idxB ];

				var hslA = rgb2hsl(rgbA[ 0 ], rgbA[ 1 ], rgbA[ 2 ]),
					hslB = rgb2hsl(rgbB[ 0 ], rgbB[ 1 ], rgbB[ 2 ]);

				// sort all grays + whites together
				var hueA = (rgbA[ 0 ] == rgbA[ 1 ] && rgbA[ 1 ] == rgbA[ 2 ]) ? -1 : hueGroup(hslA.h, self.hueGroups);
				var hueB = (rgbB[ 0 ] == rgbB[ 1 ] && rgbB[ 1 ] == rgbB[ 2 ]) ? -1 : hueGroup(hslB.h, self.hueGroups);

				var hueDiff = hueB - hueA;
				if (hueDiff) return -hueDiff;

				var lumDiff = lumGroup(+hslB.l.toFixed(2)) - lumGroup(+hslA.l.toFixed(2));
				if (lumDiff) return -lumDiff;

				var satDiff = satGroup(+hslB.s.toFixed(2)) - satGroup(+hslA.s.toFixed(2));
				if (satDiff) return -satDiff;
			});

			// sync idxrgb & i32idx
			this.idxi32.forEach(function (i32, i) {
				this.idxrgb[ i ] = this.i32rgb[ i32 ];
				this.i32idx[ i32 ] = i;
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
			return idx === null ? 0 : this.idxi32[ idx ];
		}

		// TOTRY: use HUSL - http://boronine.com/husl/
		public nearestIndex(i32) {
			// alpha 0 returns null index
			if ((i32 & 0xff000000) >> 24 == 0)
				return null;

			if (this.useCache && ("" + i32) in this.i32idx)
				return this.i32idx[ i32 ];

			var min = 1000,
				idx,
				rgb = [
					(i32 & 0xff),
					(i32 >>> 8) & 0xff,
					(i32 >>> 16) & 0xff,
					(i32 >>> 24) & 0xff
				],
				len = this.idxrgb.length;

			for (var i = 0; i < len; i++) {
				if (!this.idxrgb[ i ]) continue;		// sparse palettes

				var dist = distEuclidean(rgb, this.idxrgb[ i ]);

				if (dist < min) {
					min = dist;
					idx = i;
				}
			}

			return idx;
		}

		public cacheHistogram(idxi32) {
			for (var i = 0, i32 = idxi32[ i ]; i < idxi32.length && this.histogram[ i32 ] >= this.cacheFreq; i32 = idxi32[ i++ ])
				this.i32idx[ i32 ] = this.nearestIndex(i32);
		}
	}

}
