'use strict';

const Canvas = require('canvas');
const Image = Canvas.Image;

const { RgbQuantSMS } = require('./src/rgbquant-sms');

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