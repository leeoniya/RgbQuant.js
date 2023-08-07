RgbQuant-SMS.js
-----------

This is a tool for converting an image to a palette+tileset+map compatible with the Sega Master System while keeping the number of tiles down to a predefined limit; it uses [RgbQuant.js] to reduce the number of colors, then it does the usual steps of dividing the image into tiles and removing the duplicates; finally, it uses [clusterfck]'s k-means implementation to group tiles by similarity, and uses that information for merging together tiles that are similar enough.

*This is a work in progress*

TODO:

- Adapt RgbQuant's quantization to work adequately with SMS's pallete: **Done**;
- Implement routine for dividing the quantized image into tiles: **Done**;
- Implement removal of duplicate tiles, including those that are flipped: **Done**;
- Implement removal of similar, but not necessarily identical, tiles, in order to reduce the amount of tiles to a limit specified by the user: **Done**;
- Allow the user to upload his/her own image for conversion: **Done**;
- Allow image resizing: *Not started yet*;
- Implement command line support: *Not started yet*.

[RgbQuant.js]: https://github.com/leeoniya/RgbQuant.js
[clusterfck]: https://github.com/harthur/clusterfck
