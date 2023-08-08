'use strict';

const { RgbQuantSMS } = require('./src/rgbquant-sms');
console.log('RgbQuantSMS', RgbQuantSMS);

const quant = new RgbQuantSMS({
	colors: 16,
	paletteCount: 1,
	maxTiles: 256,
	minHueCols: 0,
	weighPopularity: true
});
console.log('quant', quant);
