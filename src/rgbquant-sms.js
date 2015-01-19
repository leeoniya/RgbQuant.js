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
