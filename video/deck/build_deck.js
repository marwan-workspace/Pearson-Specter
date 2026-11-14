// Pearson-Specter: 3-slide deck that matches the hook video (black, stars, white type, one red accent).
// node deck/build_deck.js  ->  deck/pearson-specter.pptx   (run from video/)
const pptxgen = require('pptxgenjs');
const OUT = process.env.OUT || 'deck/pearson-specter.pptx';
const { applyTheme } = require(process.env.PPTX_SKILL + '/scripts/apply_theme.js');

const THEME = {
  name: 'Pearson-Specter', headFontFace: 'Segoe UI Semibold', bodyFontFace: 'Segoe UI',
  colors: { dk1: '000000', lt1: 'FFFFFF', dk2: '0B0E14', lt2: '9AA3B2', accent1: 'FF4D4D', accent2: 'BFC7D5', accent3: '8A93A3',
    accent4: '5A6372', accent5: '2A303B', accent6: 'E6B24A', hlink: 'BFC7D5', folHlink: '8A93A3' },
};
const pres = new pptxgen();
pres.layout = 'LAYOUT_16x9'; // 10 x 5.625 in
pres.title = 'Pearson-Specter';
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
const C = pres.SchemeColor;
const MONO = 'Consolas';

pres.defineSlideMaster({ title: 'STARS', background: { path: 'deck/stars.png' } });
pres.defineSlideMaster({ title: 'BLACK', background: { color: '000000' } });

// 1. team
{
  const s = pres.addSlide({ masterName: 'STARS' });
  s.addImage({ path: 'deck/ecg_strip.png', x: 0, y: 2.05, w: 10, h: 1.5625, transparency: 35, objectName: 'ECG trace' });
  s.addText('PEARSON-SPECTER', { x: 0.5, y: 0.75, w: 9, h: 0.95, fontSize: 48, bold: true, color: C.background1, align: 'center', isTextBox: true, fontFace: THEME.headFontFace, objectName: 'Team name' });
  s.addText('CREW HEALTH SYSTEM', { x: 0.5, y: 1.65, w: 9, h: 0.4, fontSize: 16, color: C.background2, align: 'center', fontFace: MONO, charSpacing: 3, isTextBox: true, objectName: 'Tagline' });
  const names = ['Omar Abdulraheem', 'Zaid Salous', 'Saif Aldeen Shoujen', 'Marwan Alshashtari', 'Mohammad Dweik', 'Amer Mansour'];
  names.forEach((n, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    s.addText(n.toUpperCase(), { x: 0.75 + col * 2.9, y: 3.6 + row * 0.55, w: 2.7, h: 0.45, fontSize: 15, color: C.background1, align: 'center', fontFace: MONO, isTextBox: true, objectName: 'Member ' + (i + 1) });
  });
  s.addText('NASA SPACE APPS CHALLENGE 2026  ·  AMMAN', { x: 0.5, y: 4.95, w: 9, h: 0.35, fontSize: 11, color: C.accent3, align: 'center', fontFace: MONO, charSpacing: 2, isTextBox: true, objectName: 'Event' });
}

// 2. the video, embedded so it plays in the slide
{
  const s = pres.addSlide({ masterName: 'BLACK' });
  s.addMedia({ type: 'video', path: 'final/pearson-specter-hook.mp4', cover: 'image/jpeg;base64,' + require('fs').readFileSync('deck/poster_end.jpg').toString('base64'), x: 0, y: 0, w: 10, h: 5.625, objectName: 'Hook video' });
  s.addNotes('Click the video to play it (about 1:21). It is embedded in the file, so no external player is needed.');
}

// 3. Luca Parmitano, 16 July 2013: his face (official portrait) full height on the left, the spacewalk itself inset
{
  const s = pres.addSlide({ masterName: 'BLACK' });
  s.addImage({ path: 'deck/dl/parmitano_portrait.jpg', x: 0, y: 0, w: 3.4, h: 5.625, sizing: { type: 'cover', w: 3.4, h: 5.625 }, altText: 'Official NASA portrait of Luca Parmitano in his spacesuit, January 2013', objectName: 'Parmitano portrait' });
  s.addText('16 JULY 2013', { x: 3.85, y: 0.45, w: 5.7, h: 0.35, fontSize: 13, color: C.accent1, fontFace: MONO, charSpacing: 2, margin: 0, isTextBox: true, objectName: 'Date' });
  s.addText('Luca Parmitano nearly drowned in space', { x: 3.85, y: 0.8, w: 5.7, h: 0.95, fontSize: 24, bold: true, color: C.background1, fontFace: THEME.headFontFace, margin: 0, valign: 'top', isTextBox: true, objectName: 'Title' });
  s.addText([
    { text: 'During a spacewalk outside the ISS, about 1.5 litres of water from his suit\'s cooling system leaked into his helmet.', options: { bullet: true, breakLine: true } },
    { text: 'It covered his eyes, nose and ears and cut his radio. He found his way back to the airlock by feel.', options: { bullet: true, breakLine: true } },
    { text: 'He survived because help was minutes away. On the way to Mars, it won\'t be.', options: { bullet: true } },
  ], { x: 3.85, y: 1.85, w: 5.7, h: 1.7, fontSize: 14, color: C.accent2, paraSpaceAfter: 6, margin: 0, valign: 'top', isTextBox: true, objectName: 'Story' });
  s.addImage({ path: 'deck/dl/parmitano.jpg', x: 6.95, y: 3.7, w: 2.6, h: 1.73, altText: 'Luca Parmitano\'s helmet visor during a spacewalk outside the ISS, 9 July 2013', objectName: 'Spacewalk photo' });
  s.addText('We studied past emergencies like this one to design the crew\'s on-board doctor.', { x: 3.85, y: 3.75, w: 2.95, h: 1.0, fontSize: 12, italic: true, color: C.background1, margin: 0, valign: 'top', isTextBox: true, objectName: 'Why it matters' });
  s.addText('Photos: NASA. Portrait, Jan 2013; his spacewalk, 9 July 2013', { x: 3.85, y: 5.0, w: 2.9, h: 0.4, margin: 0, fontSize: 9, color: C.background2, fontFace: MONO, valign: 'bottom', isTextBox: true, objectName: 'Photo credit' });
}

(async () => {
  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log('wrote deck/pearson-specter.pptx');
})();
