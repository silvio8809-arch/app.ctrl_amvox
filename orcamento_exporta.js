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
   p = linha de percentual (as colunas de valor viram %) · c = conferência · '' = normal. */
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
const expPdfT = s => String(s ?? '').replace(/Δ/g, 'Var.').replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/→/g, '->').replace(/[−–—]/g, '-').replace(/[✓✔]/g, 'ok')
  .replace(/›/g, '>').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/…/g, '...').replace(/[^\x00-\xFF]/g, '');
function expCelPdf(v, tipo, c) {
  if (v == null || v === '') return '';
  if (!expNum(v)) return expPdfT(v);
  if (tipo === 'p') return expPdfT(pc(v, c.dec ?? 1));
  if (tipo === 'i') return expPdfT(Math.abs(v) < 0.005 ? '-' : v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }));
  const o = {}; if (c.dec != null) o.dec = c.dec; if (c.uni) o.uni = c.uni;          // c.uni = 'R$' em valor unitário (não segue a unidade da tela)
  return expPdfT(fmt(v, o));
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
  M.quadros.filter(q => q.pdf !== false).forEach((q, k) => {
    const nCol = q.cols.length; let fs = (nCol >= 16 ? 5.6 : nCol >= 13 ? 6.2 : nCol >= 9 ? 7 : 8) - (est.uni === 'R$' && nCol >= 13 ? 0.5 : 0), pad = 0.75;
    if (k > 0) { if (q.novaPagina || y > H - 45) { doc.addPage(); y = yTopo; } else y += 5; }
    doc.setTextColor(23, 24, 26); doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.text(expPdfT(q.titulo || q.nome), MG, y + 3);
    if (q.nota) { doc.setFont('helvetica', 'normal'); doc.setFontSize(6.8); doc.setTextColor(95); const ln = doc.splitTextToSize(expPdfT(q.nota), W - 2 * MG); doc.text(ln, MG, y + 6.8); y += ln.length * 2.9; }
    const util = W - 2 * MG, w0 = Math.min(q.w0 || (nCol >= 13 ? 62 : 80), util * 0.45), colunas = { 0: { halign: 'left', cellWidth: w0 } };
    const soNum = q.cols.slice(1).every(c => c.tipo !== 't'), wNum = (util - w0) / Math.max(1, nCol - 1);        // só números: colunas de largura igual
    q.cols.forEach((c, j) => { if (j) colunas[j] = soNum ? { halign: 'right', cellWidth: wNum } : { halign: c.tipo === 't' ? 'left' : 'right' }; });
    // quadro que cabe numa página só em modo compacto (ex.: DRE de 46 linhas): aperta o espaçamento e, se preciso, a letra — sem quebrar a tabela
    const disp = H - (y + 5) - 13, nLin = q.linhas.length + 1, hLin = (f, p_) => f * 0.3528 * 1.15 + 2 * p_;
    if (hLin(fs, pad) * nLin > disp) { if (hLin(fs, 0.45) * nLin <= disp) pad = 0.45; else if (hLin(Math.max(5.2, fs - 0.8), 0.45) * nLin <= disp) { fs = Math.max(5.2, fs - 0.8); pad = 0.45; } }
    doc.autoTable({
      startY: y + 5, margin: { left: MG, right: MG, top: yTopo + 2, bottom: 12 }, theme: 'plain', tableWidth: util,
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

/* ------------------------------------------------------------------------------------------- botões nas telas */
const EXP_TELAS = { dre: expModeloDRE, dre_tcp: expModeloTCP, folha: expModeloFolha };
async function expGera(tela, tipo) {
  const st = document.getElementById('expMsg'), diz = (t, erro) => { if (st) { st.textContent = t; st.style.color = erro ? '#C8102E' : ''; } };
  try {
    const M = EXP_TELAS[tela]();
    if (tipo === 'xlsx') {
      expBaixa(new Blob([expXlsx(M)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), M.arq + '.xlsx');
      diz(`✓ Excel gerado: ${M.arq}.xlsx (valores em R$, ${M.quadros.length} aba(s))`);
    } else {
      diz('gerando o PDF…'); await expLibPdf();
      M.notas.push('valores em ' + uniTxt());
      expPdf(M).save(M.arq + '.pdf'); diz(`✓ PDF gerado: ${M.arq}.pdf (valores em ${uniTxt()})`);
    }
  } catch (e) { console.error(e); diz('Não foi possível gerar o arquivo: ' + (e.message || e), true); }
}
function expBotoes(tela) {
  const cab = document.querySelector('#tela .head-row'); if (!cab || cab.querySelector('.exp-bts')) return;
  if (tela === 'folha' && (typeof FOLHA === 'undefined' || !FOLHA)) return;
  const d = document.createElement('div'); d.className = 'exp-bts';
  d.innerHTML = '<span id="expMsg" class="exp-msg"></span><button class="btn" data-exp="xlsx" title="Planilha .xlsx com os valores exatos em R$, uma aba por quadro">⬇ Excel</button>'
    + '<button class="btn" data-exp="pdf" title="PDF A4 paisagem, na unidade que está na tela">⬇ PDF</button>';
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
