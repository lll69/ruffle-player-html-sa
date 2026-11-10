import { encode } from "base85";
import { minify as minifyHtml } from "html-minifier-terser";
import { minify_sync as minifyTerser } from "terser";
import { join } from "node:path";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

// currently only .wasm & .js files
const suffixToMime = {
    ".wasm": "application/wasm",
    ".js": "application/javascript",
};

// encode base85-gzip files
function generateDynSrcContent(distDir, resRegex) {
    const resList = readdirSync(distDir);
    let generated = {};
    for (const resName of resList) {
        const suffix = resName.substring(resName.lastIndexOf("."));
        if (resRegex.test(resName)) {
            let fileContent = readFileSync(join(distDir, resName));
            fileContent = gzipSync(fileContent, { level: 9 });
            const fileLength = fileContent.length;
            // the file size for z85 needs to be a multiple of 4
            if (fileLength % 4 != 0) {
                let newFileContent = Buffer.alloc(Math.ceil(fileLength / 4) * 4);
                fileContent.copy(newFileContent);
                fileContent = newFileContent;
            }
            const encoded = encode(fileContent, "z85");
            if (!encoded) throw new Error("Failed to encode", resName);
            generated[resName] = [fileLength, encoded, suffixToMime[suffix] || "application/octet-stream"];
        }
    }
    return `const RES = ${JSON.stringify(generated)};`;
}

function generatePlayerJs(dynSrcJsPath, playerJsPath, dynSrcContent) {
    const dynSrcJsContent = readFileSync(dynSrcJsPath, "utf-8");
    const playerJsContent = readFileSync(playerJsPath, "utf-8");
    // RufflePlayerDynSrc must be pre-defined and it is used in dynSrc.js so it can be mangled
    return minifyTerser(`(() => { let RufflePlayerDynSrc;\n${dynSrcContent}\n${dynSrcJsContent}\n${playerJsContent}\n})();`, {
        mangle: true,
        compress: true,
    }).code;
}

function replaceJs(jsContent) {
    // replace it so html will work
    return jsContent.replace(/(<)(\/script>)/g, '\\x3C$2');
}

function inlineJsToHtml(htmlContent, jsContent) {
    return htmlContent.replace('<script src="ruffle.js"></script>', () => `<script>${jsContent}</script>`);
}

function minimizeHtml(htmlContent) {
    return minifyHtml(htmlContent, {
        collapseWhitespace: true,
        removeComments: true,
        minifyCSS: true,
        minifyJS: true,
    });
}

async function main() {
    console.log("Packaging...");
    const dynSrcContent = generateDynSrcContent("dist", /^(core\.ruffle\..+\.js|.+\.wasm)$/);
    const playerJs = replaceJs(generatePlayerJs("dist/dynSrc.js", "dist/ruffleUnpacked.js", dynSrcContent));
    const htmlNames = [
        "player.html",
        "player-mobile-landscape.html",
        "player-mobile-portrait.html",
    ];
    const htmlContent = readFileSync("player.html", "utf-8");
    const htmlContents = [
        // generate html with different rotations as prebuilt examples
        htmlContent.replaceAll('"MOBILE_ROTATE_NONE"', () => '"NONE"'),
        htmlContent.replaceAll('"MOBILE_ROTATE_NONE"', () => '"LAND"'),
        htmlContent.replaceAll('"MOBILE_ROTATE_NONE"', () => '"PORT"'),
    ].map(content => inlineJsToHtml(content, playerJs));
    for (let i = 0; i < htmlContents.length; i++) {
        htmlContents[i] = await minimizeHtml(htmlContents[i]);
    }
    htmlNames.forEach((name, idx) => {
        writeFileSync(join("dist", name), htmlContents[idx], "utf-8");
    });
    writeFileSync("dist/ruffle.js", playerJs, "utf-8");
}

main();
