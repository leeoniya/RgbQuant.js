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

			ti.mark("tileset -> DOM", function() {
				$tsetd.append($('<h5>').html(rawTilBg.tiles.length + ' tiles'));

				rawTilBg.tiles.forEach(function(tile){
					var image = new IndexedImage(8, 8, indexedImage.pallete);
					image.drawTile(tile, 0, 0);
					var	ican = drawPixels(image.toRgbBytes(), image.width);
					$tsetd.append(ican);
				});
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
	$dupli = $("#dupli"),
	
	$palt = $("#palt"),
	$stat = $("#stat"),
	$note = $("#note"),
	$opts = $("#opts");

//	process(["img/grad_default.png"]);
}).on("change", "input, textarea, select", function() {
	cfg_edited = true;
});