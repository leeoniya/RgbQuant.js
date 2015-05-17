/// <reference path='../colorQuant.ts' />

var width = 32,
	height = 32,
	imageArray = [];

for(var i = 0; i < width * height * 4; i++) {
	imageArray[i] = (Math.random() * 256) | 0;
}

for(var i = 0; i < 100; i++) {
	var start = Date.now();

	var cq = new ColorQuantization.RgbQuant({
		colors : 1024,
		dithKern : "SierraLite"
	});

	var pointBuffer = new ColorQuantization.PointBuffer();
	pointBuffer.importArray(imageArray, width, height);

	cq.sample(pointBuffer);

	var pal8 = cq.palette();

	var img8 = cq.reduce(pointBuffer, pal8).exportUint8Array();

	console.log(i + ": " + (Date.now() - start));
}
