'use strict';

const Canvas = require('canvas');
const Image = Canvas.Image;

const { RgbQuantSMS } = require('./src/rgbquant-sms');

console.log('Canvas', Canvas);

(async () => {
	while (true) { // FIXME: Debug
	
	const quant = new RgbQuantSMS({
		colors: 16,
		paletteCount: 1,
		maxTiles: 256,
		minHueCols: 0,
		weighPopularity: true
	});

	const getCanvas = async (src) => new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => {			
			const canvas = new Canvas.Canvas(img.width, img.height);
			const ctx = canvas.getContext('2d');
			ctx.drawImage(img, 0, 0, img.width, img.height);			
			resolve(canvas);
		}
		img.onerror = reject;
		img.src = src;
	});

	const canvas = await getCanvas('demo/img/biking.jpg');
	console.log('canvas', canvas);
	
	quant.sample(canvas);
	debugger;
	const palettes = quant.palettes();
	console.log('palettes', palettes)
	console.log('palettes 0', palettes[0])
	
	} FIXME: Debug
})();
