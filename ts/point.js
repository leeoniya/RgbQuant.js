var ColorQuantization;
(function (ColorQuantization) {
    var Point = (function () {
        function Point() {
            var args = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                args[_i - 0] = arguments[_i];
            }
            this.set.apply(this, args);
        }
        Point.prototype.set = function () {
            var args = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                args[_i - 0] = arguments[_i];
            }
            switch (args.length) {
                case 1:
                    if (typeof args[0] === "number") {
                        this.uint32 = args[0];
                        this._loadRGBA();
                    }
                    else if (Utils.typeOf(args[0]) === "Array") {
                        this.r = args[0][0];
                        this.g = args[0][1];
                        this.b = args[0][2];
                        this.a = args[0][3];
                        this._loadUINT32();
                    }
                    else {
                        throw new Error("Point.constructor/set: unsupported single parameter");
                    }
                    break;
                case 4:
                    this.r = args[0];
                    this.g = args[1];
                    this.b = args[2];
                    this.a = args[3];
                    this._loadUINT32();
                    break;
                default:
                    throw new Error("Point.constructor/set should have parameter/s");
            }
            this._loadQuadruplet();
        };
        Point.prototype._loadUINT32 = function () {
            this.uint32 = ((this.a << 24) |
                (this.b << 16) |
                (this.g << 8) |
                this.r // red
            ) >>> 0;
        };
        Point.prototype._loadRGBA = function () {
            this.r = this.uint32 & 0xff;
            this.g = (this.uint32 >>> 8) & 0xff;
            this.b = (this.uint32 >>> 16) & 0xff;
            this.a = (this.uint32 >>> 24) & 0xff;
        };
        Point.prototype._loadQuadruplet = function () {
            this.rgba = [
                this.r,
                this.g,
                this.b,
                this.a
            ];
        };
        return Point;
    })();
    ColorQuantization.Point = Point;
})(ColorQuantization || (ColorQuantization = {}));
