/* EXPORTAÇÃO EM EXCEL E PDF — DRE 2027, DRE TCP e Folha 2027 (simulador). Silvio 14/11/2026: "no app, para as DRE's e simulador, crie opção
   para gerar em excel e pdf". Carregado ANTES do orcamento.js; instalado pelo gancho `instalaOrcExporta()` no fim do orcamento.js (usa TELAS, POS,
   D, est, FOLHA, MESES, fmt, pc, div, soma, dreLinha, folhaSel, folhaPosicao, folhaCaixa… de lá).
   · EXCEL: .xlsx nativo (ZIP sem compressão + CRC32, sem biblioteca, como nas telas de preço) — valores EXATOS em R$ (não os arredondados da tela),
     percentuais como número, uma aba por quadro, cabeçalho com versão, PT de origem e data/hora da emissão.
   · PDF: jsPDF + autotable carregados sob demanda do cdnjs (mesmas versões de custos.html / redes.html) — A4 paisagem, na unidade que está na tela.
   · FOLHA: sai a PROJEÇÃO (componentes mês a mês, por área, pessoas e movimentações, premissas, efeito de caixa e a projeção detalhada por conta).
     A folha ANALÍTICA (salário por posição) NÃO sai em arquivo — só na tela (base sigilosa; mesma linha da regra "margem não sai em arquivo").
   Cada tela monta um MODELO neutro { arq, titulo, sub, notas[], quadros[{ nome, titulo, cols[{t, tipo, w, dec}], linhas[{c[], e}], pdf }] } que os dois
   geradores leem. tipo: t = texto · n = valor (R$) · p = percentual · i = quantidade. e (estilo da linha): h = seção · t = total · s = subtotal ·
   p = linha de percentual (as colunas de valor viram %) · c = conferência · '' = normal.
   · PREMISSAS ORÇAMENTÁRIAS (14/11/2026, Silvio: "gerar um PDF com as premissas orçamentárias, para levar para discussão com a TCP/Diretoria"): só PDF.
     O modelo sai do MESMO HTML que a tela desenha (TELAS.premissas_orc()) — uma fonte só, o PDF não diverge da tela. Tela de texto não cabe no quadro
     numérico: o modelo traz `abertura` { avisos[], titulo, texto, indice[{ id, t }], cartoes[{ rot, valor, meta, barra, tom }] } e quadros com `secao: true`
     { id, titulo, valor, texto, cols[{ t, tipo ('v' = valor em destaque), w (peso da largura), cor }], linhas[{ c[] }], discutir { t, itens[] }, notas[] }.
     Quadro de detalhe (<details>) da tela só entra, como anexo no fim, se estiver ABERTO na tela na hora da emissão. */
"use strict";

/* ------------------------------------------------------------------------------------------- ZIP (store) + utilidades */
const EXP_CRCT = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; } return t; })();
function expCrc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = EXP_CRCT[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function expZip(arquivos) {                                // arquivos: [{ nome, dados (Uint8Array) }]
  const enc = new TextEncoder(), partes = [], central = []; let off = 0;
  const u16 = v => [v & 255, (v >> 8) & 255], u32 = v => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255];
  for (const a of arquivos) {
    const nb = enc.encode(a.nome), crc = expCrc32(a.dados), n = a.dados.length;
    const lh = [].concat(u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(n), u32(n), u16(nb.length), u16(0));
    partes.push(new Uint8Array(lh), nb, a.dados);
    central.push([].concat(u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(n), u32(n),
      u16(nb.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(off)), nb);
    off += lh.length + nb.length + n;
  }
  const cdIni = off, cdPart = [];
  for (let i = 0; i < central.length; i += 2) { const h = new Uint8Array(central[i]); cdPart.push(h, central[i + 1]); off += h.length + central[i + 1].length; }
  const eocd = new Uint8Array([].concat(u32(0x06054b50), u16(0), u16(0), u16(arquivos.length), u16(arquivos.length), u32(off - cdIni), u32(cdIni), u16(0)));
  const todos = [...partes, ...cdPart, eocd]; let tot = 0; todos.forEach(p => tot += p.length);
  const out = new Uint8Array(tot); let p = 0; todos.forEach(b => { out.set(b, p); p += b.length; });
  return out;
}
const expXml = s => String(s ?? '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const expCol = n => { let s = ''; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = (n - r - 1) / 26; } return s; };
const expAba = s => String(s).replace(/[:\\\/?*\[\]]/g, '-').slice(0, 31);
const expNomeArq = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
const expHoje = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return { arq: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, br: `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}` }; };
const expNum = v => typeof v === 'number' && isFinite(v);
function expBaixa(blob, nome) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}

