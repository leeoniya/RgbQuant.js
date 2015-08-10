History
-------

#### 2.0.0 _(????-??-??)_
- Transparency quant support (like pornel/pngquant, png8)

#### 1.2.0 _(2015-??-??)_
- Ordered dithering & half-toning (#10)
  - wiki: http://en.wikipedia.org/wiki/Ordered_dithering
  - kernels: https://github.com/eurica/makeplayingcards/blob/master/partial_imagemagick/thresholds.xml
- ~~CIEDE2000 color-diff option~~ _sooooo sloooow_ (see ciede2000 branch)

#### 1.1.3 _(2015-??-??)_
- Fix transparent bg when dithering (#7)

#### 1.1.2 _(2015-08-10)_
- Remove some unused files

#### 1.1.1 _(2015-02-04)_
- Adds the slightly faster but less accurate Manhatten color distance as option

#### 1.1.0 _(2015-02-03)_
- Caching options and perf improvements

#### 1.0.0 _(2015-01-27)_
- Any size output palette
- Multi-image, optimal palettes
- Predefined, reducible palettes
- Palette sorting by hue/sat/lum
- Various input formats: &lt;img&gt;, &lt;canvas&gt;, ImageData, pixel-array
- Indexed or Uint8Array image reduction
- Error-diffusion dithering (multi-kernel)
- Dithering strength option
- Browser, CommonJS, Node, component.io support