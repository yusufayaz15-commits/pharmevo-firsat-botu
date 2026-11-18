#!/usr/bin/env node
// Pharmevo Fırsat Botu — Fırsatlar sekmesindeki "📡 Canlı Çağrı & Yarışma Radarı" için arka plan taraması.
// Türkiye'deki güncel proje, hibe, yarışma, kuluçka ve kongre duyurularını açık RSS akışlarından çeker, anahtar kelime
// süzgecinden geçirir, doğrular ve assets/firsatlar.json dosyasına yazar. Site bu dosyayı doğrudan GitHub'dan
// (raw.githubusercontent.com) okur; dosya yoksa ya da 3 günden eskiyse site kendi canlı taramasına ve gömülü seçkiye düşer.
//
// Kullanım (Node 18+, ek paket gerekmez):
//   node araclar/firsat-botu.mjs                       → tarar, assets/firsatlar.json'u günceller
//   node araclar/firsat-botu.mjs --kuru                → tarar, sonucu yazdırır, dosyaya dokunmaz
//   node araclar/firsat-botu.mjs --dogrula             → ayrıca her bağlantının yanıt verdiğini (HTTP < 400) kontrol eder
//   node araclar/firsat-botu.mjs --girdi akis.xml      → ağ yerine yerel RSS dosyasını işler (deneme / çevrimdışı)
//   node araclar/firsat-botu.mjs --cikti yol.json      → başka bir çıktı yolu
//   node araclar/firsat-botu.mjs --secki secki.json    → komitenin elle doğruladığı kayıtları da ekler ([{title,url,cat,end,sum,src}])
// Çıkış kodu: 0 başarılı (değişiklik yoksa dosya yeniden yazılmaz), 2 hiç geçerli kayıt bulunamadı (eski dosya korunur).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2), has = f => argv.includes(f), val = f => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : ""; };
const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CIKTI = path.resolve(val("--cikti") || path.join(KOK, "assets", "firsatlar.json"));
const TMO = 12000, MAX = 24, YAS = 120 * 864e5, YENILE = 24 * 3600e3;

// Sitedeki loadLiveOpps ile aynı sorgular ve süzgeçler (değiştirirsen app.js'teki OPP_Q / OPP_HIT / OPP_DOM / OPP_NO / OPP_CALL / OPP_RES ile eşle)
const SORGULAR = ["TÜBİTAK 2209 OR 2242 OR 2247 başvuru öğrenci", "TEKNOFEST sağlıkta yapay zeka OR biyoteknoloji yarışma başvuru", "TÜSEB çağrı OR FarmaFikir OR eczacılık öğrencileri yarışma", "ön kuluçka OR biyogirişim OR hızlandırma programı başvuru öğrenci", "eczacılık kongresi bildiri özet gönderimi"];
const gn = q => "https://news.google.com/rss/search?q=" + encodeURIComponent(q + " when:60d") + "&hl=tr&gl=TR&ceid=TR:tr";
// İstersen resmi RSS akışlarını da ekle (örn. üniversite TTO / proje ofisi duyuru akışları): [adres, kaynak adı]
const EK_AKISLAR = [];
const HIT = /2209|2242|2247|teknofest|tüseb|tuseb|farmafikir|kuluçka|kulucka|biyogirişim|girişim|hackathon|yarışma|yarisma|hibe|çağrı|cagri|burs|ödül|odul|kongre|sempozyum|bildiri|hızlandırma|brandstorm/i;
const DOM = /sağlık|saglik|eczac|ilaç|ilac|farma|biyo|tıp|medikal|öğrenci|ogrenci|üniversite|universite|tübitak|tubitak|teknofest|genç|araştırma/i;
const NO = /lise |lise$|liseli|lisesi|ortaokul|ilkokul|2204|ilköğretim|kpss|ales|yks|lgs|ihale|personel alım|memur alım/i;
const KAT = ["hibe", "yarisma", "kulucka", "kongre"];
// Duyuru olmayan sonuç/başarı haberlerini ele (TEKNOFEST derece haberleri listeyi dolduruyordu): başlıkta sonuç işareti olmamalı,
// başlıkta ya da özette bir çağrı/başvuru işareti bulunmalı
const CAGRI = /başvuru|basvuru|çağrı|cagri|açık|acik|son tarih|son gün|kayıt|açıldı|acildi|başladı|uzatıldı|duyuru|bildiri|özet|katılım|eğitim|egitim|program/i;
const SONUC = /sonuç|sonuc|açıklandı|belli oldu|final|birinci|ikinci|üçüncü|dördüncü|derece|kazandı|kazanan|ödülünü aldı|ödüllerini aldı|tamamlandı|sona erdi|tanıttı|paylaştı|başarı|şampiyon|madalya|yarıştı|rüzgar|ilk \d+['’]?[ae] gir/i;

function kategori(t){
  t = String(t || "").toLocaleLowerCase("tr");
  if (/kongre|sempozyum|bildiri|özet gönder|poster/.test(t)) return "kongre";
  if (/kuluçka|kulucka|hızlandırma|girişim|bigg|teknopark|teknokent|yatırım|startup|sanayi/.test(t)) return "kulucka";
  if (/2242|teknofest|yarışma|yarisma|hackathon|ödül|brandstorm|fikrim var/.test(t)) return "yarisma";
  if (/2209|2247|star |tübitak|tubitak|tüseb|tuseb|hibe|burs|destek program|çağrı/.test(t)) return "hibe";
  return "yarisma";
}
const VARLIK = {amp:"&", lt:"<", gt:">", quot:'"', apos:"'", nbsp:" "};
const duz = s => String(s || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " ")
  .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : +e.slice(1)) : VARLIK[e.toLowerCase()] ?? m)
  .replace(/\s+/g, " ").trim();
