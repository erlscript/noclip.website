
@inline
function expand3to8(n: u8): u8 {
    return (n << (8 - 3)) | (n << (8 - 6)) | (n >>> (9 - 8));
}

@inline
function expand4to8(n: u8): u8 {
    return (n << 4) | n;
}

@inline
function expand5to8(n: u8): u8 {
    return (n << (8 - 5)) | (n >>> (10 - 8));
}

@inline
function expand6to8(n: u8): u8 {
    return (n << (8 - 6)) | (n >>> (12 - 8));
}

// GX uses a HW approximation of 3/8 + 5/8 instead of 1/3 + 2/3.
@inline
function s3tcblend(a: u32, b: u32): u8 {
    // return (a*3 + b*5) / 8;
    let tmp: u32 = (((a << 1) + a) + ((b << 2) + b)) >>> 3;
    return <u8> tmp;
}

@inline
function get(offs: u32): u8 {
    return load<u8>(offs);
}

@inline
function set(offs: u32, b: u8): void {
    store<u8>(offs, b);
}

@inline
function get16be(offs: u32): u16 {
    return (load<u8>(offs) << 8) | load<u8>(offs + 1);
}

export function decode_CMPR(pScratch: u32, pDst: u32, pSrc: u32, w: u32, h: u32): void {
    // CMPR swizzles macroblocks to be in a 2x2 grid of UL, UR, BL, BR.
    let colorTable: u32 = pScratch;

    let srcOffs: u32 = pSrc;
    for (let yy: u32 = 0; yy < h; yy += 8) {
        for (let xx: u32 = 0; xx < w; xx += 8) {
            for (let yb: u32 = 0; yb < 8; yb += 4) {
                for (let xb: u32 = 0; xb < 8; xb += 4) {
                    // CMPR difference: Big-endian color1/2
                    let color1: u16 = get16be(srcOffs + 0x00);
                    let color2: u16 = get16be(srcOffs + 0x02);

                    // Fill in first two colors in color table.
                    set(colorTable + 0, expand5to8(<u8> ((color1 >> 11) & 0x1F)));
                    set(colorTable + 1, expand6to8(<u8> ((color1 >> 5) & 0x3F)));
                    set(colorTable + 2, expand5to8(<u8> (color1 & 0x1F)));
                    set(colorTable + 3, 0xFF);

                    set(colorTable + 4, expand5to8(<u8> ((color2 >> 11) & 0x1F)));
                    set(colorTable + 5, expand6to8(<u8> ((color2 >> 5) & 0x3F)));
                    set(colorTable + 6, expand5to8(<u8> (color2 & 0x1F)));
                    set(colorTable + 7, 0xFF);

                    if (color1 > color2) {
                        // Predict gradients.
                        set(colorTable + 8,  s3tcblend(get(colorTable + 4), get(colorTable + 0)));
                        set(colorTable + 9,  s3tcblend(get(colorTable + 5), get(colorTable + 1)));
                        set(colorTable + 10, s3tcblend(get(colorTable + 6), get(colorTable + 2)));
                        set(colorTable + 11, 0xFF);

                        set(colorTable + 12, s3tcblend(get(colorTable + 0), get(colorTable + 4)));
                        set(colorTable + 13, s3tcblend(get(colorTable + 1), get(colorTable + 5)));
                        set(colorTable + 14, s3tcblend(get(colorTable + 2), get(colorTable + 6)));
                        set(colorTable + 15, 0xFF);
                    } else {
                        set(colorTable + 8,  (get(colorTable + 0) + get(colorTable + 4)) >>> 1);
                        set(colorTable + 9,  (get(colorTable + 1) + get(colorTable + 5)) >>> 1);
                        set(colorTable + 10, (get(colorTable + 2) + get(colorTable + 6)) >>> 1);
                        set(colorTable + 11, 0xFF);

                        // CMPR difference: GX fills with an alpha 0 midway point here.
                        set(colorTable + 12, get(colorTable + 8));
                        set(colorTable + 13, get(colorTable + 9));
                        set(colorTable + 14, get(colorTable + 10));
                        set(colorTable + 15, 0x00);
                    }

                    for (let y = 0; y < 4; y++) {
                        let bits = get(srcOffs + 0x04 + y);
                        for (let x = 0; x < 4; x++) {
                            let dstPx = (yy + yb + y) * w + xx + xb + x;
                            let dstOffs = pDst + dstPx * 4;
                            let colorIdx = (bits >>> 6) & 0x03;
                            set(dstOffs + 0, get(colorTable + colorIdx * 4 + 0));
                            set(dstOffs + 1, get(colorTable + colorIdx * 4 + 1));
                            set(dstOffs + 2, get(colorTable + colorIdx * 4 + 2));
                            set(dstOffs + 3, get(colorTable + colorIdx * 4 + 3));
                            bits <<= 2;
                        }
                    }

                    srcOffs += 8;
                }
            }
        }
    }
}

