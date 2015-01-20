/*
* Copyright (c) 2015, Haroldo O. Pinheiro
* All rights reserved. (MIT Licensed)
*
* RgbQuant-SMS.js - an image quantization lib for Sega Master System
*/
(function(){

	/**
	 * The quantizer itself
	 */
	function RgbQuantSMS(opts) {
		opts = opts || {};
		
		opts.palette = PREDEFINED_PALETTES.SegaMasterSystem;
		opts.reIndex = true;
		opts.dithDelta = 0.05;
		
		// When merging tiles, should they be weighed by popularity?
		this.weighPopularity = opts.weighPopularity;
		// When merging tiles, should they be weighed by entropy?
		this.weighEntropy = opts.weighEntropy;
		
		this.quant = new RgbQuant(opts);
	}
	
	/**
	 * Gathers histogram info.
	 */
	RgbQuantSMS.prototype.sample = function sample(img, width) {
		return this.quant.sample(img, width);
	}
	
	/**
	 * Image quantizer
	 * retType: 1 - Uint8Array (default), 2 - Indexed array, 8 - IndexedImage
	 */
	RgbQuantSMS.prototype.reduce = function(img, retType, dithKern, dithSerp) {
		var pixels = this.quant.reduce(img, retType == 8 ? 2 : retType, dithKern, dithSerp);
		if (retType == 8) {
			var palRgb = this.palette();
			return new IndexedImage(img.width, img.height, palRgb, pixels);
		}
		return pixels;
	}
	
	/**
	 * Returns a palette
	 */
	RgbQuantSMS.prototype.palette = function palette() {
		return this.quant.palette(true);
	}
	
	/**
	 * Split an indexed image into a tileset+map (no optimization here)
	 */
	RgbQuantSMS.prototype.toTileMap = function(indexedImage) {
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
	
		function copyTileFlipX(orig) {
			return {
				number: orig.number,
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
			var orig = copyTileFlipX(tile),
				flipX = copyTileFlipX(tile),
				flipY = copyTileFlipY(tile),
				flipXY = copyTileFlipY(flipX);
			return [orig, flipX, flipY, flipXY].reduce(function(a, b){
				return compTilePixels(a, b) > 0 ? b : a;
			});
		});
		
		return {
			palette: tileMap.palette,
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
			palette: tileMap.palette,
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
				var colorEntropy = p * Math.log2(p);
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
					return a.concat(tileMap.palette[colorIndex]);
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
		
		var clusters = clusterfck.kmeans(dataToClusterize, 256);
		
		function buildKey(featureVector) {
			return featureVector.slice(0, 8 * 8 * 3).join(',');
		}
		
		var index = _.indexBy(data, function(d){ return buildKey(d.feature) });				
		var similarTiles = clusters.map(function(group){
			return group.map(function(feature){
				return index[buildKey(feature)].tile;
			});
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
						var rgb = tileMap.palette[tile.pixels[tY][tX]];
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
		
		var img8 = new Uint8Array(allTriplets.length * 4);
		var iOfs = 0;
		for (var tOfs = 0; tOfs != allTriplets.length; tOfs++) {
			var rgb = allTriplets[tOfs];
			for (var i = 0; i != 3; i++) {
				img8[iOfs++] = rgb[i];
			}
			img8[iOfs++] = 0xFF;
		}
		
		var img8i = this.reduce(img8, 2);
		var iOfs = 0;
		newTiles.forEach(function(newTile){
			for (var tY = 0; tY != 8; tY++) {
				var pixelLine = [];
				for (var tX = 0; tX != 8; tX++) {
					pixelLine.push(img8i[iOfs++]);
				}
				newTile.pixels.push(pixelLine);
			}
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
			palette: tileMap.palette,
			mapW: tileMap.mapW,
			mapH: tileMap.mapH,
			tiles: newTiles,
			map: newMap
		};
	}
	
	
	//-------------------
	

	/**
	 * Represents an indexed image
	 */
	function IndexedImage(width, height, palette, pixels) {
		this.width = width;
		this.height = height;
		this.palette = palette;
		this.pixels = new Uint8Array(pixels || width * height) 
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
				this.pixels[yOffs + tX] = tileLine[flipX ? 7 - tX : tX];
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
		return tile.pixels.map(function(line){ return line.join(',') }).join(';');
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
	
	var PREDEFINED_PALETTES = {
		SegaMasterSystem: doRgbPal(4)
	}		

	// expose
	RgbQuantSMS.IndexedImage = IndexedImage;
	this.RgbQuantSMS = RgbQuantSMS;
	
}).call(this);