const etiket = (x, k) => { const m = new RegExp(`<${k}(?:\\s[^>]*)?>([\\s\\S]*?)</${k}>`, "i").exec(x); return m ? m[1] : ""; };
const temizUrl = u => { u = duz(u); return /^https?:\/\//i.test(u) && u.length <= 600 ? u : ""; };
const host = u => { try{ return new URL(u).hostname.replace(/^www\./, ""); }catch(e){ return ""; } };
const anahtar = s => String(s).toLocaleLowerCase("tr").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim().slice(0, 80);

function rssAyristir(xml, kaynakAdi){
  const out = [];
  for (const m of String(xml).matchAll(/<item[\s>][\s\S]*?<\/item>/gi)){
    const it = m[0], kaynak = duz(etiket(it, "source")) || kaynakAdi || "", t0 = duz(etiket(it, "title"));
    const title = kaynak && t0.endsWith(" - " + kaynak) ? t0.slice(0, -(kaynak.length + 3)) : t0, url = temizUrl(etiket(it, "link"));
    let sum = duz(etiket(it, "description")); if (anahtar(sum).startsWith(anahtar(title).slice(0, 30))) sum = "";
    out.push({title, sum:sum.slice(0, 260), url, src:kaynak || host(url), ts:Date.parse(duz(etiket(it, "pubDate"))) || 0});
  }
  return out;
}
async function getir(u){
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), TMO);
  try{ const r = await fetch(u, {signal:ac.signal, headers:{"user-agent":"PharmevoFirsatBotu/1.0 (+https://github.com)", "accept":"application/rss+xml, application/xml, text/xml, */*"}}); if (!r.ok) throw new Error("HTTP " + r.status); return await r.text(); }
  finally{ clearTimeout(t); }
}
async function yanitVeriyor(u){
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), TMO);
  try{ let r = await fetch(u, {method:"HEAD", redirect:"follow", signal:ac.signal}); if (r.status === 405 || r.status === 403) r = await fetch(u, {method:"GET", redirect:"follow", signal:ac.signal}); return r.status < 400; }
  catch(e){ return false; } finally{ clearTimeout(t); }
}
// Sitedeki fixLive ile aynı kurallar: zorunlu alanlar, uzunluklar, tarih biçimi, yinelenen başlıklar
function dogrula(list, simdi){
  const gor = new Set(), out = [];
  for (const a of list){
    const title = duz(a.title).slice(0, 160), url = temizUrl(a.url || ""); if (!url || title.length < 8) continue;
    const k = anahtar(title); if (gor.has(k)) continue;
    const t = title + " " + (a.sum || "");
    if (!a.secki && (!HIT.test(t) || !DOM.test(t) || NO.test(t) || !CAGRI.test(t) || SONUC.test(title))) continue;
    const ts = Number(a.ts) || 0; if (!a.secki && ts && simdi - ts > YAS) continue;
    const end = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(String(a.end || "")) ? String(a.end) : "";
    if (end && Date.parse(end.length === 10 ? end + "T23:59" : end) < simdi) continue;   // süresi geçen çağrı yayımlanmaz
    gor.add(k); out.push({title, sum:duz(a.sum).slice(0, 260), url, src:duz(a.src || host(url)).slice(0, 60), ts, cat:KAT.includes(a.cat) ? a.cat : kategori(t), ...(end ? {end} : {})});
  }
  return out;
}

