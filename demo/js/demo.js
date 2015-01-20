var cfg_edited = false;
var cfg_edited = false;

var dflt_opts = {
	colors: 16,
	maxTiles: 256,
	method: 2,
	initColors: 4096,
	minHueCols: 0,
	dithKern: null,
	dithSerp: false,
	weighPopularity: true,
	weighEntropy: false,
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

			ti.mark("remove duplicate tiles", function() {
				rawTilBg = quant.removeDuplicateTiles(rawTilBg);
			});

			ti.mark("Calculate tile entropy", function() {
				quant.updateTileEntropy(rawTilBg.tiles);
			});
			
			ti.mark("tileset -> DOM", function() {
				displayTileset($tsetd, rawTilBg.tiles, rawTilBg.palette);
			});

			var similarTiles;
			ti.mark("clusterize", function() {
				similarTiles = quant.groupBySimilarity(rawTilBg);
			});
			
			ti.mark("similar tiles -> DOM", function() {
				rawTilBg = quant.removeSimilarTiles(rawTilBg, similarTiles);
			});

			displayTileset($tsets, rawTilBg.tiles, rawTilBg.palette);
			
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
}).on("change", "#add-image", function() {
	if (this.files && this.files[0]) {
		var reader = new FileReader();
		
		reader.onload = function (e) {
			var $newImg = $('<img>').addClass('th').attr('src', e.target.result);
			$('#custom-images').append($newImg);
		}
		
		reader.readAsDataURL(this.files[0]);
	}
});