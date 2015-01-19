var cfg_edited = false;
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
			quant = new RgbQuantSMS(opts);

		$.each(imgs, function() {
			var img = this, id = baseName(img.src)[0];

			ti.mark("sample '" + id + "'", function(){
				quant.sample(img);
			});
		});

		var palRgb;
		ti.mark("build RGB palette", function() {
			palRgb = quant.palette();
		});
		
		ti.mark("Display palette", function() {
			var pal8 = new Uint8Array(palRgb.length * 4);			
			var offs = 0;
			palRgb.forEach(function(entry){
				entry = entry || [0, 0, 0];
				// R, G, B
				pal8[offs++] = entry[0];
				pal8[offs++] = entry[1];
				pal8[offs++] = entry[2];
				// Alpha
				pal8[offs++] = 0xFF;
			});

			var pcan = drawPixels(pal8, 16, 128);

			var plabel = $('<div>').addClass('pal-numbers').html(palRgb.map(function(color){
				if (!color) {
					return '*';
				}
			
				var n = (color[0] & 0xC0) >> 6 | (color[1] & 0xC0) >> 4 | (color[2] & 0xC0) >> 2;
				return ('00' + n.toString(16)).substr(-2);
			}).join(' '));
			
			$palt.empty().append(pcan).append(plabel);
		});

		$redu.empty();
		$tsetd.empty();
		$tsets.empty();
		$dupli.empty();
		$(imgs).each(function() {
			var img = this, id = baseName(img.src)[0];

			var indexedImage;
			ti.mark("reduce '" + id + "'", function() {
				indexedImage = quant.reduce(img, 8);
			});
			
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
				rawTilBg = quant.toTileMap(indexedImage);
			});			
			
			console.log("Raw map", rawTilBg);
			
			ti.mark("normalize tiles", function() {
				rawTilBg = quant.normalizeTiles(rawTilBg);
			});

		
			function tileKey(tile) {
				return tile.pixels.map(function(line){ return line.join(',') }).join(';');
			}

			function boolXor(a, b) {
				return !a != !b;
			}

			ti.mark("remove duplicate tiles", function() {
				var newTiles = [];
				var newIndexes = {};
				var indexMap = rawTilBg.tiles.map(function(tile){
					var key = tileKey(tile);
					var newTileNum;
					if (key in newIndexes) {
						newTileNum = newIndexes[key];
						var newTile = newTiles[newTileNum];
						newTile.popularity += tile.popularity;
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

			ti.mark("Calculate tile entropy", function() {
				rawTilBg.tiles.forEach(function(tile){
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
			});
			
			console.log('Entropies', _.pluck(rawTilBg.tiles, 'entropy'));
			
			ti.mark("tileset -> DOM", function() {
				displayTileset($tsetd, rawTilBg.tiles, rawTilBg.palette);
			});

			var similarTiles;
			ti.mark("clusterize", function() {
				var data = rawTilBg.tiles.map(function(tile){
					return {
						tile: tile,
						feature: _.flatten(tile.pixels).reduce(function(a, colorIndex){
							return a.concat(rawTilBg.palette[colorIndex]);
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
						
						var weight = tile.popularity * (tile.entropy + 1);
						totalWeight += weight;
						
						var offs = 0;
						for (var tY = 0; tY != 8; tY++) {
							for (var tX = 0; tX != 8; tX++) {
								var rgb = rawTilBg.palette[tile.pixels[tY][tX]];
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
			
				displayTileset($tsets, newTiles, rawTilBg.palette);
				
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
				var image = new RgbQuantSMS.IndexedImage(rawTilBg.mapW * 8, rawTilBg.mapH * 8, indexedImage.palette);
				image.drawMap(rawTilBg);
				
				var	ican = drawPixels(image.toRgbBytes(), image.width);
				$dupli.append(ican);
			});
		});
	});
}

function displayTileset($container, tiles, palette) {
	$container.append($('<h5>').html(tiles.length + ' tiles'));

	tiles.forEach(function(tile){
		var image = new RgbQuantSMS.IndexedImage(8, 8, palette);
		image.drawTile(tile, 0, 0, tile.flipX, tile.flipY);
		var	ican = drawPixels(image.toRgbBytes(), image.width);
		$container.append(ican);
	});
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