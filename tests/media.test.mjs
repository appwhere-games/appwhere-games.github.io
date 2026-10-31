import {test} from 'node:test';
import assert from 'node:assert/strict';
import {storeScreenshots,appPageScreenshots} from '../scripts/enrich-media.mjs';
import {appleGameTags} from '../assets/genres.js';
test('store galleries retain three distinct HTTPS images from store CDNs',()=>{
  const valid=[1,2,3,4].map(id=>`https://is1-ssl.mzstatic.com/image/${id}.jpg`);
  assert.deepEqual(storeScreenshots([valid[0],valid[0],'javascript:alert(1)','https://unrelated.example/a.jpg',...valid]),valid.slice(0,3));
});
test('product-page fallback reads only this game’s media, including Vision and Watch shelves',()=>{
  const shot=id=>({screenshot:{template:`https://is1-ssl.mzstatic.com/image/${id}/{w}x{h}{c}.{f}`,width:3840,height:2160}});
  const payload={data:[{intent:{id:'other'},data:{shelfMapping:{product_media_iphone:{items:[shot('other-game')]}}}},{intent:{id:'42'},data:{shelfMapping:{similar_apps:{items:[shot('recommendation')]},product_media_vision_:{items:[shot(1),shot(2),shot(3),shot(4)]}}}}]};
  const urls=appPageScreenshots(`<script id="serialized-server-data">${JSON.stringify(payload)}</script>`,'42');
  assert.equal(urls.length,3);
  assert.ok(urls.every(url=>url.endsWith('/960x540bb.jpg')));
  assert.ok(urls.every(url=>!url.includes('other-game')&&!url.includes('recommendation')));
});
test('worldwide Apple genres share the same labels regardless of storefront language',()=>{
  assert.deepEqual(appleGameTags({genres:['ゲーム','アクション','パズル'],genreIds:['6014','7001','7012']}),['Action','Puzzle']);
});