const simdi = Date.now(), ham = [], rapor = [];
if (val("--girdi")){
  const p = path.resolve(val("--girdi")); const items = rssAyristir(fs.readFileSync(p, "utf8"), "");
  ham.push(...items); rapor.push(`yerel akış ${path.basename(p)}: ${items.length} kayıt`);
} else {
  const isler = [...SORGULAR.map(q => [gn(q), "", q]), ...EK_AKISLAR.map(([u, ad]) => [u, ad, ad])];
  const sonuc = await Promise.allSettled(isler.map(([u, ad]) => getir(u).then(x => rssAyristir(x, ad))));
  sonuc.forEach((r, k) => { if (r.status === "fulfilled"){ ham.push(...r.value); rapor.push(`✓ ${isler[k][2]}: ${r.value.length} kayıt`); } else rapor.push(`✗ ${isler[k][2]}: ${r.reason && r.reason.message || r.reason}`); });
}
if (val("--secki")){
  try{ const s = JSON.parse(fs.readFileSync(path.resolve(val("--secki")), "utf8")); (Array.isArray(s) ? s : []).forEach(x => ham.push({...x, secki:true, ts:Number(x.ts) || 0})); rapor.push(`seçki: ${Array.isArray(s) ? s.length : 0} kayıt`); }
  catch(e){ rapor.push("✗ seçki okunamadı: " + e.message); }
}
ham.sort((a, b) => (b.secki ? 1 : 0) - (a.secki ? 1 : 0) || b.ts - a.ts);
let items = dogrula(ham, simdi);
if (has("--dogrula")){
  const ok = await Promise.all(items.map(x => yanitVeriyor(x.url)));
  const once = items.length; items = items.filter((x, k) => ok[k]); rapor.push(`bağlantı doğrulama: ${items.length}/${once} yanıt verdi`);
}
items = items.slice(0, MAX);
console.log(rapor.join("\n"));
console.log(`süzgeçten geçen: ${items.length} / ${ham.length} ham kayıt · ` + KAT.map(k => `${k}: ${items.filter(x => x.cat === k).length}`).join(", "));
if (!items.length){ console.error("Geçerli kayıt bulunamadı; mevcut dosya korunuyor."); process.exit(2); }
if (has("--kuru")){ items.forEach(x => console.log(`• [${x.cat}] ${x.title} (${x.src})${x.end ? " · son: " + x.end : ""}\n  ${x.url}`)); process.exit(0); }

let eski = null; try{ eski = JSON.parse(fs.readFileSync(CIKTI, "utf8")); }catch(e){}
const ayni = eski && Array.isArray(eski.items) && JSON.stringify(eski.items) === JSON.stringify(items);
if (ayni && simdi - (Number(eski.at) || 0) < YENILE){ console.log("Liste değişmedi; dosya yeniden yazılmadı."); process.exit(0); }
fs.mkdirSync(path.dirname(CIKTI), {recursive:true});
fs.writeFileSync(CIKTI, JSON.stringify({v:1, at:simdi, kaynak:"pharmevo-firsat-botu", items}, null, 1) + "\n");
console.log(`yazıldı → ${path.relative(process.cwd(), CIKTI) || CIKTI}`);
