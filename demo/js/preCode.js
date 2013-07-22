/**
* Copyright (c) 2013, Leon Sorokin
* All rights reserved. (MIT Licensed)
*
* preCode.js - painkiller for <pre><code> & <textarea>
*/

(function() {
	function preCode(selector) {
		var els = Array.prototype.slice.call(document.querySelectorAll(selector), 0);

		els.forEach(function(el, idx, arr){
			var txt = el.innerHTML
				.replace(/^[\r\n]+/, "")	// strip leading newline
				.replace(/\s+$/g, "");		// strip trailing whitespace

			if (/^\S/gm.test(txt)) {
				el.textContent = txt;
				return;
			}

			var mat, str, re = /^[\t ]+/gm, len, min = 1e3;

			while (mat = re.exec(txt)) {
				len = mat[0].length;

				if (len < min) {
					min = len;
					str = mat[0];
				}
			}

			if (min == 1e3)
				return;

			el.innerHTML = txt.replace(new RegExp("^" + str, 'gm'), "");
		});
	}

	document.addEventListener("DOMContentLoaded", function() {
		preCode("pre, pre code, textarea");
	}, false);
})();