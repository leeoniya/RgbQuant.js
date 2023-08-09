'use strict';

const Canvas = require('canvas');
const Image = Canvas.Image;

const { RgbQuantSMS } = require('./src/rgbquant-sms');

function drawPixels(idxi8, width0, width1) {
	var idxi32 = new Uint32Array(idxi8.buffer);

	width1 = width1 || width0;

	const canvasWidth = width0;
	const canvasHeight = Math.ceil(idxi32.length / width0);

	var can = new Canvas.Canvas(canvasWidth, canvasHeight),
		can2 = new Canvas.Canvas(canvasWidth, canvasHeight),
		ctx = can.getContext("2d"),
		ctx2 = can2.getContext("2d");

	ctx.imageSmoothingEnabled = ctx.mozImageSmoothingEnabled = ctx.webkitImageSmoothingEnabled = ctx.msImageSmoothingEnabled = false;
	ctx2.imageSmoothingEnabled = ctx2.mozImageSmoothingEnabled = ctx2.webkitImageSmoothingEnabled = ctx2.msImageSmoothingEnabled = false;

	var imgd = ctx.createImageData(can.width, can.height);

	var buf32 = new Uint32Array(imgd.data.buffer);
	buf32.set(idxi32);

	ctx.putImageData(imgd, 0, 0);

	ctx2.drawImage(can, 0, 0, can2.width, can2.height);

	return can2;
}

const tileMapToCanvas = tileMap => {
	var image = new RgbQuantSMS.IndexedImage(tileMap.mapW * 8, tileMap.mapH * 8, tileMap.palettes);
	image.drawMap(tileMap);
	var	ican = drawPixels(image.toRgbBytes(), image.width);
	return ican;
}

const convert = async (src, options) => {
	const quant = new RgbQuantSMS(options);

	const getCanvas = async (src) => new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => {			
			const canvas = new Canvas.Canvas(img.width, img.height);
			const ctx = canvas.getContext('2d');			
			ctx.drawImage(img, 0, 0, img.width, img.height);
			canvas._typeWorkaround = 'Canvas';
			resolve(canvas);
		}
		img.onerror = reject;
		img.src = src;
	});

	const canvas = await getCanvas(src);
	
	const reducedTileMap = quant.convert(canvas);
	console.log('reducedTileMap', { reducedTileMap, tileCount: reducedTileMap.tiles.length });
	
	const outCanvas = tileMapToCanvas(reducedTileMap);
	console.log('outCanvas', outCanvas);
}

/* if called directly from command line or from a shell script */
if (require.main === module) {
	const yargs = require('yargs');

	const commandLine = yargs.scriptName('rgbquant-sms')
		.usage('$0 <cmd> [args]')
		.command('convert <src>', 'Converts an image into a png with the tile count reduced', (yargs) => {
			yargs.positional('src', {
				type: 'string',
				describe: 'The source image, the one that will be converted'
			});
		})
		.demandCommand(1, 'You need to inform at least one command before moving on')
		.strict()
		.help()
		.argv;
		
	console.log('commandLine', commandLine);
	
	if (commandLine._.includes('convert')) {
		convert(commandLine.src, {
			colors: 16,
			paletteCount: 1,
			maxTiles: 256,
			minHueCols: 0,
			weighPopularity: true
		});
	}
}

module.exports = { RgbQuantSMS, convert };