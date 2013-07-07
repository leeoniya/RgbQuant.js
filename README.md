RgbQuant.js
-----------
an image quantization lib _(MIT Licensed)_

---
### Intro

Color quantization is the process of reducing an image with thousands or millions of colors to one with fewer (usually 256). The trick is to balance speed, cpu and memory requirements while minimizing the perceptual loss in output quality. More info can be found on [wikipedia](http://en.wikipedia.org/wiki/Color_quantization). Various algorithms can be found on [rosettacode.org](http://rosettacode.org/wiki/Color_quantization).

The motivation for this lib came from the lack of a JS quantizer which could produce fast results with few artifacts while reducing graphics. For general-purpose quantization of photographs, I highly recommend NeuQuant.

RgbQuant.js is not a port or implementation of any specific quantization algorithm, though some overlap is inevitable.

---
### Usage

**Use Chrome or Firefox** since many HTML5/JS features are used. Canvas, Typed Arrays, Array.forEach.

```js
// options with defaults (not required)
var opts = {
    colors: 256,        // desired palette size
    method: 2,          // histogram method, 2: min-population threshold within subregions; 1: global top-population
    boxSize: [64,64],   // subregion dims (if method = 2)
    boxPxls: 2,         // min-population threshold (if method = 2)
    initColors: 4096,   // # of top-occurring colors  to start with (if method = 1)
	minHueCols: 0,		// # of colors per hue group to evaluate regardless of counts, to retain low-count hues
};

var q = new RgbQuant(opts);

// analyze histograms
q.sample(imgA);
q.sample(imgB);
q.sample(imgC);

// build palette
var pal = q.palette();

// reduce images
var outA = q.reduce(imgA),
    outB = q.reduce(imgB),
    outC = q.reduce(imgC);
```

---
### Docs

**.sample(image, width)** - Performs histogram analysis
`image` may be any of *&lt;img&gt;*, *&lt;canvas&gt;*, *Context2D*, *ImageData*, *Typed Array*, *Array*. `width` is required if `image` is an array.

**.palette(tuples)** - Retrieves the palette, building it on first call.
Returned type is a Uint8Array unless `tuples` is `true`, then an array of `[r,g,b]` tuples.

**.reduce(image, indexed)** - Quantizes an image
Returned type matches `image`'s type unless `indexed` is `true`, then an indexed array. Transparent pixels will result in a sparse indexed array.