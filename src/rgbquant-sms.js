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
	 */
	RgbQuantSMS.prototype.reduce = function(img, retType, dithKern, dithSerp) {
		return this.quant.reduce(img, retType, dithKern, dithSerp);
	}
	
	/**
	 * Returns a palette
	 */
	RgbQuantSMS.prototype.palette = function palette() {
		return this.quant.palette(true);
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
