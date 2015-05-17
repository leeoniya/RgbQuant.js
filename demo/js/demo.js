var cfg_edited = false;

var dflt_opts = {
	colors: 1024,
	method: 2,
	dithKern: "SierraLite"
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
		var imgs = [];
		for(var i = 0, l = arguments.length; i < l; i++) imgs[i] = arguments[i];

		ti.mark("image(s) loaded");

		$orig.empty();
		$.each(imgs, function() {
			var id = baseName(this.src)[0];
			ti.mark("'" + id + "' -> DOM");

			$orig.append(this);
		});

		var opts = (srcs.length == 1) ? getOpts(baseName(srcs[0])[0]) : dflt_opts,
			quant = new ColorQuantization.RgbQuant(opts),
			pointBuffers = [];


		ti.mark("create pointBuffers", function() {
			imgs.forEach(function (img, index) {
				pointBuffers[index] = new ColorQuantization.PointBuffer();
				pointBuffers[index].importHTMLImageElement(img);
			});
		});

		imgs.forEach(function (img, index) {
			var id = baseName(img.src)[0];

			ti.mark("sample '" + id + "'", function(){
				quant.sample(pointBuffers[index]);
			});
		});

		var pal8;
		ti.mark("build palette", function() {
			pal8 = quant.palette();
			//pal8 = quant.paletteMedianCut();
		});

		// TODO: temporary solution. see Palette class todo
		var uint32Array = pal8._paletteArray.map(function(point) { return point.uint32 });
		var uint8array = new Uint8Array((new Uint32Array(uint32Array)).buffer);

		var pcan = drawPixels(uint8array, 16, 128);

		$palt.empty().append(pcan);

		$redu.empty();
		imgs.forEach(function (img, index) {
			var id = baseName(img.src)[0];

			var img8;
			ti.mark("reduce '" + id + "'", function() {
/*
				pal8 = new ColorQuantization.Palette();
				pal8._paletteArray.push(ColorQuantization.Point.createByRGBA(10,49,4,255));
				pal8._paletteArray.push(ColorQuantization.Point.createByRGBA(80,148,15,255));
				pal8._paletteArray.push(ColorQuantization.Point.createByRGBA(149,172,45,255));
				pal8._paletteArray.push(ColorQuantization.Point.createByRGBA(173,209,79,255));
				pal8._paletteArray.push(ColorQuantization.Point.createByRGBA(181,215,166,255));
				pal8._paletteArray.push(ColorQuantization.Point.createByRGBA(161,176,175,255));
				pal8._paletteArray.push(ColorQuantization.Point.createByRGBA(219,231,196,255));
				pal8._paletteArray.push(ColorQuantization.Point.createByRGBA(56,236,56,255));
				pal8._paletteArray.push(ColorQuantization.Point.createByRGBA(116,167,148,255));
				pal8._paletteArray.push(ColorQuantization.Point.createByRGBA(200,20,128,255));
				pal8._paletteArray.push(ColorQuantization.Point.createByRGBA(54,101,7,255));
				pal8._paletteArray.push(ColorQuantization.Point.createByRGBA(196,94,54,255));
				pal8._paletteArray.push(ColorQuantization.Point.createByRGBA(56,92,200,255));
				pal8._paletteArray.push(ColorQuantization.Point.createByRGBA(58,235,200,255));
				pal8._paletteArray.push(ColorQuantization.Point.createByRGBA(200,92,200,255));
				pal8._paletteArray.push(ColorQuantization.Point.createByRGBA(56,20,200,255));
*/
				img8 = quant.reduce(pointBuffers[index], pal8).exportUint8Array();
			});

			ti.mark("reduced -> DOM", function() {
				var	ican = drawPixels(img8, img.width);
				$redu.append(ican);
			});
		});
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
	$palt = $("#palt"),
	$stat = $("#stat"),
	$note = $("#note"),
	$opts = $("#opts");

//	process(["img/grad_default.png"]);
}).on("change", "input, textarea, select", function() {
	cfg_edited = true;
});
