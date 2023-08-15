#!/usr/bin/env node

'use strict';

const fs = require('fs');
const _ = require('underscore');

const Canvas = require('canvas');
const Image = Canvas.Image;

const { RgbQuantSMS } = require('./src/rgbquant-sms');

// From `helpers.js`
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

// From `demo.js`
const tileMapToCanvas = tileMap => {
	var image = new RgbQuantSMS.IndexedImage(tileMap.mapW * 8, tileMap.mapH * 8, tileMap.palettes);
	image.drawMap(tileMap);
	var	ican = drawPixels(image.toRgbBytes(), image.width);
	return ican;
}

const convert = async (src, dest, options) => {
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
	
	const saveToFile = (fileName, tileMap) => {
		const outCanvas = tileMapToCanvas(tileMap);	
		const buffer = outCanvas.toBuffer('image/png');
		fs.writeFileSync(fileName, buffer);
	}

	const canvas = await getCanvas(src);
	
	const reducedTileMap = quant.convert(canvas);

	saveToFile(dest, reducedTileMap);
}

/* if called directly from command line or from a shell script */
if (require.main === module) {
	const yargs = require('yargs');

	const commandLine = yargs.scriptName('rgbquant-sms')
		.usage('$0 <cmd> [args]')
		.command('convert <src> <dest>', 'Converts an image into a png with the tile count reduced', (yargs) => {
			yargs
				.positional('src', {
					type: 'string',
					describe: 'The source image, the one that will be converted'
				})
				.positional('dest', {
					type: 'string',
					describe: 'The destination image that will be generated'
				})
				.options({
					'colors': {
						default: 16,
						describe: 'Desired palette size',
						type: 'integer'
					},
					'max-tiles': {
						default: 256,
						describe: 'Maximum number of tiles to use',
						type: 'integer'
					},
					'min-hue-cols': {
						default: 512,
						describe: 'Number of colors per hue group to evaluate regardless of counts, to retain low-count hues',
						type: 'integer'
					},
					'dithKern': {
						default: '',
						describe: 'Dithering kernel name; can one of these:\n' +
								'FloydSteinberg, Stucki, Atkinson, Jarvis, Burkes, Sierra, TwoSierra, SierraLite, ' +
								'FalseFloydSteinberg, Ordered2, Ordered2x1, Ordered3, Ordered4 or Ordered8',
						type: 'string'
					},
					'dith-serp': {
						default: false,
						describe: 'Enable serpentine pattern dithering',
						type: 'boolean'
					},
					'weigh-popularity': {
						default: true,
						describe: 'Weigh by popularity when reducing tile count',
						type: 'boolean'
					},
					'weigh-entropy': {
						default: false,
						describe: 'Weigh by entropy when reducing tile count',
						type: 'boolean'
					}					
				});
		})
		.demandCommand(1, 'You need to inform at least one command before moving on')
		.strict()
		.help()
		.argv;
		
	if (commandLine._.includes('convert')) {
		const options = _.pick(commandLine, 'colors', 'maxTiles', 'minHueCols', 'dithKern', 'dithSerp', 'weighPopularity', 'weighEntropy');
		convert(commandLine.src, commandLine.dest, options);
	}
}

module.exports = { RgbQuantSMS, convert };