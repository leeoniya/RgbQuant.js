'use strict';

const Canvas = require('canvas');
const Image = Canvas.Image;

const { RgbQuantSMS } = require('./src/rgbquant-sms');

console.log('Canvas', Canvas);

(async () => {
	
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
			canvas._typeWorkaround = 'Canvas';
			resolve(canvas);
		}
		img.onerror = reject;
		img.src = src;
	});

	const canvas = await getCanvas('demo/img/biking.jpg');
	console.log('canvas', canvas);
	
	quant.sample(canvas);
	const palettes = quant.palettes();
	console.log('palettes', palettes)

	const unoptimizedTileMap = quant.reduceToTileMap(canvas);
	const optimizedTileMap = quant.normalizeTiles(unoptimizedTileMap);
	quant.updateTileEntropy(optimizedTileMap.tiles);
	const similarTiles = quant.groupBySimilarity(optimizedTileMap);
	const reducedTileMap = quant.removeSimilarTiles(optimizedTileMap, similarTiles);
	
	console.log('reducedTileMap', { reducedTileMap, tileCount: reducedTileMap.tiles.length });
})();
