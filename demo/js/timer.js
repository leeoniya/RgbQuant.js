function Timer(autostart, internal, offset) {
	var stack = [],
		total = 0;

	if (internal)
		this._log = [];

	this.start = function() {
		stack.push(Date.now());
	};

	this.mark = function(msg, fn, ctx) {
		var ti = Date.now();
		stack.push(ti);
		var diff = ti - stack[stack.length-2];
		total += diff;

		if (fn) {
			fn.call(ctx || this);
			return this.mark(msg);
		}

		if (msg)
			this.log(total, diff, msg);

		return diff;
	};

	this.log = function() {
		if (this._log)
			this._log.push(Array.prototype.slice.apply(arguments));
		else
			console.log.apply(console, arguments);
	};

	this.getLog = function() {
		return this._log;
	};

	if (autostart)
		this.start();
}