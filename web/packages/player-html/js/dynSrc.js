import { decode, encode } from "base85";
import { Buffer } from "buffer";
import { gzipSync, gunzipSync } from "zlibjs";

// decode base85-gzip encoded file
function deb85gz(data) {
    let len = data[0];
    let decoded = len ? decode(data[1], "z85") : Buffer.alloc(0);
    // the file size for z85 needs to be a multiple of 4
    if (len != decoded.length) {
        let truncated = Buffer.alloc(len);
        decoded.copy(truncated, 0, 0, len);
        decoded = truncated;
    }
    decoded = gunzipSync(decoded, { noBuffer: true, H: true }); // noBuffer is mangled to H in zlibjs
    return URL.createObjectURL(new Blob([decoded], { type: data[2] }));
}

// encode base85-gzip file
function enb85gz(data) {
    let zipped = Buffer.from(gzipSync(data, { noBuffer: true, H: true })); // noBuffer is mangled to H in zlibjs
    let fileLength = zipped.length;
    // the file size for z85 needs to be a multiple of 4
    if (fileLength % 4 != 0) {
        let newFileContent = Buffer.alloc(Math.ceil(fileLength / 4) * 4);
        zipped.copy(newFileContent);
        zipped = newFileContent;
    }
    let encoded = encode(zipped, "z85");
    return [fileLength, encoded];
}

const decodedRes = {};

// RufflePlayerDynSrc without window. is defined in inline_html.js
RufflePlayerDynSrc = function(name) {
    if (decodedRes[name]) {
        return decodedRes[name];
    }
    let decoded = deb85gz(RES[name]);
    decodedRes[name] = decoded;
    RES[name].length = 0;
    return decoded;
}

// window.RufflePlayerDecodeSwf and window.RufflePlayerEncodeSwf are used in player.html
window.RufflePlayerDecodeSwf = function(content) {
    return deb85gz([content[0], content[1], "application/x-shockwave-flash"]);
}

window.RufflePlayerEncodeSwf = enb85gz;
