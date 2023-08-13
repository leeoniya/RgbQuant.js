/*
* Copyright (c) 2015, Haroldo O. Pinheiro
* All rights reserved. (MIT Licensed)
*
* RgbQuant-SMS.js - an image quantization lib for Sega Master System
*/
(function(){
	
	const RgbQuant = this.RgbQuant || require('./rgbquant').RgbQuant;
	const _ = this._ || require('../demo/js/underscore-min');
	const clusterfck = this.clusterfck || require('../demo/js/clusterfck').clusterfck;

	/**
	 * The quantizer itself
	 */
	function RgbQuantSMS(opts) {
		opts = opts || {};
		
		opts.palette = PREDEFINED_PALETTES.SegaMasterSystem;
		opts.reIndex = true;
		opts.dithDelta = 0.05;
		
		this.paletteCount = opts.paletteCount || 1;
		this.maxTiles = opts.maxTiles || 256;
		
		// When merging tiles, should they be weighed by popularity?
		this.weighPopularity = opts.weighPopularity;
		// When merging tiles, should they be weighed by entropy?
		this.weighEntropy = opts.weighEntropy;

		this.tempQuant = new RgbQuant(_.pick(opts, 'palette', 'method', 'initColors', 'minHueCols'));
		this.imagesToSample = [];
		this.quants = null; // They will be initialized by buildPal()
		
		this.quantizerOpts = opts;
	}
	
	/**
	 * Gathers histogram info.
	 */
	RgbQuantSMS.prototype.sample = function sample(img, width) {
		var rgbImg = this.tempQuant.toRgbImage(img, width);		
		this.imagesToSample.push(rgbImg);
	}
	
	/**
	 * Builds the palette, in case it wasn't already
	 */
	RgbQuantSMS.prototype.buildPal = function() {
		if (this.quants) {
			// Okay, already processed; nothing to do.
			return;
		}
				
		var self = this;
		
		this.imagesToSample.forEach(function(img){
			self.tempQuant.sample(img);
		});
		var palette = this.tempQuant.palette(true);
		
		var tilesToClusterize = _.flatten(this.imagesToSample.map(function(img){
			var pixels = self.tempQuant.reduce(img, 2);			
			var indexedImage = new IndexedImage(img.width, img.height, palette, pixels);
			var tileMap = self.toSimpleTileMap(indexedImage);

			return tileMap.tiles.map(function(tile){
				var tileHistogram = new Uint8Array(tileMap.palette.length);
				_.flatten(tile.pixels).forEach(function(pixel){
					tileHistogram[pixel]++;
				});				
				return {
					tile: tile,
					histogram: tileHistogram
				};
			});
		}));		
		
		var clusters = clusterfck.kmeans(_.pluck(tilesToClusterize, 'histogram'), this.paletteCount);

		function buildKey(histogram) {
			return Array.prototype.slice.call(histogram).join(',');
		}
		
		var index = _.groupBy(tilesToClusterize, function(data){ return buildKey(data.histogram) });
		tilesToClusterize = null;
		for (const k in index) {
		  if (index.hasOwnProperty(k)) {
			  index[k] = index[k].map(o => o.tile.pixels);
		  }
		}		
		
		this.quants = clusters.map(function(cluster){
			var pixelIndexes = _.chain(cluster).map(function(histogram){
				// Finds the tile corresponding to the cluster element
				return index[buildKey(histogram)];
			}).flatten().value();
			
			// Free up memory
			cluster.length = 0;

			// Convert pixel palette indexes into the actual colors
			const uint32pixels = new Uint32Array(pixelIndexes);
			for (let i = 0; i < uint32pixels.length; i++) {
				const pixelIndex = uint32pixels[i];
				const rgb = palette[pixelIndex];
				uint32pixels[i] = 
						(255 << 24)	|		// alpha
						(rgb[2]  << 16)	|	// blue
						(rgb[1]  <<  8)	|	// green
						 rgb[0];									
			}
			pixelIndexes = null;

			var quant = new RgbQuant(self.quantizerOpts);
			quant.sample(uint32pixels, 8);
			return quant;
		});
	}
	
	/**
	 * Image quantizer
	 * retType: 1 - Uint8Array (default), 2 - Indexed array, 8 - IndexedImage
	 */
	RgbQuantSMS.prototype.reduce = function(quant, img, retType, dithKern, dithSerp) {
		this.buildPal();
				
		var pixels = quant.reduce(img, retType == 8 ? 2 : retType, dithKern, dithSerp);
		if (retType == 8) {
			var palRgb = quant.palette(true);
			return new IndexedImage(img.width, img.height, palRgb, pixels);
		}
		return pixels;
	}		
	
	RgbQuantSMS.prototype.reduceToTileMap = function(img, dithKern, dithSerp) {
		var rgbImage = this.quants[0].toRgbImage(img),
			rgbTileset = this.toRgbTileset(rgbImage),
			self = this;
		
		var tileMaps = this.quants.map(function(quant){
			var indexedImage = self.reduce(quant, rgbImage, 8);
			var tileMap = self.toSimpleTileMap(indexedImage);
			return tileMap;
		});		
		
		var fullTileMap = {
			palettes: _.pluck(tileMaps, 'palette'),
			mapW: tileMaps[0].mapW,
			mapH: tileMaps[0].mapH,
			tiles: [],
			map: tileMaps[0].map
		};
		
		// For each tile, chooses the palette that causes the least amount of error.
		fullTileMap.tiles = rgbTileset.map(function(rgbTile, tileIndex){
			var originalColors = _.flatten(rgbTile);
			var candidates = tileMaps.map(function(tileMap, palNum){
				var tile = tileMap.tiles[tileIndex];
				tile.palNum = palNum;
				
				var tileColors = _.chain(tile.pixels).flatten().map(function(colorIndex){
					return tileMap.palette[colorIndex];
				}).flatten().value();
				var difference = _.zip(originalColors, tileColors).reduce(function(total, pair){
					var dif = pair[0] - pair[1];
					return total + dif * dif
				}, 0);
				return {
					tile: tile,
					difference: difference
				}
			});
			return _.min(candidates, function(tile){ return tile.difference }).tile;
		});
		
		return fullTileMap;
	}
	
	/**
	 * Returns a palette
	 */
	RgbQuantSMS.prototype.palettes = function palette() {
		this.buildPal();
		return this.quants.map(function(quant){
			return quant.palette(true);
		});
	}
	
	/**
	 * Split an RGB image into an RGB tileset
	 */
	RgbQuantSMS.prototype.toRgbTileset = function(rgbImage) {
		var mapW = Math.ceil(rgbImage.width / 8.0),
			mapH = Math.ceil(rgbImage.height / 8.0),
			tileset = [];
	
		for (var mY = 0; mY < mapH; mY++) {
			var iY = mY * 8;
			var maxY = Math.min(iY + 8, rgbImage.height);
			var yOffs = iY * rgbImage.width;
			
			for (var mX = 0; mX < mapW; mX++) {
				var tile = [
					[[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0]],
					[[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0]],
					[[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0]],
					[[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0]],
					[[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0]],
					[[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0]],
					[[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0]],
					[[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0]]
				]		
				tileset.push(tile);

				// Copíes pixels from the image into the tile
				var iX = mX * 8;
				var maxX = Math.min(iX + 8, rgbImage.width);
				var xyOffs = yOffs + iX;
				
				var lineOffs = xyOffs;						
				for (var pY = 0, miY = iY; miY < maxY; pY++, miY++) {
					var tileLine = tile[pY];
					for (var pX = 0, miX = iX; miX < maxX; pX++, miX++) {
						var i32 = rgbImage.buf32[lineOffs + pX],
							r = (i32 & 0xff),
							g = (i32 & 0xff00) >> 8,
							b = (i32 & 0xff0000) >> 16;
							
						tileLine[pX] = [r, g, b];
					}
					lineOffs += rgbImage.width;
				}				
			}
		}
		
		return tileset;
	}
	
	/**
	 * Split an indexed image into an indexed tileset+map (no optimization here)
	 */
	RgbQuantSMS.prototype.toSimpleTileMap = function(indexedImage) {
		var tileMap = {
			palette: indexedImage.palette,
			mapW: Math.ceil(indexedImage.width / 8.0),
			mapH: Math.ceil(indexedImage.height / 8.0),
			tiles: [],
			map: []
		};
		
		for (var mY = 0; mY != tileMap.mapH; mY++) {
			var iY = mY * 8;
			var maxY = Math.min(iY + 8, indexedImage.height);
			var yOffs = iY * indexedImage.width;
			
			var mapLine = [];
			tileMap.map[mY] = mapLine;
			
			for (var mX = 0; mX != tileMap.mapW; mX++) {
				var tile = {
					number: tileMap.tiles.length,
					palNum: 0,
					popularity: 1,
					entropy: 0,
					flipX: false,
					flipY: false,
					pixels: [
						[0,0,0,0,0,0,0,0],
						[0,0,0,0,0,0,0,0],
						[0,0,0,0,0,0,0,0],
						[0,0,0,0,0,0,0,0],
						[0,0,0,0,0,0,0,0],
						[0,0,0,0,0,0,0,0],
						[0,0,0,0,0,0,0,0],
						[0,0,0,0,0,0,0,0]
					]
				};						
				tileMap.tiles.push(tile);

				// Copíes pixels from the image into the tile
				var iX = mX * 8;
				var maxX = Math.min(iX + 8, indexedImage.width);
				var xyOffs = yOffs + iX;
				
				var lineOffs = xyOffs;						
				for (var pY = 0, miY = iY; miY < maxY; pY++, miY++) {
					var tileLine = tile.pixels[pY];
					for (var pX = 0, miX = iX; miX < maxX; pX++, miX++) {
						tileLine[pX] = indexedImage.pixels[lineOffs + pX];
					}
					lineOffs += indexedImage.width;
				}				
				
				// Makes the current map slot point to the tile
				mapLine[mX] = {
					flipX: false,
					flipY: false,
					tileNum: tile.number
				};
			}
		}
		
		return tileMap;
	}

	RgbQuantSMS.prototype.normalizeTiles = function(tileMap) {
	
		function copyTile(orig) {
			return {
				number: orig.number,
				palNum: orig.palNum,
				popularity: orig.popularity,
				entropy: 0,
				flipX: orig.flipX,
				flipY: orig.flipY,
				pixels: orig.pixels.map(function(line){
					return line.slice();
				})
			}
		}

		function copyTileFlipX(orig) {
			return {
				number: orig.number,
				palNum: orig.palNum,
				popularity: orig.popularity,
				entropy: 0,
				flipX: !orig.flipX,
				flipY: orig.flipY,
				pixels: orig.pixels.map(function(line){
					return line.slice().reverse();
				})
			}
		}

		function copyTileFlipY(orig) {
			return {
				number: orig.number,
				palNum: orig.palNum,
				popularity: orig.popularity,
				entropy: 0,
				flipX: orig.flipX,
				flipY: !orig.flipY,
				pixels: orig.pixels.slice().reverse()
			}
		}
		
		function compTilePixels(a, b) {
			for (var tY = 0; tY != 8; tY++) {
				var aLin = a.pixels[tY];
				var bLin = b.pixels[tY];
				for (var tX = 0; tX != 8; tX++) {
					var diff = aLin[tX] - bLin[tX];
					if (diff) {
						// They're different; returns a positive or negative value to indicate the order
						return diff;
					}
				}
			}
			
			// They're identical
			return 0; 
		}
		
		var newTiles = tileMap.tiles.map(function(tile){
			var orig = copyTile(tile),
				flipX = copyTileFlipX(tile),
				flipY = copyTileFlipY(tile),
				flipXY = copyTileFlipY(flipX);
			return [orig, flipX, flipY, flipXY].reduce(function(a, b){
				return compTilePixels(a, b) > 0 ? b : a;
			});
		});
		
		return {
			palettes: tileMap.palettes,
			mapW: tileMap.mapW,
			mapH: tileMap.mapH,
			tiles: newTiles,
			map: tileMap.map.map(function(mapLine){
				return mapLine.map(_.clone);
			})
		};
	}

	RgbQuantSMS.prototype.removeDuplicateTiles = function(tileMap) {
		var newTiles = [];
		var newIndexes = {};
		var indexMap = tileMap.tiles.map(function(tile){
			var key = tileKey(tile);
			var newTileNum;
			if (key in newIndexes) {
				newTileNum = newIndexes[key];
				var newTile = newTiles[newTileNum];
				newTile.popularity += tile.popularity;
			} else {
				newTileNum = newTiles.length;
				var newTile = copyTile(tile);
				newIndexes[key] = newTileNum;
				
				newTile.number = newTileNum;
				newTiles.push(newTile);
			}
			
			return newTileNum;
		});
				
		var newMap = tileMap.map.map(function(line){
			return line.map(function(cell){
				var newTileNum = indexMap[cell.tileNum];
				var origTile = tileMap.tiles[cell.tileNum];
				var newTile = newTiles[newTileNum];
				
				return {
					flipX: boolXor(cell.flipX, boolXor(origTile.flipX, newTile.flipX)),
					flipY: boolXor(cell.flipY, boolXor(origTile.flipY, newTile.flipY)),
					tileNum: newTileNum
				}
			});
		});

		return {
			palettes: tileMap.palettes,
			mapW: tileMap.mapW,
			mapH: tileMap.mapH,
			tiles: newTiles,
			map: newMap
		};
	}

	RgbQuantSMS.prototype.updateTileEntropy = function(tileSet) {
		tileSet.forEach(function(tile){
			var tileHistogram = _.flatten(tile.pixels).reduce(function(h, px){
				h[px] = (h[px] || 0) + 1;
				return h;
			}, []);
			
			tile.entropy = - tileHistogram.reduce(function(total, cnt){
				var p = (cnt || 0) / (8 * 8);
				var colorEntropy = p * log2(p);
				return total + colorEntropy;
			}, 0);
		});
	}

	/**
	 * Groups tiles by similarity. Returns an array of arrays of similar tiles.
	 */
	RgbQuantSMS.prototype.groupBySimilarity = function(tileMap) {
		var data = tileMap.tiles.map(function(tile){
			return {
				tile: tile,
				feature: _.flatten(tile.pixels).reduce(function(a, colorIndex){
					return a.concat(tileMap.palettes[tile.palNum][colorIndex]);
				}, [])
			};
		});
		
		var dataToClusterize = _.pluck(data, 'feature').map(function(featureVector){
			var grays = [];
			for (var i = 0; i != featureVector.length; i += 3) {
				var r = featureVector[i];
				var g = featureVector[i + 1];
				var b = featureVector[i + 2];
				var luma =  0.2126 * r + 0.7152 * g + 0.0722 * b;
				grays.push(parseInt(luma));
			}
			
			return featureVector.concat(grays);
		});
		
		var clusters = clusterfck.kmeans(dataToClusterize, this.maxTiles);
		
		function buildKey(featureVector) {
			return featureVector.slice(0, 8 * 8 * 3).join(',');
		}
		
		var byKey = _.groupBy(data, function(d){ return buildKey(d.feature) });				
		var similarTiles = clusters.map(function(group){
			return group.reduce(function(list, feature){
				return list.concat(_.pluck(byKey[buildKey(feature)], 'tile'));
			}, []);
		});
		
		return similarTiles;
	}

	RgbQuantSMS.prototype.removeSimilarTiles = function(tileMap, similarTiles) {
		var self = this;
		var indexMap = [];
		var allTriplets = [];
		var newTiles = similarTiles.map(function(group, newTileNum){ 
			var newTile = {
				number: newTileNum,
				palNum: 0,
				popularity: 0,
				entropy: 0,
				flipX: group[0].flipX,
				flipY: group[0].flipY,
				pixels: []
			};

			var triplets = [];
			for (var i = 0; i != 8 * 8; i++) {
				triplets.push([0, 0, 0]);
			}
			
			var totalWeight = 0;
			
			group.forEach(function(tile){
				indexMap[tile.number] = newTileNum;
				newTile.popularity += tile.popularity;
				
				var weight = (self.weighPopularity ? tile.popularity : 1) * (self.weighEntropy ? tile.entropy + 0.1 : 1);
				totalWeight += weight;
				
				var offs = 0;
				for (var tY = 0; tY != 8; tY++) {
					for (var tX = 0; tX != 8; tX++) {
						var rgb = tileMap.palettes[tile.palNum][tile.pixels[tY][tX]];
						var total = triplets[offs++];
						total[0] += rgb[0] * weight;
						total[1] += rgb[1] * weight;
						total[2] += rgb[2] * weight;
					}
				}						
			});									

			triplets.forEach(function(rgb){
				for (var ch = 0; ch != 3; ch++) {
					rgb[ch] /= totalWeight;
				}
			});
			allTriplets = allTriplets.concat(triplets);
								
			return newTile;
		});
		
		// Converts the RGB triplets into the byte array format supported by RgbQuant
		var img8 = new Uint8Array(allTriplets.length * 4);
		var iOfs = 0;
		for (var tOfs = 0; tOfs != allTriplets.length; tOfs++) {
			var rgb = allTriplets[tOfs];
			for (var i = 0; i != 3; i++) {
				img8[iOfs++] = rgb[i];
			}
			img8[iOfs++] = 0xFF;
		}
		
		// Don't re-dither if ordered dither was used.
		var dithKern = this.quants[0].dithKern;
		dithKern = dithKern && (dithKern.indexOf('Ordered') !== -1) ? 'None' : dithKern; 
		
		// Creates one reduced image for each palette
		var imgs8i = this.quants.map(function(quant){
			return quant.reduce(img8, 2, dithKern);
		}); 
		
		var tileOfs = 0;
		var tripletOfs = 0;
		newTiles.forEach(function(newTile){
			var candidates = imgs8i.map(function(img8i, palNum){
				var pixels = [];
				var iOfs = tileOfs;
				for (var tY = 0; tY != 8; tY++) {
					var pixelLine = [];
					for (var tX = 0; tX != 8; tX++) {
						pixelLine.push(img8i[iOfs++]);
					}
					pixels.push(pixelLine);
				}
			
				return {
					palNum: palNum,
					pixels: pixels
				};
			});

			if (candidates.length == 1) {
				// If there's only one candidate, the winner is obvious
				var winner = candidates[0];
			} else {
				// If there's more than one candidate, checks which contains the least amount of error.
				var originalColors = _.flatten(allTriplets.slice(tileOfs, tileOfs + 8 * 8));
				var winner = _.chain(candidates).map(function(candidate){
					var palette = tileMap.palettes[candidate.palNum];
					var reducedColors = _.chain(candidate.pixels).flatten().map(function(colorIndex){
						return palette[colorIndex];
					}).flatten().value();
					var difference = _.zip(originalColors, reducedColors).reduce(function(total, pair){
						var difference = pair[0] - pair[1];
						return total + difference * difference;
					}, 0);
				
					return {
						palNum: candidate.palNum,
						pixels: candidate.pixels,
						difference: difference
					};
				}).min(function(o){ return o.difference }).value();
			}
			
			newTile.palNum = winner.palNum;
			newTile.pixels = winner.pixels;
			
			tileOfs += 8 * 8;
		});
		
		newMap = tileMap.map.map(function(line){
			return line.map(function(cell){
				var newTileNum = indexMap[cell.tileNum];
				var origTile = tileMap.tiles[cell.tileNum];
				var newTile = newTiles[newTileNum];
				
				return {
					flipX: boolXor(cell.flipX, boolXor(origTile.flipX, newTile.flipX)),
					flipY: boolXor(cell.flipY, boolXor(origTile.flipY, newTile.flipY)),
					tileNum: newTileNum
				}
			});
		});

		return {
			palettes: tileMap.palettes,
			mapW: tileMap.mapW,
			mapH: tileMap.mapH,
			tiles: newTiles,
			map: newMap
		};
	}
	
	RgbQuantSMS.prototype.convert = function(img) {
		this.sample(img);
		this.palettes();

		let unoptimizedTileMap = this.reduceToTileMap(img);
		const optimizedTileMap = this.normalizeTiles(unoptimizedTileMap);
		unoptimizedTileMap = null;
		
		this.updateTileEntropy(optimizedTileMap.tiles);
		const similarTiles = this.groupBySimilarity(optimizedTileMap);
		const reducedTileMap = this.removeSimilarTiles(optimizedTileMap, similarTiles);
		
		return reducedTileMap;
	}
	
	//-------------------
	

	/**
	 * Represents an indexed image
	 */
	function IndexedImage(width, height, palette, pixels) {	
		this.width = width;
		this.height = height;
		this.pixels = new Uint8Array(pixels || width * height);		
		
		if (palette[0][0].length) {
			// Is it a multi-palette?
			var self = this,
				offs = 0;
			this.palette = [];
			this.colorOffsets = [];
			palette.forEach(function(subPalette){
				self.palette = self.palette.concat(subPalette);
				self.colorOffsets.push(offs);
				offs += subPalette.length;
			});
		} else {
			// No, just a single palette.
			this.palette = palette;
			this.colorOffsets = [0];
		}
	}
	
	IndexedImage.prototype.toRgbBytes = function() {
		var img8 = new Uint8Array(this.pixels.length * 4);
		
		var len = this.pixels.length;
		for (var i = 0, j = 0; i != len; i++, j += 4) {
			var rgb = this.palette[this.pixels[i]];
			img8[j] = rgb[0];
			img8[j + 1] = rgb[1];
			img8[j + 2] = rgb[2];
			img8[j + 3] = 0xFF;
		}
		
		return img8;
	}
	
	IndexedImage.prototype.drawTile = function(tile, x, y, flipX, flipY) {
		var flipX = tile.flipX ? !flipX : flipX;
		var flipY = tile.flipY ? !flipY : flipY;

		var offs = y * this.width + x;	
		
		for (var tY = 0; tY != 8; tY++) {
			var tileLine = tile.pixels[flipY ? 7 - tY : tY];
			var yOffs = offs + tY * this.width
			for (var tX = 0; tX != 8; tX++) {
				this.pixels[yOffs + tX] = tileLine[flipX ? 7 - tX : tX] + this.colorOffsets[tile.palNum];
			}
		}
	}

	IndexedImage.prototype.drawMap = function(map) {
		for (var mY = 0; mY != map.mapH; mY++) {
			var mapLine = map.map[mY];
			for (var mX = 0; mX != map.mapW; mX++) {
				var mapCell = mapLine[mX];
				var tile = map.tiles[mapCell.tileNum];
				this.drawTile(tile, mX * 8, mY * 8, mapCell.flipX, mapCell.flipY);
			}
		}
	}
	
	
	//-------------------
	

	function copyTile(orig) {
		return {
			number: orig.number,
			palNum: orig.palNum,
			popularity: orig.popularity,
			entropy: orig.entropy,
			flipX: orig.flipX,
			flipY: orig.flipY,
			pixels: orig.pixels.map(function(line){
				return line.slice();
			})
		}
	}
	
	function tileKey(tile) {
		return tile.pixels.map(function(line){ return line.join(',') }).join(';') + '|' + tile.palNum;
	}

	function boolXor(a, b) {
		return !a != !b;
	}

	function doRgbPal(levels) {
		var palette = [];
		var limit = levels - 1;
		
		function calc(ch) {
			return Math.ceil(ch * 255 / limit);
		}
		
		for (var r = 0; r != levels; r++) {
			for (var g = 0; g != levels; g++) {
				for (var b = 0; b != levels; b++) {
					palette.push([
						calc(r),
						calc(g),
						calc(b)
					]);
				}
			}
		}
		return palette;
	}
	
	var LOG2 = Math.log(2);
	function log2(n) {
		return Math.log(n) / LOG2;
	}
	
	var PREDEFINED_PALETTES = {
		SegaMasterSystem: doRgbPal(4)
	}		

	// expose
	RgbQuantSMS.IndexedImage = IndexedImage;
	this.RgbQuantSMS = RgbQuantSMS;
	
}).call(this);
