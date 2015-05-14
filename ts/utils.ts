module ColorQuantization.Utils {

	// Rec. 709 (sRGB) luma coef
	var Pr = .2126,
		Pg = .7152,
		Pb = .0722,
		Pa = 1; // TODO: (igor-bezkrovny) what should be here?

	// test if js engine's Array#sort implementation is stable
	function isArrSortStable() {
		var str = "abcdefghijklmnopqrstuvwxyz";

		return "xyzvwtursopqmnklhijfgdeabc" == str.split("").sort(function (a, b) {
				return ~~(str.indexOf(b) / 2.3) - ~~(str.indexOf(a) / 2.3);
			}).join("");
	}

	// TODO: move to separate file like "utils.ts" - it is used by colorQuant too!
	export function typeOf(val) {
		return Object.prototype.toString.call(val).slice(8, -1);
	}

	// http://alienryderflex.com/hsp.html
	export function rgb2lum(r, g, b) {
		return Math.sqrt(
			Pr * r * r +
			Pg * g * g +
			Pb * b * b
		);
	}

	// http://rgb2hsl.nichabi.com/javascript-function.php
	export function rgb2hsl(r, g, b) {
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

	export function hueGroup(hue, segs) {
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

	export function satGroup(sat) {
		return sat;
	}

	export function lumGroup(lum) {
		return lum;
	}

	export var sort = isArrSortStable() ? Array.prototype.sort : stableSort;

	// must be used via stableSort.call(arr, fn)
	export function stableSort(fn) {
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

	// returns uniform pixel data from various img
	// TODO?: if array is passed, createimagedata, createlement canvas? take a pxlen?
	export function getImageData(img, width?) {
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
	export function makeBoxes(wid, hgt, w0, h0) {
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
	export function sortedHashKeys(obj, desc) {
		var keys = Object.keys(obj);
		if(desc) {
			return sort.call(keys, function (a, b) {
				return obj[ b ] - obj[ a ];
			});
		} else {
			return sort.call(keys, function (a, b) {
				return obj[ a ] - obj[ b ];
			});
		}
	}

	var rd = 255,
		gd = 255,
		bd = 255,
		ad = 255;

	var euclMax = Math.sqrt(Pr * rd * rd + Pg * gd * gd + Pb * bd * bd + Pa * ad * ad);
	// perceptual Euclidean color distance
	export function distEuclidean(rgb0, rgb1) {
		var rd = rgb1[ 0 ] - rgb0[ 0 ],
			gd = rgb1[ 1 ] - rgb0[ 1 ],
			bd = rgb1[ 2 ] - rgb0[ 2 ],
			ad = rgb1[ 3 ] - rgb0[ 3 ];

		return Math.sqrt(Pr * rd * rd + Pg * gd * gd + Pb * bd * bd + Pa * ad * ad) / euclMax;
	}

/*
	var manhMax = Pr * rd + Pg * gd + Pb * bd + Pa * ad;
	// perceptual Manhattan color distance
	function distManhattan(rgb0, rgb1) {
		var rd = Math.abs(rgb1[ 0 ] - rgb0[ 0 ]),
			gd = Math.abs(rgb1[ 1 ] - rgb0[ 1 ]),
			bd = Math.abs(rgb1[ 2 ] - rgb0[ 2 ]),
			ad = Math.abs(rgb1[ 3 ] - rgb0[ 3 ]);

		return (Pr * rd + Pg * gd + Pb * bd + Pa * ad) / manhMax;
	}
*/

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
/*
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
		/!*
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

		 *!/
		var alphas = rgb1[ 3 ] - rgb0[ 3 ],
			dist = colordifference_ch(rgb0[ 0 ], rgb1[ 0 ], alphas) +
				colordifference_ch(rgb0[ 1 ], rgb1[ 1 ], alphas) +
				colordifference_ch(rgb0[ 2 ], rgb1[ 2 ], alphas);

		if (dist > rgbaMax) {
			console.log(dist);
		}

		return dist / rgbaMax;
	}
*/

}