/* ------------------------------------------------------------------------------------------- EXCEL (.xlsx nativo) */
const EXP_EST = { '': 0, d: 0, l: 0, s: 1, t: 2, h: 3, p: 4, c: 4 };        // estilo da linha → bloco de 4 formatos (texto, valor, %, quantidade)
const EXP_TIPO = { t: 0, n: 1, p: 2, i: 3 };
function expXlsx(M) {
  const enc = new TextEncoder(), A = s => enc.encode(s), XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const txt = (ref, v, s) => `<c r="${ref}" t="inlineStr"${s ? ` s="${s}"` : ''}><is><t xml:space="preserve">${expXml(v)}</t></is></c>`;
  const abas = [], usados = new Set();
  M.quadros.forEach((q, k) => {
    let nome = expAba(q.nome || q.titulo || 'Quadro ' + (k + 1)); while (usados.has(nome.toLowerCase())) nome = expAba(nome.slice(0, 28) + ' ' + (k + 1)); usados.add(nome.toLowerCase());
    let rows = `<row r="1" ht="20" customHeight="1">${txt('A1', M.titulo + (q.titulo && q.titulo !== M.titulo ? ' — ' + q.titulo : ''), 1)}</row>`
      + `<row r="2">${txt('A2', M.sub, 2)}</row><row r="3">${txt('A3', [q.nota, ...(M.notas || [])].filter(Boolean).join(' · '), 2)}</row><row r="4"></row>`
      + `<row r="5" ht="30" customHeight="1">${q.cols.map((c, j) => txt(expCol(j + 1) + '5', c.t, 23)).join('')}</row>`;
    q.linhas.forEach((l, i) => {
      const r = i + 6, b = 3 + (EXP_EST[l.e || ''] || 0) * 4;
      rows += `<row r="${r}">` + q.cols.map((c, j) => {
        const ref = expCol(j + 1) + r, v = l.c[j];
        if (v == null || v === '') return (l.e === 't' || l.e === 'h') ? `<c r="${ref}" s="${b}"/>` : '';
        if (c.tipo === 't' || !expNum(v)) return txt(ref, v, b);
        const tp = l.e === 'p' && c.tipo === 'n' ? 'p' : c.tipo;
        return `<c r="${ref}" s="${b + (EXP_TIPO[tp] || 1)}"><v>${v}</v></c>`;
      }).join('') + '</row>';
    });
    const cong = q.cong ?? 1;
    abas.push({ nome, xml: XML + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>'
      + `<sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ${cong ? `xSplit="${cong}" ` : ''}ySplit="5" topLeftCell="${expCol(cong + 1)}6" activePane="${cong ? 'bottomRight' : 'bottomLeft'}" state="frozen"/></sheetView></sheetViews>`
      + '<cols>' + q.cols.map((c, j) => `<col min="${j + 1}" max="${j + 1}" width="${c.w || (c.tipo === 't' ? 30 : c.tipo === 'p' ? 9 : 15)}" customWidth="1"/>`).join('') + '</cols>'
      + '<sheetData>' + rows + '</sheetData><pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>'
      + '<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>' });
  });
  const fontes = ['<font><sz val="10"/><name val="Calibri"/></font>', '<font><b/><sz val="10"/><name val="Calibri"/></font>',
    '<font><b/><sz val="14"/><color rgb="FF17181A"/><name val="Calibri"/></font>', '<font><sz val="9"/><color rgb="FF6B7076"/><name val="Calibri"/></font>',
    '<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>', '<font><i/><sz val="10"/><color rgb="FF5B6472"/><name val="Calibri"/></font>'];
  const fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FF17181A"/><bgColor indexed="64"/></patternFill></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FFE9EDF2"/><bgColor indexed="64"/></patternFill></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FFD3DCE8"/><bgColor indexed="64"/></patternFill></fill>'];
  const xf = (num, font, fill, extra = '') => `<xf numFmtId="${num}" fontId="${font}" fillId="${fill}" borderId="0" xfId="0"${num ? ' applyNumberFormat="1"' : ''}${font ? ' applyFont="1"' : ''}${fill ? ' applyFill="1"' : ''}${extra ? ' applyAlignment="1">' + extra + '</xf>' : '/>'}`;
  const xfs = [xf(0, 0, 0), xf(0, 2, 0), xf(0, 3, 0)];
  [[0, 0], [1, 0], [1, 3], [1, 4], [5, 0]].forEach(([font, fill]) => [0, 164, 165, 0].forEach(num => xfs.push(xf(num, font, fill))));      // 3..22 (quantidade = Geral)
  xfs.push(xf(0, 4, 2, '<alignment horizontal="center" vertical="center" wrapText="1"/>'));                                              // 23 = cabeçalho
  const estilos = XML + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.00;\\-#,##0.00"/><numFmt numFmtId="165" formatCode="0.0%;\\-0.0%"/></numFmts>'
    + `<fonts count="${fontes.length}">${fontes.join('')}</fonts><fills count="${fills.length}">${fills.join('')}</fills>`
    + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + `<cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  const tipos = XML + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    + abas.map((a, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
    + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>';
  const rels = XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
  const wb = XML + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
    + abas.map((a, i) => `<sheet name="${expXml(a.nome)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets></workbook>';
  const wbr = XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + abas.map((a, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
    + `<Relationship Id="rId${abas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  return expZip([{ nome: '[Content_Types].xml', dados: A(tipos) }, { nome: '_rels/.rels', dados: A(rels) }, { nome: 'xl/workbook.xml', dados: A(wb) },
    { nome: 'xl/_rels/workbook.xml.rels', dados: A(wbr) }, { nome: 'xl/styles.xml', dados: A(estilos) },
    ...abas.map((a, i) => ({ nome: `xl/worksheets/sheet${i + 1}.xml`, dados: A(a.xml) }))]);
}

/* ------------------------------------------------------------------------------------------- PDF (jsPDF + autotable, sob demanda) */
let _expLibPdf = null;
const expCarregaJs = src => new Promise((ok, erro) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => erro(new Error('não carregou ' + src)); document.head.appendChild(s); });
function expLibPdf() {
  if (window.jspdf && window.jspdf.jsPDF && window.jspdf.jsPDF.API && window.jspdf.jsPDF.API.autoTable) return Promise.resolve();
  return _expLibPdf || (_expLibPdf = expCarregaJs('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js')
    .then(() => expCarregaJs('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js')).catch(e => { _expLibPdf = null; throw e; }));
}
/* fontes padrão do PDF = WinAnsi: o que não existe nelas é trocado por equivalente (Δ → Var., − → -, ✓ → ok…) */
const expPdfT = s => String(s ?? '').replace(/Δ/g, 'Var.').replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/→/g, '->').replace(/≈/g, '~').replace(/[−–—]/g, '-').replace(/[✓✔]/g, 'ok')
  .replace(/›/g, '>').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/…/g, '...').replace(/[^\x00-\xFF]/g, '');
function expCelPdf(v, tipo, c) {
  if (v == null || v === '') return '';
  if (!expNum(v)) return expPdfT(v);
  if (tipo === 'p') return expPdfT(pc(v, c.dec ?? 1));
  if (tipo === 'i') return expPdfT(Math.abs(v) < 0.005 ? '-' : v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }));
  const o = {}; if (c.dec != null) o.dec = c.dec; if (c.uni) o.uni = c.uni;          // c.uni = 'R$' em valor unitário (não segue a unidade da tela)
  return expPdfT(fmt(v, o));
}
/* ---- texto corrido, cartões e seções (tela de texto: premissas). Texto "rico" = pedaços [{ t, b (negrito), i (itálico) }], '\n' = quebra — é o texto
   da tela, com o negrito da tela. Cada linha vai num único objeto de texto do PDF: a fonte troca sem reposicionar e quem avança é o leitor de PDF, com a
   largura real da letra; as larguras calculadas aqui só decidem a quebra e o alinhamento. Sinais que a Helvetica não tem (≈ → Δ ≤ ≥ ≠) saem na fonte
   Symbol; travessão, aspas e reticências saem como na tela (a Helvetica do PDF tem); o sinal de menos vira meia-risca. */
const EXP_COR = { tinta: [22, 32, 46], tinta2: [74, 84, 98], rot: [107, 116, 128], fio: [214, 219, 226], banda: [238, 241, 245], marca: [200, 16, 46],
  campo: [255, 246, 214], disc: [255, 248, 240], discB: [243, 217, 191], neg: [192, 57, 43], pos: [26, 127, 75], aviso: [254, 243, 199], avisoB: [240, 219, 168], avisoT: [107, 78, 0] };
const EXP_MM = 25.4 / 72;                                                                                  // 1 pt em mm
const EXP_SIMB = { '≈': [187, 549], '→': [174, 987], 'Δ': [68, 612], '≤': [163, 549], '≥': [179, 549], '≠': [185, 549] };   // sinal → [código na Symbol, largura em milésimos]
const EXP_CP = { '—': 151, '–': 150, '…': 133, '“': 147, '”': 148, '‘': 145, '’': 146, '•': 149, '›': 155, '€': 128 };     // o que a Helvetica tem fora do Latin-1 (código WinAnsi)
const expPdfR = s => String(s ?? '').replace(/−/g, '–').replace(/[✓✔]/g, 'ok').replace(/[^\x00-\xFF—–…“”‘’•›€]/g, '');
function expRico(no) {                                      // nó da tela → pedaços de texto, com o negrito e as quebras que a tela mostra (bloco dentro do nó = linha nova)
  const out = [], BLOCO = /^(P|DIV|H[1-6]|LI|UL|OL|TR|TABLE|SECTION|DETAILS|SUMMARY)$/;
  const quebra = () => { for (let i = out.length - 1; i >= 0; i--) { if (out[i].t === '\n') return; if (out[i].t.trim()) { out.push({ t: '\n' }); return; } } };
  (function anda(n, b) { n.childNodes.forEach(c => {
    if (c.nodeType === 3) out.push({ t: c.nodeValue.replace(/\s+/g, ' '), b });
    else if (c.nodeType !== 1) return;
    else if (c.tagName === 'BR') out.push({ t: '\n', b });
    else if (BLOCO.test(c.tagName)) { quebra(); anda(c, b || /^H[1-6]$/.test(c.tagName)); quebra(); }
    else { anda(c, b || /^(B|STRONG|TH)$/.test(c.tagName)); if (/^T[DH]$/.test(c.tagName)) out.push({ t: ' ', b }); }
  }); })(no, false);
  while (out.length && !out[out.length - 1].t.trim()) out.pop();
  return out;
}
const expRicoTxt = r => r.map(x => x.t).join('').replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').trim();
/* largura em "em", sem kerning (o PDF não aplica). As larguras do jsPDF vêm cortadas a 0,01 e as da Helvetica são múltiplos de 1/18: volta para o valor real */
function expLarg(doc, t, f) {
  return doc.getCharWidthsArray(t.replace(/[×÷]/g, '+'), { font: doc.internal.getFont('helvetica', f === 'b' ? 'bold' : 'normal'), doKerning: false })
    .reduce((s, w) => { const g = Math.round(w * 18) / 18; return s + (Math.abs(g - w) < 0.007 ? g : w); }, 0);
}
function expRicoLinhas(doc, rico, larg, fs, negrito) {      // quebra em linhas de até `larg` mm — nunca corta texto: palavra maior que a linha é partida
  const k = fs * EXP_MM, esp = 5 / 18 * k, linhas = []; let lin = { s: [], w: 0 }, pal = null;
  const poe = p => { const u = lin.s[lin.s.length - 1]; if (u && u.f === p.f) { u.t += p.t; u.w += p.w; } else lin.s.push({ t: p.t, f: p.f, w: p.w }); lin.w += p.w; };
  const nova = () => { linhas.push(lin); lin = { s: [], w: 0 }; };
  const fecha = () => {                                     // põe a palavra pendente na linha (ou na seguinte, se não couber)
    if (!pal) return; const p = pal; pal = null;
    if (lin.s.length && lin.w + esp + p.w > larg + 0.01) nova();
    if (lin.s.length) { const u = lin.s[lin.s.length - 1]; poe({ t: ' ', f: u.f === 's' ? 'n' : u.f, w: esp }); }
    p.p.forEach(x => {
      if (x.f === 's' || lin.w + x.w <= larg + 0.01) { poe(x); return; }
      for (const ch of x.t) { const w = expLarg(doc, ch, x.f) * k; if (lin.s.length && lin.w + w > larg + 0.01) nova(); poe({ t: ch, f: x.f, w }); }
    });
  };
  (rico || []).forEach(r => { const f = negrito || r.b ? 'b' : r.i ? 'i' : 'n';
    String(r.t ?? '').split(/(\n|[ \t\r]+|[≈→Δ≤≥≠])/).forEach(s => {
      if (!s) return;
      if (s === '\n') { fecha(); nova(); return; }
      if (/^[ \t\r]+$/.test(s)) { fecha(); return; }
      const sim = EXP_SIMB[s], t = sim ? String.fromCharCode(sim[0]) : expPdfR(s); if (!t) return;
      const x = { t, f: sim ? 's' : f, w: (sim ? sim[1] / 1000 : expLarg(doc, t, f)) * k };
      (pal || (pal = { p: [], w: 0 })).p.push(x); pal.w += x.w;
    }); });
  fecha(); if (lin.s.length || !linhas.length) linhas.push(lin);
  return linhas;
}
const expPdfStr = t => { let o = ''; for (const ch of t) { const c = EXP_CP[ch] || ch.charCodeAt(0); o += c === 40 || c === 41 || c === 92 ? '\\' + ch : c < 32 || c > 126 ? '\\' + c.toString(8).padStart(3, '0') : ch; } return o; };
function expRicoDesenha(doc, linhas, x, y, fs, cor, lh, alinha) {     // y = linha de base da 1ª linha · alinha: 'd' = termina em x, 'c' = centrado em x
  const I = doc.internal, n3 = v => (+v).toFixed(3), rg = cor.map(c => (c / 255).toFixed(3)).join(' ') + ' rg';
  const F = { n: I.getFont('helvetica', 'normal').id, b: I.getFont('helvetica', 'bold').id, i: I.getFont('helvetica', 'italic').id, s: I.getFont('symbol', 'normal').id };
  linhas.forEach((l, j) => {
    if (!l.s.length) return;
    const x0 = alinha === 'd' ? x - l.w : alinha === 'c' ? x - l.w / 2 : x;
    I.write('BT\n' + rg + '\n' + n3(I.getHorizontalCoordinate(x0)) + ' ' + n3(I.getVerticalCoordinate(y + j * lh)) + ' Td\n'
      + l.s.map(s => '/' + F[s.f] + ' ' + fs + ' Tf\n(' + expPdfStr(s.t) + ') Tj').join('\n') + '\nET');
  });
}
function expPdfAbertura(doc, M, y, g) {                     // 1ª página: título, texto de abertura, índice das seções (com a página de cada uma) e cartões
  const a = M.abertura, { W, MG } = g, util = W - 2 * MG, C = EXP_COR, L = (r, larg, fs, b) => expRicoLinhas(doc, typeof r === 'string' ? [{ t: r }] : r || [], larg, fs, b);
  (a.avisos || []).forEach(av => {                        // faixa de aviso que a tela põe acima do título (ex.: premissa alterada no app que o PT carregado ainda não reflete)
    const fs = 8.5, k = fs * EXP_MM, lh = k * 1.34, ls = L(av, util - 5.6, fs), h = (ls.length - 1) * lh + k + 3.4;
    doc.setFillColor(...C.aviso); doc.setDrawColor(...C.avisoB); doc.setLineWidth(0.2); doc.roundedRect(MG, y, util, h, 1.4, 1.4, 'FD');
    expRicoDesenha(doc, ls, MG + 2.8, y + 1.7 + k * 0.78, fs, C.avisoT, lh); y += h + 2.6;
  });
  if (a.titulo) { expRicoDesenha(doc, L(a.titulo, util, 14, true), MG, y + 4.6, 14, C.tinta, 6); y += 7.4; }
  if (a.texto && a.texto.length) { const fs = 8.5, lh = fs * EXP_MM * 1.34, ls = L(a.texto, util, fs); expRicoDesenha(doc, ls, MG, y + fs * EXP_MM * 0.9, fs, C.tinta2, lh); y += ls.length * lh + 2.4; }
  if (a.indice && a.indice.length) {                        // a página de cada seção só é conhecida no fim: o texto é escrito depois (g.depois)
    const fs = 7.2, hc = 4.8, px = 2.2, gp = 1.6; let x = MG;
    a.indice.forEach(it => {
      const w = L(it.t + ' · p. 00', 1e4, fs)[0].w + 2 * px;
      if (x > MG && x + w > MG + util) { x = MG; y += hc + gp; }
      doc.setDrawColor(...C.fio); doc.setLineWidth(0.2); doc.roundedRect(x, y, w, hc, hc / 2, hc / 2, 'S');
      const cx = x + w / 2, cy = y + hc / 2 + fs * EXP_MM * 0.36, pg = doc.internal.getCurrentPageInfo().pageNumber;
      g.depois.push(() => { const q = M.quadros.find(s => s.secao && s.id === it.id); doc.setPage(pg);
        expRicoDesenha(doc, L(it.t + (q && q._pag ? ' · p. ' + q._pag : ''), 1e4, fs), cx, cy, fs, C.tinta2, 4, 'c'); });
      x += w + gp;
    });
    y += hc + 3.6;
  }
  if (a.cartoes && a.cartoes.length) {
    const n = a.cartoes.length, gp = 4, wc = (util - gp * (n - 1)) / n, r = 1.7, fm = 7.6, lm = fm * EXP_MM * 1.32;
    const metas = a.cartoes.map(c => L(c.meta, wc - 8, fm)), hC = 15.6 + Math.max(...metas.map(m => m.length)) * lm + 1.6;
    a.cartoes.forEach((c, i) => {
      const x = MG + i * (wc + gp);
      doc.setFillColor(...(c.barra || C.marca)); doc.roundedRect(x, y, wc, hC, r, r, 'F');                 // a barra colorida é o que sobra à esquerda do branco
      doc.setFillColor(255, 255, 255); doc.roundedRect(x + 1.1, y, wc - 1.1, hC, r, r, 'F'); doc.rect(x + 1.1, y, r + 0.2, hC, 'F');
      doc.setDrawColor(...C.fio); doc.setLineWidth(0.2); doc.roundedRect(x, y, wc, hC, r, r, 'S');
      expRicoDesenha(doc, L(c.rot, 1e4, 6.6, true), x + 4.6, y + 5.3, 6.6, C.rot, 3);
      expRicoDesenha(doc, L(c.valor, 1e4, 15, true), x + 4.6, y + 12.3, 15, c.tom === 'neg' ? C.neg : c.tom === 'pos' ? C.pos : C.tinta, 6);
      expRicoDesenha(doc, metas[i], x + 4.6, y + 16.9, fm, C.tinta2, lm);
    });
    y += hC + 1.5;
  }
  return y;
}
const EXP_ESP = [{ vao: 6.5, ht: 4.9, tit: 2.6, lt: 1.34, txt: 1.8, hc: 5.4, pad: 1.25, lh: 1.3, cx: [2.2, 2.3, 1.3, 0.7, 1.3] },            // espaçamento normal
  { vao: 4.6, ht: 4.7, tit: 2.1, lt: 1.25, txt: 1.3, hc: 5.0, pad: 0.85, lh: 1.22, cx: [1.6, 1.8, 1.0, 0.4, 1.0] }];                          // compacto: só quando é o que falta para a seção caber na página
function expPdfSecao(doc, q, y, g, antes) {                 // seção de texto: título + valor, texto, quadro de premissas, caixa "para discutir" e notas
  const { W, MG, yTopo, fim } = g, util = W - 2 * MG, C = EXP_COR, FS = 8, K = FS * EXP_MM, PX = 1.6, FT = 8.5, pagina = fim - yTopo;
  const L = (r, larg, fs, b) => expRicoLinhas(doc, typeof r === 'string' ? [{ t: r }] : r || [], larg, fs, b), tot = a => a.reduce((s, x) => s + x, 0), pag = () => doc.internal.getCurrentPageInfo().pageNumber;
  /* quebra do texto — antes de desenhar, para decidir em que página a seção começa e onde a tabela pode ser dividida */
  const val = q.valor && q.valor.length ? L(q.valor, util * 0.5, 10.5, true) : [], wVal = Math.max(0, ...val.map(l => l.w));
  const tit = q.titulo ? L(q.titulo, util - 3.2 - (wVal ? wVal + 6 : 0), 11, true) : [], nT = Math.max(tit.length, val.length);
  const txt = q.texto && q.texto.length ? L(q.texto, util, FT) : [];
  const iV = q.cols.findIndex(c => c.tipo === 'v'), temTab = q.cols.length > 0 && q.linhas.length > 0, peso = j => q.cols[j].w || 1; let wC = q.cols.map(() => 0), cel = [];
  if (temTab) {                                             // largura pelo conteúdo: coluna que cabe numa linha fica do seu tamanho; as que não cabem dividem o resto pelo peso
    const nat = q.cols.map((c, j) => Math.max(L(String(c.t || '').toUpperCase(), 1e4, 6.4, true)[0].w, ...q.linhas.map(l => Math.max(...L(l.c[j], 1e4, FS, j === iV).map(x => x.w)))) + 2 * PX + 0.4 + (j === iV ? 2.6 : 0));
    if (iV >= 0) wC[iV] = Math.min(64, Math.max(27, nat[iV]));
    let resto = util - tot(wC), pes = tot(q.cols.map((c, j) => j === iV ? 0 : peso(j))); const P = pes;
    q.cols.map((c, j) => j).filter(j => j !== iV).sort((a, b) => nat[a] - nat[b]).forEach(j => { const cota = resto * peso(j) / pes; wC[j] = nat[j] <= cota * (pes > peso(j) ? 1.25 : 1) ? nat[j] : cota; resto -= wC[j]; pes -= peso(j); });
    if (resto > 0.01) q.cols.forEach((c, j) => { if (j !== iV) wC[j] += resto * peso(j) / P; });
    cel = q.linhas.map(l => q.cols.map((c, j) => L(l.c[j], wC[j] - 2 * PX - (j === iV ? 2.6 : 0), FS, j === iV)));
  }
  const xC = wC.map((w, j) => MG + tot(wC.slice(0, j))), dIt = q.discutir && q.discutir.itens.length ? q.discutir.itens.map(it => L(it, util - 9.4, FS)) : [], nN = (q.notas || []).length;
  const mede = e => {                                       // alturas da seção num espaçamento
    const LH = K * e.lh, hL = cel.map(cs => (Math.max(...cs.map(x => x.length)) - 1) * LH + K + 2 * e.pad);
    const hCx = dIt.length ? e.cx[1] + K + e.cx[2] + tot(dIt.map(ls => ls.length * LH + e.cx[3])) + e.cx[4] : 0, hFim = (hCx ? e.cx[0] + hCx : 0) + (nN ? 1 + nN * 3.8 : 0);
    const hIni = (nT ? nT * e.ht + e.tit : 0) + (txt.length ? txt.length * FT * EXP_MM * e.lt + e.txt : 0) + (temTab ? e.hc : 0);
    return { LH, hL, hCx, hFim, hIni, hSec: hIni + tot(hL) + hFim };
  };
  /* onde começa: inteira na página, se couber — nem que seja com o espaçamento compacto; senão na página seguinte. Só se divide a seção grande (mais de meia
     página), quando sobra pelo menos 1/3 da página e cabem título, texto, cabeçalho e 3 linhas — o fim (2 últimas linhas + "para discutir") nunca fica só */
  let e = EXP_ESP[0], m = mede(e), yy = antes ? y + e.vao : y;
  if (yy + m.hSec > fim) {
    const e1 = EXP_ESP[1], m1 = mede(e1), y1 = antes ? y + e1.vao : y;
    if (y1 + m1.hSec <= fim) { e = e1; m = m1; yy = y1; }
    else if (yy > yTopo + 1 && !(cel.length >= 5 && m.hSec > pagina / 2 && fim - yy >= pagina / 3 && yy + m.hIni + tot(m.hL.slice(0, 3)) <= fim)) {
      doc.addPage(); yy = yTopo; if (m.hSec > pagina && m1.hSec <= pagina) { e = e1; m = m1; }
    }
  }
  const { LH, hL, hCx, hFim } = m, LT = FT * EXP_MM * e.lt;
  q._pag = pag();
  if (nT) {
    doc.setFillColor(...C.marca); doc.rect(MG, yy + 0.4, 1.1, nT * e.ht - 1.1, 'F');
    expRicoDesenha(doc, tit, MG + 3.2, yy + 3.8, 11, C.tinta, e.ht); expRicoDesenha(doc, val, W - MG, yy + 3.8, 10.5, C.tinta, e.ht, 'd');
    yy += nT * e.ht + 0.8; doc.setDrawColor(...C.fio); doc.setLineWidth(0.25); doc.line(MG, yy, W - MG, yy); yy += e.tit - 0.8;
  }
  if (txt.length) { expRicoDesenha(doc, txt, MG, yy + FT * EXP_MM * 0.9, FT, C.tinta2, LT); yy += txt.length * LT + e.txt; }
  const cab = t => {                                        // cabeçalho do quadro (repetido quando a tabela continua na página seguinte)
    doc.setFillColor(...C.banda); doc.rect(MG, t, util, 4.5, 'F');
    q.cols.forEach((c, j) => { const ls = L(String(c.t || '').toUpperCase(), 1e4, 6.4, true); if (j === iV) expRicoDesenha(doc, ls, xC[j] + wC[j] - PX, t + 3.05, 6.4, C.rot, 3, 'd'); else expRicoDesenha(doc, ls, xC[j] + PX, t + 3.05, 6.4, C.rot, 3); });
    return t + e.hc;
  };
  const segue = comTab => { doc.addPage(); expRicoDesenha(doc, L((q.titulo || '') + ' (continuação)', util, 8.6, true), MG, yTopo + 3.1, 8.6, C.rot, 4); return comTab ? cab(yTopo + 5.2) : yTopo + 5.6; };
  if (temTab) yy = cab(yy);
  let ini = 0;
  cel.forEach((cs, i) => {
    if (i > ini && yy + tot(hL.slice(i)) + hFim > fim && (yy + hL[i] > fim || i >= cel.length - 2)) { yy = segue(true); ini = i; }
    q.cols.forEach((c, j) => {
      const ls = cs[j], yb = yy + e.pad + K * 0.78;
      if (j === iV) {                                       // valor: negrito, à direita, sobre o fundo de campo editável (como na tela)
        const w = Math.max(...ls.map(x => x.w));
        if (w > 0) { doc.setFillColor(...C.campo); doc.roundedRect(xC[j] + wC[j] - PX - w - 2.6, yy + e.pad - 0.6, w + 2.6, (ls.length - 1) * LH + K + 1.2, 0.8, 0.8, 'F'); }
        expRicoDesenha(doc, ls, xC[j] + wC[j] - PX - 1.3, yb, FS, C.tinta, LH, 'd');
      } else expRicoDesenha(doc, ls, xC[j] + PX, yb, FS, c.cor === 2 ? C.tinta2 : C.tinta, LH);
    });
    yy += hL[i]; doc.setDrawColor(...C.fio); doc.setLineWidth(0.1); doc.line(MG, yy, W - MG, yy);
  });
  if (hCx) {
    if (yy + hFim > fim && yy > yTopo + 8) yy = segue(false);
    yy += e.cx[0]; doc.setFillColor(...C.disc); doc.setDrawColor(...C.discB); doc.setLineWidth(0.2); doc.roundedRect(MG, yy, util, hCx, 1.4, 1.4, 'FD');
    expRicoDesenha(doc, L(q.discutir.t || '', util, FS, true), MG + 2.8, yy + e.cx[1] + K * 0.78, FS, C.tinta, LH);
    let t = yy + e.cx[1] + K + e.cx[2];
    dIt.forEach(ls => { doc.setFillColor(...C.tinta2); doc.circle(MG + 4.4, t + K * 0.48, 0.42, 'F'); expRicoDesenha(doc, ls, MG + 6.6, t + K * 0.78, FS, C.tinta, LH); t += ls.length * LH + e.cx[3]; });
    yy += hCx;
  }
  (q.notas || []).forEach((nt, i) => {                      // nota de detalhe: a página do anexo só é conhecida no fim
    const yb = yy + 1 + i * 3.8 + 2.7, pg = pag();
    g.depois.push(() => { doc.setPage(pg); expRicoDesenha(doc, L([{ t: nt.t + (nt.ref && nt.ref._pag ? ' (página ' + nt.ref._pag + ')' : '') + (nt.fim || ''), i: true }], util, 7.6), MG, yb, 7.6, C.rot, 3.6); });
  });
  return yy + (nN ? 1 + nN * 3.8 : 0);
}
function expPdf(M) {
  const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape', compress: true }), W = 297, H = 210, MG = 9;
  const topo = () => {
    doc.setFillColor(23, 24, 26); doc.rect(0, 0, W, 13, 'F');
    doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text(expPdfT('AMVOX · Orçamento & Controladoria 2027'), MG, 8.4);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.text(expPdfT(M.titulo), W - MG, 8.4, { align: 'right' });
    doc.setTextColor(60); doc.setFontSize(7.2); const linhas = doc.splitTextToSize(expPdfT(M.sub), W - 2 * MG); doc.text(linhas, MG, 17.5);
    return 17.5 + linhas.length * 3.1 + 1.5;
  };
  const yTopo = topo(); let y = yTopo;                       // o cabeçalho das demais páginas é desenhado no fim (todas de uma vez)
  const g = { W, H, MG, yTopo, fim: H - 11, depois: [] };    // tela de texto: medidas da página e o que só se escreve no fim (nº da página de seção e de anexo)
  if (M.abertura) y = expPdfAbertura(doc, M, y, g);
  M.quadros.filter(q => q.pdf !== false).forEach((q, k) => {
    if (q.secao) { y = expPdfSecao(doc, q, y, g, k > 0 || !!M.abertura); return; }
    const nCol = q.cols.length; let fs = (nCol >= 16 ? 5.6 : nCol >= 13 ? 6.2 : nCol >= 9 ? 7 : 8) - (est.uni === 'R$' && nCol >= 13 ? 0.5 : 0), pad = 0.75;
    if (k > 0) { if (q.novaPagina || y > H - 45) { doc.addPage(); y = yTopo; } else y += 5; }
    q._pag = doc.internal.getCurrentPageInfo().pageNumber;
    doc.setTextColor(23, 24, 26); doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.text(expPdfT(q.titulo || q.nome), MG, y + 3);
    if (q.nota) { doc.setFont('helvetica', 'normal'); doc.setFontSize(6.8); doc.setTextColor(95); const ln = doc.splitTextToSize(expPdfT(q.nota), W - 2 * MG); doc.text(ln, MG, y + 6.8); y += ln.length * 2.9; }
    const util = W - 2 * MG, w0 = Math.min(q.w0 || (nCol >= 13 ? 62 : 80), util * 0.45), colunas = { 0: { halign: 'left', cellWidth: w0 } };
    const larg = nCol <= 4 ? Math.min(util, w0 + (nCol - 1) * 32) : util;                                     // quadro de poucas colunas não se estica pela página
    const soNum = q.cols.slice(1).every(c => c.tipo !== 't'), wNum = (larg - w0) / Math.max(1, nCol - 1);        // só números: colunas de largura igual
    q.cols.forEach((c, j) => { if (j) colunas[j] = soNum ? { halign: 'right', cellWidth: wNum } : { halign: c.tipo === 't' ? 'left' : 'right' }; });
    // quadro que cabe numa página só em modo compacto (ex.: DRE de 46 linhas): aperta o espaçamento e, se preciso, a letra — sem quebrar a tabela
    const disp = H - (y + 5) - 13, nLin = q.linhas.length + 1, hLin = (f, p_) => f * 0.3528 * 1.15 + 2 * p_;
    if (hLin(fs, pad) * nLin > disp) { if (hLin(fs, 0.45) * nLin <= disp) pad = 0.45; else if (hLin(Math.max(5.2, fs - 0.8), 0.45) * nLin <= disp) { fs = Math.max(5.2, fs - 0.8); pad = 0.45; } }
    doc.autoTable({
      startY: y + 5, margin: { left: MG, right: MG, top: yTopo + 2, bottom: 12 }, theme: 'plain', tableWidth: larg,
      head: [q.cols.map(c => expPdfT(c.t))],
      body: q.linhas.map(l => q.cols.map((c, j) => expCelPdf(l.c[j], l.e === 'p' && c.tipo === 'n' ? 'p' : c.tipo, c))),
      styles: { font: 'helvetica', fontSize: fs, cellPadding: { top: pad, bottom: pad, left: 1, right: 1 }, textColor: [30, 32, 36], lineColor: [222, 226, 232], lineWidth: { bottom: 0.1 }, overflow: 'linebreak' },
      headStyles: { fillColor: [23, 24, 26], textColor: 255, fontStyle: 'bold', halign: 'center', valign: 'middle', fontSize: fs },
      columnStyles: colunas,
      didParseCell: d => {
        if (d.section !== 'body') return;
        const e = q.linhas[d.row.index].e || '';
        if (e === 't') { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = [233, 237, 242]; }
        else if (e === 'h') { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = [211, 220, 232]; }
        else if (e === 's') d.cell.styles.fontStyle = 'bold';
        else if (e === 'p' || e === 'c') { d.cell.styles.fontStyle = 'italic'; d.cell.styles.textColor = [91, 100, 114]; }
      },
    });
    y = doc.lastAutoTable.finalY;
  });
  g.depois.forEach(f => f());
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); if (i > 1) topo();
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.6); doc.setTextColor(110);
    doc.text(expPdfT((M.notas || []).join(' · ')), MG, H - 5.2, { maxWidth: W - 2 * MG - 30 });
    doc.text(`Página ${i} de ${n}`, W - MG, H - 5.2, { align: 'right' });
  }
  return doc;
}

/* ------------------------------------------------------------------------------------------- MODELOS (o que cada tela exporta) */
function expBase(nome, titulo, quadros, extra = '') {
  const v = versaoAtual(), h = expHoje(), M_ = D.meta || {};
  return { arq: `AMVOX_ORC2027_${nome}_${expNomeArq(v.codigo || 'V')}_${h.arq}`, titulo,
    sub: `${escopoTxt()} · versão ${v.codigo || '—'} (${v.status || '—'})${extra ? ' · ' + extra : ''} · origem: ${M_.arquivo || '—'} (blocos de ${M_.gerado_em || '—'})`
      + (M_.central ? ` · central de de-para lida do app em ${M_.central.lida_em}` : ''),
    notas: [`Emitido em ${h.br}`, 'AMVOX / REISTAR — Controladoria', 'uso interno'], quadros };
}
const expMesesCols = () => MESES.map(x => ({ t: x + '/27', tipo: 'n', w: 13 }));
const expRot = l => (typeof rotuloDRE === 'function' ? rotuloDRE(l.l) : l.l);

function expModeloDRE() {
  const L = D.dre.linhas, fat = dreLinha('Faturamento');
  const rot = l => (l.t === 'd' ? '    ' : '') + expRot(l), e = l => ({ t: 't', s: 's', p: 'p' }[l.t] || '');
  const anual = { nome: 'DRE anual', titulo: 'DRE 2027 — anual × base 2026 × plano TCP', cong: 1, w0: 74, novaPagina: false,
    nota: 'Base 2026 = realizado jul–out/26 anualizado · despesa negativa · Δ = orçado − base (e orçado − plano TCP)',
    cols: [{ t: 'Linha', tipo: 't', w: 52 }, { t: 'Base 2026', tipo: 'n' }, { t: '% fat.', tipo: 'p' }, { t: 'Orçado 2027', tipo: 'n' }, { t: '% fat.', tipo: 'p' }, { t: 'Δ R$', tipo: 'n' },
      { t: 'Δ %', tipo: 'p' }, { t: 'Plano TCP 2027', tipo: 'n' }, { t: '% fat.', tipo: 'p' }, { t: 'Δ orçado × TCP', tipo: 'n' }],
    linhas: L.map(l => l.t === 'p' ? { e: 'p', c: [rot(l), l.base, null, l.orc, null, null, null, l.tcp, null, null] }
      : { e: e(l), c: [rot(l), l.base, div(l.base, fat.base), l.orc, div(l.orc, fat.orc), l.orc - l.base, div(l.orc - l.base, Math.abs(l.base)), l.tcp, div(l.tcp, fat.tcp), l.orc - l.tcp] }) };
  const mensal = { nome: 'DRE mensal', titulo: 'DRE 2027 — mês a mês', cong: 1, w0: 58, novaPagina: true, nota: 'Despesa negativa · % fat. = total do ano ÷ faturamento',
    cols: [{ t: 'Linha', tipo: 't', w: 52 }, ...expMesesCols(), { t: 'Total 2027', tipo: 'n' }, { t: '% fat.', tipo: 'p' }],
    linhas: L.map(l => ({ e: e(l), c: [rot(l), ...l.m, l.orc, l.t === 'p' ? null : div(l.orc, fat.orc)] })) };
  const comp = D.dre.composicao || [], ct = comp[3] ? comp[3][1] : soma(comp.slice(0, 3), c => c[1]);
  const composicao = { nome: 'Composição', titulo: 'Composição das despesas projetadas 2027 pela decisão por linha', cong: 0, w0: 150,
    cols: [{ t: 'Decisão', tipo: 't', w: 96 }, { t: 'Valor 2027', tipo: 'n', w: 18 }, { t: '% do total', tipo: 'p', w: 11 }],
    linhas: comp.map((c, i) => ({ e: i >= 3 ? 't' : '', c: [c[0], c[1], c[2] ? c[2] : div(c[1], ct)] })) };
  return expBase('DRE', 'DRE projetada 2027', [anual, mensal, composicao], `cenário ${D.meta.cenario || '—'}`);
}

function expModeloTCP() {
  const T = D.dre_tcp.linhas;
  const dre = { nome: 'DRE TCP', titulo: 'DRE 2027 — estrutura do modelo TCP', cong: 1, w0: 62, nota: '% RL = total do ano ÷ receita líquida · a última linha é a conferência com a DRE 2027 (deve ser zero)',
    cols: [{ t: 'Linha', tipo: 't', w: 54 }, { t: 'Total 2027', tipo: 'n' }, { t: '% RL', tipo: 'p' }, ...expMesesCols()],
    linhas: T.map(l => l.t === 'h' ? { e: 'h', c: [l.l] }
      : { e: { t: 't', s: 's', p: 'p', c: 'c' }[l.t] || '', c: [(l.t === 'd' ? '    ' : '') + l.l, l.tot, (l.t === 'p' || l.t === 'c') ? null : l.prl, ...l.m] }) };
  const part = { nome: 'Participações', titulo: 'Participações usadas para desdobrar receita, impostos e CMV/CPV (realizado jul–out/26 no modelo TCP)', cong: 0, w0: 150,
    cols: [{ t: 'Participação', tipo: 't', w: 70 }, { t: '%', tipo: 'p', w: 11, dec: 2 }], linhas: (D.dre_tcp.participacoes || []).map(p => ({ c: [p[0], p[1]] })) };
  return expBase('DRE_TCP', 'DRE 2027 — modelo TCP', [dre, part], `cenário ${D.meta.cenario || '—'}`);
}

function expModeloFolha() {
  const { vis, area, areas } = folhaSel(), NPJ = FOLHA_NPJ, P = FOLHA.P;
  const rows = FOLHA.proj.filter(r => areas.includes(r.area));
  const somaComp = c => { const o = {}; rows.filter(r => r.cenario === c).forEach(r => { const a = o[r.componente] || (o[r.componente] = Array(13).fill(0)); r.m.forEach((v, i) => { a[i] += v; a[12] += v; }); }); return o; };
  const CG = somaComp('GESTOR'), CM = somaComp('MODELO');
  const tot = o => { const a = Array(12).fill(0); Object.entries(o).forEach(([n, v]) => { if (n !== NPJ) v.slice(0, 12).forEach((x, i) => a[i] += x); }); return a; };
  const tG = tot(CG), tM = tot(CM), z13 = Array(13).fill(0);
  const quadroComp = (cen) => {
    const comp = cen === 'GESTOR' ? CG : CM, outro = cen === 'GESTOR' ? CM : CG, totC = cen === 'GESTOR' ? tG : tM, totO = cen === 'GESTOR' ? tM : tG, on = cen === 'GESTOR' ? 'MODELO' : 'GESTOR';
    const nomes = COMP_FOLHA_ORDEM().filter(n => (comp[n] || []).some(x => Math.abs(x) > 0.5) || (outro[n] || []).some(x => Math.abs(x) > 0.5));
    return { nome: 'Componentes ' + cen, titulo: `Folha 2027 por componente — cenário ${cen}`, cong: 1, w0: 62, novaPagina: cen === 'MODELO',
      nota: cen === 'GESTOR' ? 'GESTOR = MODELO + admissões, desligamentos e promoções · honorários de PJ são informativos (fora do total)'
        : 'MODELO = quadro atual + dissídio + benefícios + sazonalidade · honorários de PJ são informativos (fora do total)',
      cols: [{ t: 'Componente — ' + cen, tipo: 't', w: 50 }, ...expMesesCols(), { t: 'Total 2027', tipo: 'n' }, { t: 'part.', tipo: 'p' }, { t: on, tipo: 'n' }, { t: 'Δ ' + cen + ' − ' + on, tipo: 'n' }],
      linhas: nomes.map(n => { const a = comp[n] || z13, o = outro[n] || z13; return { c: [n, ...a.slice(0, 12), a[12], n === NPJ ? null : div(a[12], soma(totC)), o[12], a[12] - o[12]] }; })
        .concat([{ e: 't', c: ['Total da folha (sem PJ)', ...totC, soma(totC), 1, soma(totO), soma(totC) - soma(totO)] }]) };
  };
  const posA = FOLHA.pos.filter(x => areas.includes(x.area)), calc = posA.map(x => folhaPosicao(x, P));
  const pes = { fG: Array(12).fill(0), pjG: Array(12).fill(0), fM: Array(12).fill(0), adm: Array(12).fill(0), des: Array(12).fill(0), pro: Array(12).fill(0) };
  calc.forEach(l => { for (let i = 0; i < 12; i++) { if (l.PJ) pes.pjG[i] += l.ativo[i]; else pes.fG[i] += l.ativo[i]; if (!l.PJ) pes.fM[i] += l.BK; }
    const x = l.x; if (+x.mes_adm) pes.adm[x.mes_adm - 1] += +x.qtd || 0; if (+x.mes_desl) pes.des[x.mes_desl - 1]++; if (+x.mes_promo) pes.pro[x.mes_promo - 1]++; });
  const mesI = () => MESES.map(x => ({ t: x + '/27', tipo: 'i', w: 9 }));
  const pessoas = { nome: 'Pessoas', titulo: 'Pessoas e movimentações (quantidade por mês)', cong: 1, w0: 62, cols: [{ t: 'Pessoas e movimentações', tipo: 't', w: 34 }, ...mesI()],
    linhas: [['Folha — GESTOR', pes.fG], ['PJ — GESTOR', pes.pjG], ['Folha — MODELO', pes.fM], ['Admissões (pessoas)', pes.adm], ['Desligamentos', pes.des], ['Promoções', pes.pro]].map(([n, a]) => ({ c: [n, ...a] })) };
  const res = (D.folha && D.folha.resumo) || [], quadros = [quadroComp('GESTOR'), quadroComp('MODELO')];
  if (!area) {
    const lin = vis.map(a => { const r = FOLHA.proj.filter(x => x.area === a), s = (c, pj) => r.filter(x => x.cenario === c && (pj ? x.componente === NPJ : x.componente !== NPJ)).reduce((t_, x) => t_ + soma(x.m), 0);
      const o = res.find(x => x[0] === a), pa = FOLHA.pos.filter(x => x.area === a);
      return { c: [a, pa.filter(x => /^P/.test(x.id)).length, pa.filter(x => /^J/.test(x.id)).length, s('MODELO'), s('GESTOR'), div(s('GESTOR'), soma(tG)), s('GESTOR') - s('MODELO'), o ? (o[5] || 0) : 0, s('GESTOR', true)] }; });
    const T_ = j => soma(lin, l => l.c[j]);
    quadros.push({ nome: 'Por área', titulo: 'Folha 2027 por área (sem honorários de PJ)', cong: 1, w0: 70, novaPagina: true,
      cols: [{ t: 'Área', tipo: 't', w: 34 }, { t: 'Pessoas', tipo: 'i', w: 9 }, { t: 'PJ', tipo: 'i', w: 7 }, { t: 'MODELO 2027', tipo: 'n' }, { t: 'GESTOR 2027', tipo: 'n' }, { t: 'part.', tipo: 'p' },
        { t: 'Δ GESTOR − MODELO', tipo: 'n' }, { t: 'Orçado pelo gestor', tipo: 'n' }, { t: 'PJ honorários', tipo: 'n' }],
      linhas: lin.concat([{ e: 't', c: ['Total', T_(1), T_(2), T_(3), T_(4), 1, T_(6), T_(7), T_(8)] }]) });
  }
  quadros.push(pessoas);
  quadros.push({ nome: 'Efeito de caixa', titulo: 'Efeito de caixa — 13º e férias (cenário MODELO)', cong: 1, w0: 70, cols: [{ t: 'Linha', tipo: 't', w: 44 }, ...expMesesCols(), { t: 'Total', tipo: 'n' }],
    linhas: folhaCaixa(rows, P).map(([n, a], i) => ({ e: i === 4 ? 't' : '', c: [n, ...a, soma(a)] })) });
  quadros.push({ nome: 'Dissídio', titulo: 'Premissas — dissídio 2027 por convenção', cong: 1, w0: 60, novaPagina: true,
    nota: 'Entra no mês de APLICAÇÃO; o atraso desde a data-base é compensado por ABONO (sem encargos), RETROATIVO (com encargos) ou NENHUMA',
    cols: [{ t: 'Convenção', tipo: 't', w: 22 }, { t: '% dissídio', tipo: 'p', w: 11, dec: 2 }, { t: 'Mês data-base', tipo: 'i', w: 12 }, { t: 'Mês aplicação', tipo: 'i', w: 12 }, { t: 'Compensação', tipo: 't', w: 16 }, { t: 'Atraso (meses)', tipo: 'i', w: 12 }],
    linhas: (P.dissidio || []).map(d => ({ c: [d.conv, d.pct, d.db, d.ap, d.comp, Math.max(0, d.ap - d.db)] })) });
  const ROT = typeof FOLHA_ROT === 'object' ? FOLHA_ROT : {};
  quadros.push({ nome: 'Encargos e provisões', titulo: 'Premissas — encargos, provisões, rescisão e caixa', cong: 1, w0: 110,
    cols: [{ t: 'Parâmetro', tipo: 't', w: 48 }, { t: 'Percentual', tipo: 'p', w: 12, dec: 2 }, { t: 'Valor / opção', tipo: 't', w: 14 }],
    linhas: Object.entries(P.p || {}).map(([k, v_]) => ({ c: [ROT[k] || k, expNum(v_) && v_ > 0 && v_ < 1 ? v_ : null, expNum(v_) && v_ > 0 && v_ < 1 ? null : String(v_)] })) });
  quadros.push({ nome: 'Benefícios', titulo: 'Premissas — benefícios por pessoa', cong: 1, w0: 86,
    cols: [{ t: 'Benefício', tipo: 't', w: 46 }, { t: 'R$/pessoa/mês', tipo: 'n', w: 14, dec: 2, uni: 'R$' }, { t: 'Reajuste %', tipo: 'p', w: 11, dec: 2 }, { t: 'Mês do reajuste', tipo: 'i', w: 10 }, { t: 'Quem', tipo: 't', w: 16 },
      { t: 'Convenção', tipo: 't', w: 14 }, { t: 'Conta', tipo: 't', w: 14 }],
    linhas: (P.beneficios || []).map(b => ({ c: [b.nome, +b.valor, b.reaj, b.mes > 12 ? null : b.mes, b.quem, b.conv, String(b.conta ?? '')] })) });
  quadros.push({ nome: 'Projeção detalhada', titulo: 'Projeção detalhada — área × cenário × componente × conta (base para tabela dinâmica)', cong: 3, pdf: false,
    cols: [{ t: 'Área', tipo: 't', w: 26 }, { t: 'Cenário', tipo: 't', w: 10 }, { t: 'Componente', tipo: 't', w: 40 }, { t: 'Destino', tipo: 't', w: 12 }, { t: 'Conta', tipo: 't', w: 13 },
      { t: 'Setor final', tipo: 't', w: 26 }, ...expMesesCols(), { t: 'Total 2027', tipo: 'n' }],
    linhas: rows.slice().sort((a, b) => a.area.localeCompare(b.area) || a.cenario.localeCompare(b.cenario) || String(a.componente).localeCompare(String(b.componente)))
      .map(r => ({ c: [r.area, r.cenario, r.componente, r.destino || '', String(r.conta ?? ''), r.setor_final || '', ...r.m, soma(r.m)] })) });
  if ((est.papel === 'controladoria' || est.papel === 'ceo') && D.folha && D.folha.calibracao) {
    quadros.push({ nome: 'Calibração', titulo: 'Calibração — mês-base do simulador × realizado médio jul–out/26 (R$/mês, por setor final × conta)', cong: 3, pdf: false,
      cols: [{ t: 'Setor final', tipo: 't', w: 26 }, { t: 'Conta', tipo: 't', w: 13 }, { t: 'Descrição', tipo: 't', w: 40 }, { t: 'Simulado', tipo: 'n' }, { t: 'Realizado médio jul–out', tipo: 'n' }, { t: 'Δ', tipo: 'n' },
        { t: 'Δ %', tipo: 'p' }, { t: 'Situação', tipo: 't', w: 18 }],
      linhas: D.folha.calibracao.filter(c => areas.includes(c[0]) || !area).map(c => ({ c: [c[0], String(c[1] ?? ''), c[2], c[3], c[4], c[5], c[6], c[7]] })) });
  }
  const M = expBase('FOLHA_' + expNomeArq(area || 'CONSOLIDADO'), `Folha 2027 — ${area || 'consolidado (' + vis.length + ' área(s))'}`, quadros, `última projeção: ${FOLHA.origem || '—'}`);
  M.notas.push('a folha analítica (salário por posição) não sai em arquivo — só na tela');
  return M;
}

/* PREMISSAS ORÇAMENTÁRIAS — o modelo é lido do HTML que a própria tela desenha (TELAS.premissas_orc()): título, texto, índice, cartões e, por seção,
   título, valor, texto, quadro de premissas e "para discutir". Nada é recalculado aqui. Bloco que a tela ganhe depois e que não seja reconhecido não se
   perde: antes do cabeçalho da tela sai como faixa de aviso no topo do PDF (é onde entra o aviso de premissa alterada no app); depois dele, como texto. Quadro de detalhe (<details>): aberto na tela = anexo no fim; fechado = só a menção de que existe no app. */
const expTabTela = tb => {                                  // <table> da tela → quadro de tabela do modelo (texto como está na tela; coluna numérica à direita)
  const cel = td => expRicoTxt(expRico(td)), linhas = [...tb.querySelectorAll('tbody tr')].map(tr => ({ c: [...tr.cells].map(cel) }));
  tb.querySelectorAll('tfoot tr').forEach(tr => linhas.push({ e: 't', c: [...tr.cells].map(cel) }));
  return { cols: [...tb.querySelectorAll('thead th')].map(th => ({ t: cel(th), tipo: th.classList.contains('n') ? 'n' : 't' })), linhas, cong: 0,
    w0: Math.min(70, Math.max(24, 4 + 1.5 * Math.max(0, ...linhas.map(l => Math.max(...String(l.c[0] ?? '').split('\n').map(s => s.length)))))) };
};
function expModeloPremissas() {
  const raiz = new DOMParser().parseFromString('<!doctype html><body>' + TELAS.premissas_orc(), 'text/html').body;
  const vivos = [...document.querySelectorAll('#tela > details')], T = n => n ? expRicoTxt(expRico(n)) : '', R = n => n ? expRico(n) : [];
  const BARRA = { k2: [31, 111, 235], k3: [138, 90, 0], k4: [26, 127, 75], k5: [107, 118, 134] }, PESO = [30, 0, 33, 37];
  const ab = { avisos: [], titulo: '', texto: [], indice: [], cartoes: [] }, secs = [], anexos = []; let sec = null, nDet = 0, nAnexo = 0, fechados = 0, cab = false;
  [...raiz.children].forEach(el => {
    if (el.matches('.head-row')) { cab = true; ab.titulo = T(el.querySelector('h2')); ab.texto = R(el.querySelector('.title p')); }
    else if (el.matches('.prem-indice')) ab.indice = [...el.querySelectorAll('[data-ir-prem]')].map(a => ({ id: a.dataset.irPrem, t: T(a) }));
    else if (el.matches('.kpis')) ab.cartoes = [...el.querySelectorAll('.kpi')].map(k => {
      const v = k.querySelector('.val');
      return { rot: T(k.querySelector('.lab')).toUpperCase(), valor: R(v), meta: R(k.querySelector('.meta')), barra: BARRA[[...k.classList].find(c => BARRA[c])],
        tom: !v ? '' : v.classList.contains('down') ? 'neg' : v.classList.contains('up') ? 'pos' : '' };
    });
    else if (el.matches('section.prem-sec')) {
      const tb = el.querySelector('table.prem-tab'), dz = el.querySelector('.disc');
      secs.push(sec = { secao: true, id: (el.id || '').replace(/^prem-/, ''), nome: T(el.querySelector('h3')), titulo: T(el.querySelector('h3')), valor: R(el.querySelector('.prem-val')), texto: R(el.querySelector('p.exp')),
        cols: tb ? [...tb.querySelectorAll('thead th')].map((th, j) => ({ t: T(th), tipo: th.classList.contains('n') ? 'v' : 't', w: PESO[j] || 30, cor: j === 2 ? 2 : 1 })) : [],
        linhas: tb ? [...tb.querySelectorAll('tbody tr')].map(tr => ({ c: [...tr.cells].map(R) })) : [],
        discutir: dz ? { t: T(dz.querySelector('b')), itens: [...dz.querySelectorAll('li')].map(R) } : null, notas: [] });
    } else if (el.matches('details')) {
      const titulo = T(el.querySelector('summary')), aberto = vivos[nDet] ? vivos[nDet].open : el.open; nDet++;
      if (!aberto) { fechados++; if (sec) sec.notas.push({ t: 'Detalhe disponível no app: ' + titulo }); return; }
      const n = ++nAnexo, obs = [...el.querySelectorAll('.csub')].map(T).filter(Boolean);
      [...el.querySelectorAll('table')].forEach((tb, i) => {
        const q = expTabTela(tb); q.nome = 'Anexo ' + n + (i ? '.' + (i + 1) : ''); q.titulo = `Anexo ${n} — ${titulo}${i ? ' (continuação)' : ''}`; q.novaPagina = !i;
        q.nota = [sec && sec.titulo ? `Detalhe da seção “${sec.titulo}”` : '', 'valores em ' + uniTxt(), ...(i ? [] : obs)].filter(Boolean).join(' · ');
        anexos.push(q); if (!i && sec) sec.notas.push({ t: 'Detalhe no Anexo ' + n, ref: q, fim: ': ' + titulo });
      });
    } else if (T(el)) { if (!cab) ab.avisos.push(R(el)); else secs.push(sec = { secao: true, id: '', nome: '', titulo: '', valor: [], texto: R(el), cols: [], linhas: [], discutir: null, notas: [] }); }
  });
  const h = expHoje(), v = versaoAtual(), cen = D.meta.cenario || '—', uniA = anexos.length ? 'anexos em ' + uniTxt() : '';
  const M = expBase('PREMISSAS', ab.titulo || 'Premissas orçamentárias 2027', secs.concat(anexos),
    `cenário de receita ${cen} (${rsC(D.meta.receita)}) · unidade indicada em cada valor${uniA ? ' (' + uniA + ')' : ''} · emitido em ${h.br}`);
  M.abertura = ab; M.uniNota = uniA || 'unidade indicada em cada valor';
  M.notas = [`Emitido em ${h.br}`, `versão ${v.codigo || '—'} (${v.status || '—'})`, `cenário de receita ${cen}`, 'AMVOX / REISTAR — Controladoria', 'uso interno'];
  if (fechados) M.aviso = 'quadro de detalhe fechado na tela não sai: abra-o antes de gerar para entrar como anexo';
  return M;
}

/* ------------------------------------------------------------------------------------------- botões nas telas */
const EXP_TELAS = { dre: expModeloDRE, dre_tcp: expModeloTCP, folha: expModeloFolha, premissas_orc: expModeloPremissas };
const EXP_SO_PDF = { premissas_orc: 'PDF A4 paisagem da tela inteira: cartões, seções, quadros de premissas e “Para discutir”. Quadro de detalhe aberto na tela sai como anexo' };   // tela só com PDF (texto do botão)
async function expGera(tela, tipo) {
  const st = document.getElementById('expMsg'), diz = (t, erro) => { if (st) { st.textContent = t; st.style.color = erro ? '#C8102E' : ''; } };
  try {
    const M = EXP_TELAS[tela]();
    if (tipo === 'xlsx') {
      expBaixa(new Blob([expXlsx(M)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), M.arq + '.xlsx');
      diz(`✓ Excel gerado: ${M.arq}.xlsx (valores em R$, ${M.quadros.length} aba(s))`);
    } else {
      diz('gerando o PDF…'); await expLibPdf();
      M.notas.push(M.uniNota || 'valores em ' + uniTxt());
      const doc = expPdf(M); doc.save(M.arq + '.pdf');
      diz(`✓ PDF gerado: ${M.arq}.pdf (${M.uniNota ? doc.getNumberOfPages() + ' página(s)' : 'valores em ' + uniTxt()})` + (M.aviso ? ' · ' + M.aviso : ''));
    }
  } catch (e) { console.error(e); diz('Não foi possível gerar o arquivo: ' + (e.message || e), true); }
}
function expBotoes(tela) {
  const cab = document.querySelector('#tela .head-row'); if (!cab || cab.querySelector('.exp-bts')) return;
  if (tela === 'folha' && (typeof FOLHA === 'undefined' || !FOLHA)) return;
  const d = document.createElement('div'); d.className = 'exp-bts';
  d.innerHTML = '<span id="expMsg" class="exp-msg"></span>' + (EXP_SO_PDF[tela] ? '' : '<button class="btn" data-exp="xlsx" title="Planilha .xlsx com os valores exatos em R$, uma aba por quadro">⬇ Excel</button>')
    + `<button class="btn" data-exp="pdf" title="${EXP_SO_PDF[tela] || 'PDF A4 paisagem, na unidade que está na tela'}">⬇ PDF</button>`;
  cab.appendChild(d);
  d.querySelectorAll('[data-exp]').forEach(b => b.onclick = () => expGera(tela, b.dataset.exp));
}
function instalaOrcExporta() {
  if (window.__orcExp) return; window.__orcExp = true;
  const st = document.createElement('style');
  st.textContent = '.exp-bts{margin-left:auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end}.exp-msg{font-size:11.5px;color:var(--ink2);max-width:420px;text-align:right}.exp-msg:empty{display:none}'
    + '@media print{.exp-bts{display:none}}';
  document.head.appendChild(st);
  Object.keys(EXP_TELAS).forEach(tela => { const ant = POS[tela]; POS[tela] = () => { if (ant) ant(); expBotoes(tela); }; });
}
