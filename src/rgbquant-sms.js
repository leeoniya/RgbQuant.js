/*
* Copyright (c) 2015, Haroldo O. Pinheiro
* All rights reserved. (MIT Licensed)
*
* RgbQuant-SMS.js - an image quantization lib for Sega Master System
*/
(function(){

	function RgbQuantSMS(opts) {
		opts = opts || {};
		
		opts.palette = PREDEFINED_PALETTES.SegaMasterSystem;
		
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
	 */
	RgbQuantSMS.prototype.reduce = function(img, retType, dithKern, dithSerp) {
		this.palette();
		var pixelIndexes = this.quant.reduce(img, retType, dithKern, dithSerp);
		
		for (var i = 0; i != pixelIndexes.length; i++) {
			pixelIndexes[i] = this.sparseToPal[pixelIndexes[i]];
		}
		
		return pixelIndexes;
	}
	
	/**
	 * Returns a palette
	 */
	RgbQuantSMS.prototype.palette = function palette() {
		if (!this.palRgb) {
			var sparseRgb = this.quant.palette(true);
			
			var palRgb = [];
			var sparseToPal = [];
			for (var i = 0; i != sparseRgb.length; i++) {
				var rgb = sparseRgb[i];
				if (rgb) {
					sparseToPal[i] = palRgb.length;
					palRgb.push(rgb);
				}
			}
			
			this.palRgb = palRgb;
			this.sparseToPal = sparseToPal;
		}
		return this.palRgb.slice();
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
	this.RgbQuantSMS = RgbQuantSMS;
	
}).call(this);