export function decode_I8(pScratch: u32, pDst: u32, pSrc: u32, w: u32, h: u32): void {
    const bw: u8 = 8;
    const bh: u8 = 4;

    let srcOffs: u32 = 0;
    for (let yy: u32 = 0; yy < h; yy += bh) {
        for (let xx: u32 = 0; xx < w; xx += bw) {
            for (let y: u8 = 0; y < bh; y++) {
                for (let x: u8 = 0; x < bw; x++) {
                    let dstPixel: u32 = (w * (yy + y)) + xx + x;
                    let dstOffs: u32 = pDst + dstPixel * 4;
                    let i = get(pSrc + srcOffs);
                    set(dstOffs + 0, i);
                    set(dstOffs + 1, i);
                    set(dstOffs + 2, i);
                    set(dstOffs + 3, i);
                    srcOffs++;
                }
            }
        }
    }
}

export function decode_I4(pScratch: u32, pDst: u32, pSrc: u32, w: u32, h: u32): void {
    const bw: u8 = 8;
    const bh: u8 = 8;

    let srcOffs: u32 = 0;
    for (let yy: u32 = 0; yy < h; yy += bh) {
        for (let xx: u32 = 0; xx < w; xx += bw) {
            for (let y: u8 = 0; y < bh; y++) {
                for (let x: u8 = 0; x < bw; x++) {
                    let dstPixel: u32 = (w * (yy + y)) + xx + x;
                    let dstOffs: u32 = pDst + dstPixel * 4;
                    let ii: u8 = get(pSrc + (srcOffs >> 1));
                    let i4: u8 = ii >>> ((srcOffs & 1) ? 0 : 4) & 0x0F;
                    let i: u8 = expand4to8(i4);
                    set(dstOffs + 0, i);
                    set(dstOffs + 1, i);
                    set(dstOffs + 2, i);
                    set(dstOffs + 3, i);
                    srcOffs++;
                }
            }
        }
    }
}

export function decode_IA4(pScratch: u32, pDst: u32, pSrc: u32, w: u32, h: u32): void {
    const bw: u8 = 8;
    const bh: u8 = 4;

    let srcOffs: u32 = 0;
    for (let yy: u32 = 0; yy < h; yy += bh) {
        for (let xx: u32 = 0; xx < w; xx += bw) {
            for (let y: u8 = 0; y < bh; y++) {
                for (let x: u8 = 0; x < bw; x++) {
                    let dstPixel: u32 = (w * (yy + y)) + xx + x;
                    let dstOffs: u32 = pDst + dstPixel * 4;
                    let ia: u8 = get(pSrc + srcOffs);
                    let a: u8 = expand4to8(ia >>> 4);
                    let i: u8 = expand4to8(ia & 0x0F);
                    set(dstOffs + 0, i);
                    set(dstOffs + 1, i);
                    set(dstOffs + 2, i);
                    set(dstOffs + 3, a);
                    srcOffs++;
                }
            }
        }
    }
}

export function decode_IA8(pScratch: u32, pDst: u32, pSrc: u32, w: u32, h: u32): void {
    const bw: u8 = 4;
    const bh: u8 = 4;

    let srcOffs: u32 = 0;
    for (let yy: u32 = 0; yy < h; yy += bh) {
        for (let xx: u32 = 0; xx < w; xx += bw) {
            for (let y: u8 = 0; y < bh; y++) {
                for (let x: u8 = 0; x < bw; x++) {
                    let dstPixel: u32 = (w * (yy + y)) + xx + x;
                    let dstOffs: u32 = pDst + dstPixel * 4;
                    let a: u8 = get(pSrc + srcOffs + 0);
                    let i: u8 = get(pSrc + srcOffs + 1);
                    set(dstOffs + 0, i);
                    set(dstOffs + 1, i);
                    set(dstOffs + 2, i);
                    set(dstOffs + 3, a);
                    srcOffs += 2;
                }
            }
        }
    }
}
