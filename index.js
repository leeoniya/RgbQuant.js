'use strict';

const Canvas = require('canvas');
const Image = Canvas.Image;

const { RgbQuantSMS } = require('./src/rgbquant-sms');

(async () => {
	const quant = new RgbQuantSMS({
		colors: 16,
		paletteCount: 1,
		maxTiles: 256,
		minHueCols: 0,
		weighPopularity: true
	});

	const getImg = async (src) => new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = reject;
		img.src = src;
	});

	const img = await getImg('demo/img/biking.jpg');
	console.log('img', img)
	
	quant.sample(img);
	const palettes = quant.palettes();
	console.log('palettes', palettes)
	console.log('palettes 0', palettes[0])
})();
