var cfg_edited = false;

var dflt_opts = {
	colors: 16,
	method: 2,
	initColors: 4096,
	minHueCols: 0,
	dithKern: null,
	dithSerp: false,
};

var cfgs = {
	"baseball":     {jpg: true},
	"bebop":        {jpg: true},
	"fishie2":      {jpg: true},
	"bluff":        {jpg: true},
	"pheasant":     {jpg: true},
	"rainbow":      {jpg: true},
	"cloudplane":   {jpg: true},
	"redpanda":     {jpg: true},
	"photoman":     {jpg: true},
	"biking":       {jpg: true},
	"kitteh1":      {jpg: true},
	"compcube":     {jpg: true},
	"medusa":       {jpg: true},

	"fish":         {jpg: true, opts: $.extend({}, dflt_opts, {minHueCols: 4096})},
	"kitteh2":      {jpg: true, opts: $.extend({}, dflt_opts, {minHueCols: 512})},
	"quantfrog":    {           opts: $.extend({}, dflt_opts, {minHueCols: 512})},
	"treefrog":     {jpg: true, opts: $.extend({}, dflt_opts, {minHueCols: 4096})},
	"baby":         {jpg: true, opts: $.extend({}, dflt_opts, {minHueCols: 6144})},
	"chopsuey":     {jpg: true, opts: $.extend({}, dflt_opts, {minHueCols: 1024})},

	"mult1":        {mult: ["legend","smb3","super2","rose"]},
	"mult2":        {mult: ["super1","kitteh1","penguins","baby"]},
	"mult3":        {mult: ["cloudplane","rose"]},
};

function fullImgSrc(thSrc) {
	var full = thSrc.replace("_th", ""),
		id = baseName(full)[0];

	return cfgs[id] && cfgs[id].jpg ? full.replace(".png", ".jpg") : full.replace(".jpg", ".png");
}

function baseName(src) {
	return src.split("/").pop().split(".");
}

function getOpts(id) {
	if ($("#custom_cfg")[0].checked || cfg_edited) {
		var opts = {};

		for (var i in dflt_opts) {
			var $el = $("#" + i),
				typ = $el.attr("type"),
				val = $el.val(),
				num = parseFloat(val);

			opts[i] = typ == "checkbox" ? $el.prop("checked") : isNaN(num) ? val : num;
		}

		return $.extend({}, dflt_opts, opts);
	}
	else if (cfgs[id] && cfgs[id].opts)
		var opts = $.extend({}, dflt_opts, cfgs[id].opts);
	else
		var opts = dflt_opts;

	for (var i in dflt_opts) {
		var el = $("#" + i).val(opts[i])[0];
		el && (el.size = el.value.length);
	}

	return opts;
}

