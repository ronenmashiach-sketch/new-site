const r = await fetch('https://www.ynet.co.il/', {
  headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'he-IL' },
});
const s = await r.text();
const h1 = s.indexOf('<h1 class="slotTitle"');
const span = s.slice(h1, h1 + 600).match(/data-tb-title[^>]*>([\s\S]*?)<\/span>/);
console.log('TITLE:', span?.[1]?.replace(/<[^>]+>/g, '').trim());

const main = s.indexOf('class="main-items"');
console.log('h1 idx', h1, 'main-items idx', main);

const heroBlock = s.slice(h1, main + 30000);
console.log('heroBlock len', heroBlock.length);

const carousels = [...heroBlock.matchAll(/<div class="MediaCarousel"[^>]*style="([^"]+)"[^>]*>/g)];
console.log('carousels in heroBlock:');
carousels.slice(0, 8).forEach((m, i) => console.log(i, m[1], 'at', m.index));

const idx600 = heroBlock.indexOf('height:600px;width:410px');
console.log('600 at', idx600);
const slice600 = heroBlock.slice(idx600, idx600 + 6000);
const imgs = [...slice600.matchAll(/<img[^>]+(?:src|data-src)="([^"]+)"[^>]*(?:alt|title)="([^"]*)"/g)];
console.log('imgs in 600 block:');
imgs.slice(0, 6).forEach((m, i) => console.log(i, m[1].slice(0, 130), '|', m[2]));

const allImgs = [...heroBlock.matchAll(/<img[^>]+(?:src|data-src)="(https:\/\/ynet-pic[^"]+)"[^>]*(?:alt|title)="([^"]*)"/g)];
console.log('all hero ynet-pic imgs in heroBlock (first 6):');
allImgs.slice(0, 6).forEach((m, i) => console.log(i, m[1].slice(0, 130), '|', m[2]));

const articleHref = 'hkc2guiabl';
const idxArticle = heroBlock.indexOf(articleHref);
console.log('article id pos in heroBlock', idxArticle);
if (idxArticle > 0) {
  const around = heroBlock.slice(Math.max(0, idxArticle - 4000), idxArticle + 4000);
  const imgsAround = [...around.matchAll(/<img[^>]+(?:src|data-src)="(https:\/\/ynet-pic[^"]+)"/g)];
  console.log('imgs near article href:');
  imgsAround.slice(0, 8).forEach((m, i) => console.log(i, m[1].slice(0, 130)));
}

const beforeH1 = s.slice(Math.max(0, h1 - 8000), h1);
const idxArtBefore = beforeH1.lastIndexOf('hkc2guiabl');
console.log('article id before h1?', idxArtBefore);
if (idxArtBefore > 0) {
  const arr = beforeH1.slice(Math.max(0, idxArtBefore - 4000), idxArtBefore + 1500);
  const imgsB = [...arr.matchAll(/<img[^>]+(?:src|data-src)="(https:\/\/ynet-pic[^"]+)"[^>]*(?:alt|title)="([^"]*)"/g)];
  console.log('imgs before h1 around article id:');
  imgsB.slice(0, 8).forEach((m, i) => console.log(i, m[1].slice(0, 130), '|', m[2]));
}

const heroLink = `href="https://www.ynet.co.il/news/article/${'hkc2guiabl'}"`;
let pos = -1;
const positions = [];
let cursor = 0;
while ((cursor = s.indexOf(heroLink, cursor)) !== -1) {
  positions.push(cursor);
  cursor += heroLink.length;
}
console.log('hero href occurrences in full HTML:', positions);
positions.forEach((p) => {
  const around = s.slice(Math.max(0, p - 1500), p + 500);
  const im = around.match(/<img[^>]+(?:src|data-src)="(https:\/\/ynet-pic[^"]+)"[^>]*(?:alt|title)="([^"]*)"/);
  console.log('@', p, im ? im[1].slice(0, 130) + ' | ' + im[2] : '(no img nearby)');
});