function process(srcs) {
	var ti = new Timer();
	ti.start();

	$.getImgs(srcs, function() {
		var imgs = arguments;

		ti.mark("image(s) loaded");

		$orig.empty();
		$.each(imgs, function() {
			var id = baseName(this.src)[0];
			ti.mark("'" + id + "' -> DOM");

			$orig.append(this);
		});

		var opts = (srcs.length == 1) ? getOpts(baseName(srcs[0])[0]) : dflt_opts,
			quant = new RgbQuant(opts);

		$.each(imgs, function() {
			var img = this, id = baseName(img.src)[0];

			ti.mark("sample '" + id + "'", function(){
				quant.sample(img);
			});
		});

		var pal8;
		ti.mark("build palette", function() {
			pal8 = quant.palette();
		});

		var palRgb;
		ti.mark("build RGB palette", function() {
			palRgb = quant.palette(true);
		});
		
		var pcan = drawPixels(pal8, 16, 128);

		var plabel = $('<div>').addClass('pal-numbers').html(quant.palette(true).map(function(color){
			var n = (color[0] & 0xC0) >> 6 | (color[1] & 0xC0) >> 4 | (color[2] & 0xC0) >> 2;
			return ('00' + n.toString(16)).substr(-2);
		}).join(' '));
		
		$palt.empty().append(pcan).append(plabel);

		$redu.empty();
		$tsetd.empty();
		$tsets.empty();
		$dupli.empty();
		$(imgs).each(function() {
			var img = this, id = baseName(img.src)[0];

			var img8i;
			ti.mark("reduce '" + id + "'", function() {
				img8i = quant.reduce(img, 2);
			});
			
			var indexedImage = new IndexedImage(img.width, img.height, palRgb, img8i);
			
			var img8;
			ti.mark("build img8 '" + id + "'", function() {
				img8 = indexedImage.toRgbBytes();
			});

			ti.mark("reduced -> DOM", function() {
				var	ican = drawPixels(img8, img.width);
				$redu.append(ican);
			});
			
			// Generates the unoptimized tileset + map
			var rawTilBg;
			ti.mark("raw tiles and background", function() {
				rawTilBg = {
					pallete: palRgb,
					mapW: Math.ceil(img.width / 8.0),
					mapH: Math.ceil(img.height / 8.0),
					tiles: [],
					map: []
				};
				
				for (var mY = 0; mY != rawTilBg.mapH; mY++) {
					var iY = mY * 8;
					var maxY = Math.min(iY + 8, img.height);
					var yOffs = iY * img.width;
					
					var mapLine = [];
					rawTilBg.map[mY] = mapLine;
					
					for (var mX = 0; mX != rawTilBg.mapW; mX++) {
						var tile = {
							number: rawTilBg.tiles.length,
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
						rawTilBg.tiles.push(tile);

						// Copíes pixels from the image into the tile
						var iX = mX * 8;
						var maxX = Math.min(iX + 8, img.width);
						var xyOffs = yOffs + iX;
						
						var lineOffs = xyOffs;						
						for (var pY = 0, miY = iY; miY < maxY; pY++, miY++) {
							var tileLine = tile.pixels[pY];
							for (var pX = 0, miX = iX; miX < maxX; pX++, miX++) {
								tileLine[pX] = img8i[lineOffs + pX];
							}
							lineOffs += img.width;
						}						
						
						// Makes the current map slot point to the tile
						mapLine[mX] = {
							flipX: false,
							flipY: false,
							tileNum: tile.number
						};
					}
				}
			});			
			
			console.log("Raw map", rawTilBg);
			
			function copyTileFlipX(orig) {
				return {
					number: orig.number,
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
			
			function tileKey(tile) {
				return tile.pixels.map(function(line){ return line.join(',') }).join(';');
			}
			
			function boolXor(a, b) {
				return !a != !b;
			}

			ti.mark("normalize tiles", function() {
				rawTilBg.tiles = rawTilBg.tiles.map(function(tile){
					var orig = tile,
						flipX = copyTileFlipX(tile),
						flipY = copyTileFlipY(tile),
						flipXY = copyTileFlipY(flipX);
					return [orig, flipX, flipY, flipXY].reduce(function(a, b){
						return compTilePixels(a, b) > 0 ? b : a;
					});
				});
			});

			ti.mark("remove duplicate tiles", function() {
				var newTiles = [];
				var newIndexes = {};
				var indexMap = rawTilBg.tiles.map(function(tile){
					var key = tileKey(tile);
					var newTileNum;
					if (key in newIndexes) {
						newTileNum = newIndexes[key];
					} else {
						newTileNum = newTiles.length;
						newIndexes[key] = newTileNum;
						
						tile.number = newTileNum;
						newTiles.push(tile);
					}
					
					return newTileNum;
				});
				
				rawTilBg.map = rawTilBg.map.map(function(line){
					return line.map(function(cell){
						var newTileNum = indexMap[cell.tileNum];
						var origTile = rawTilBg.tiles[cell.tileNum];
						var newTile = newTiles[newTileNum];
						
						return {
							flipX: boolXor(cell.flipX, boolXor(origTile.flipX, newTile.flipX)),
							flipY: boolXor(cell.flipY, boolXor(origTile.flipY, newTile.flipY)),
							tileNum: newTileNum
						}
					});
				});
				rawTilBg.tiles = newTiles;
			});

			ti.mark("tileset -> DOM", function() {
				displayTileset($tsetd, rawTilBg.tiles, rawTilBg.pallete);
			});

			var similarTiles;
			ti.mark("clusterize", function() {
				var data = rawTilBg.tiles.map(function(tile){
					return {
						tile: tile,
						feature: _.flatten(tile.pixels).reduce(function(a, colorIndex){
							return a.concat(rawTilBg.pallete[colorIndex]);
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
				similarTiles = clusters.map(function(group){
					return group.map(function(feature){
						return index[buildKey(feature)].tile;
					});
				});
			});
			
			ti.mark("similar tiles -> DOM", function() {
				var indexMap = [];
				var allTriplets = [];
				var newTiles = similarTiles.map(function(group, newTileNum){ 
					var newTile = {
						number: newTileNum,
						flipX: group[0].flipX,
						flipY: group[0].flipY,
						pixels: []
					};

					var triplets = [];
					for (var i = 0; i != 8 * 8; i++) {
						triplets.push([0, 0, 0]);
					}
					
					group.forEach(function(tile){
						indexMap[tile.number] = newTileNum;
						
						var offs = 0;
						for (var tY = 0; tY != 8; tY++) {
							for (var tX = 0; tX != 8; tX++) {
								var rgb = rawTilBg.pallete[tile.pixels[tY][tX]];
								var total = triplets[offs++];
								total[0] += rgb[0];
								total[1] += rgb[1];
								total[2] += rgb[2];
							}
						}						
					});

					triplets.forEach(function(rgb){
						rgb[0] /= group.length;
						rgb[1] /= group.length;
						rgb[2] /= group.length;
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
				
				var img8i = quant.reduce(img8, 2);
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
			
				displayTileset($tsets, newTiles, rawTilBg.pallete);
				
				rawTilBg.map = rawTilBg.map.map(function(line){
					return line.map(function(cell){
						var newTileNum = indexMap[cell.tileNum];
						var origTile = rawTilBg.tiles[cell.tileNum];
						var newTile = newTiles[newTileNum];
						
						return {
							flipX: boolXor(cell.flipX, boolXor(origTile.flipX, newTile.flipX)),
							flipY: boolXor(cell.flipY, boolXor(origTile.flipY, newTile.flipY)),
							tileNum: newTileNum
						}
					});
				});
				rawTilBg.tiles = newTiles;
			});
			
			ti.mark("raw map -> DOM", function() {
				var image = new IndexedImage(rawTilBg.mapW * 8, rawTilBg.mapH * 8, indexedImage.pallete);
				image.drawMap(rawTilBg);
				
				var	ican = drawPixels(image.toRgbBytes(), image.width);
				$dupli.append(ican);
			});
		});
	});
}

function displayTileset($container, tiles, pallete) {
	$container.append($('<h5>').html(tiles.length + ' tiles'));

	tiles.forEach(function(tile){
		var image = new IndexedImage(8, 8, pallete);
		image.drawTile(tile, 0, 0, tile.flipX, tile.flipY);
		var	ican = drawPixels(image.toRgbBytes(), image.width);
		$container.append(ican);
	});
}

function IndexedImage(width, height, pallete, pixels) {
	this.width = width;
	this.height = height;
	this.pallete = pallete;
	this.pixels = new Uint8Array(pixels || width * height) 
}

IndexedImage.prototype.toRgbBytes = function() {
	var img8 = new Uint8Array(this.pixels.length * 4);
	
	var len = this.pixels.length;
	for (var i = 0, j = 0; i != len; i++, j += 4) {
		var rgb = this.pallete[this.pixels[i]];
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

$(document).on("click", "img.th", function() {
	cfg_edited = false;
	var id = baseName(this.src)[0];

	var srcs;
	if (id.indexOf("mult") == 0) {
		srcs = cfgs[id].mult.map(function(id){
			return fullImgSrc($('img[src*="'+id+'"]')[0].src);
		});
	}
	else
		srcs = [this.src].map(fullImgSrc);

	process(srcs);
}).on("click", "#btn_upd", function(){
	var srcs = [$("#orig img")[0].src].map(fullImgSrc);
	process(srcs);
}).on("ready", function(){
	$orig = $("#orig"),
	$redu = $("#redu"),
	$tsetd = $("#tsetd"),
	$tsets = $("#tsets"),
	$dupli = $("#dupli"),
	
	$palt = $("#palt"),
	$stat = $("#stat"),
	$note = $("#note"),
	$opts = $("#opts");

//	process(["img/grad_default.png"]);
}).on("change", "input, textarea, select", function() {
	cfg_edited = true;
});