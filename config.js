// Config do app AMVOX Preços (GitHub Pages + Supabase Auth)
const SUPABASE_URL = 'https://dzxekwdpktvishdsmiep.supabase.co';
const SUPABASE_KEY = 'sb_publishable_i59McYEiS6vZq6lfLUqB2w_NRVQ6DWN'; // publishable (pública por design; RLS protege os dados)
const SB = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
async function guardaPagina(){
  const { data: { session } } = await SB.auth.getSession();
  if (!session) { location.replace('index.html'); return null; }
  try {
    const { data } = await SB.from('profiles').select('*').eq('id', session.user.id).single();
    window.PAPEL = (data && data.papel) || 'CONSULTA';
    // aplicativos liberados (07/10/2026); perfil sem a coluna = transição → libera os dois
    window.APPS = data && Array.isArray(data.apps) ? data.apps : ['precos', 'dash'];
  } catch (e) { window.PAPEL = 'CONSULTA'; window.APPS = ['precos', 'dash']; }   // falha de leitura: o banco segue travando
  if (!window.APPS.includes('precos')) { semAcessoApp('o app de Preços'); return null; }
  // REPRESENTANTE (05/11/2026): vê o que o gerente vê, exceto margem — sem a página de Custos
  if (window.PAPEL === 'REPRESENTANTE' && /custos(\.html)?$/.test(location.pathname)) { location.replace('tabelas.html'); return null; }
  sessionStorage.setItem('perfil', window.PAPEL === 'ADM' ? 'adm' : 'consulta');
  window.USUARIO_EMAIL = session.user.email;
  window.USUARIO_NOME = (session.user.user_metadata && session.user.user_metadata.nome) || '';
  if (!(await carregaDadosPagina())) return null;
  document.documentElement.style.visibility = 'visible';
  document.dispatchEvent(new CustomEvent('papel-pronto'));
  return session;
}
// Usuário sem o aplicativo: aviso no lugar da página (o banco também bloqueia — trava por aplicativo, 07/10/2026)
function semAcessoApp(nome){
  const mostra = () => {
    document.body.innerHTML = '<div style="max-width:520px;margin:12vh auto;padding:28px;font:15px/1.6 -apple-system,sans-serif;' +
      'background:#fff;border:1px solid #E6E5E2;border-radius:12px;color:#17181A"><b>Seu usuário não tem acesso a ' + nome + '.</b><br>' +
      'Se precisar, fale com a Controladoria.<div style="margin-top:16px"><a href="index.html">Voltar ao início</a> · ' +
      '<a href="#" onclick="sair();return false">Sair</a></div></div>';
    document.body.style.background = '#F7F6F4';
    document.documentElement.style.visibility = 'visible';
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mostra, { once:true }); else mostra();
}
// Dados FORA do código público (caminho b, 06/10/2026): páginas com <script type="text/plain" data-pos-dados>
// recebem os trechos de dado da tabela app_bloco (RLS: só usuário logado com perfil) e só então rodam esses
// scripts, na ordem. Página sem esses scripts (index, curva) não é afetada.
async function carregaDadosPagina(){
  // espera a página inteira ser lida ANTES de procurar os scripts adiados (eles ficam no fim do <body>)
  if (document.readyState === 'loading') await new Promise(r => document.addEventListener('DOMContentLoaded', r, { once:true }));
  const adiados = [...document.querySelectorAll('script[type="text/plain"][data-pos-dados]')];
  if (!adiados.length) return true;
  // REPRESENTANTE lê a cópia SEM CUSTO dos dados (<pagina>_rep — a trava do banco só entrega essa a ele)
  const pagina = (location.pathname.split('/').pop() || '').replace(/\.html$/, '') + (window.PAPEL === 'REPRESENTANTE' ? '_rep' : '');
  const { data, error } = await SB.from('app_bloco').select('nome,texto').eq('pagina', pagina).order('ordem');
  if (error || !data || !data.length){
    document.documentElement.style.visibility = 'visible';
    document.body.insertAdjacentHTML('afterbegin', '<div style="background:#FEE4E2;color:#B42318;font:600 14px sans-serif;padding:14px 18px">' +
      'Não foi possível carregar os dados desta página' + (error ? ' (' + String(error.message || error).replace(/</g, '&lt;') + ')' : '') +
      '. Saia e entre de novo; se continuar, avise a Controladoria.</div>');
    return false;
  }
  const roda = t => { const s = document.createElement('script'); s.textContent = t; document.body.appendChild(s); };
  data.forEach(b => roda(b.texto));
  adiados.forEach(s => roda(s.textContent));
  return true;
}
async function sair(){ await SB.auth.signOut(); location.replace('index.html'); }

/* USUÁRIO CONECTADO — mesmo padrão do Dash (Silvio 04/11/2026: "implemente a mesma visão para todos os demais aplicativos,
   para manter o padrão de comunicação visual"). Bloco à direita do cabeçalho: as linhas de base/atualização da página e, por
   último, "Conectado: <usuário> · <papel>". Página sem cabeçalho (Custos, com menu lateral) → no rodapé do menu. extra = texto
   adicional do papel (ex.: aprovador de bonificação no Redes). */
function mostraConectado(extra){
  const u = window.USUARIO_EMAIL; if (!u) return;
  const quem = window.USUARIO_NOME ? `${window.USUARIO_NOME} (${u})` : u;
  const papel = [window.PAPEL || 'CONSULTA', extra].filter(Boolean).join(' · ');
  if (!document.getElementById('cx-estilo')) document.head.insertAdjacentHTML('beforeend', '<style id="cx-estilo">' +
    'header .cx-dir{margin-left:auto;text-align:right;font:500 11px var(--sans,sans-serif);letter-spacing:.08em;text-transform:uppercase;color:#9A9A97;line-height:1.7}' +
    'header .cx-dir > .data{display:block;margin-left:0}' +
    '.cx-quem b{color:#fff;font-weight:600;text-transform:none;letter-spacing:0;font-size:12px}' +
    '.side .cx-quem{margin-top:7px;word-break:break-all;color:#C9C9C5;font-size:12px}</style>');
  let q = document.getElementById('quemlog');
  const hd = document.querySelector('header');
  if (hd){
    let dir = hd.querySelector('.cx-dir');
    if (!dir){
      dir = document.createElement('div'); dir.className = 'cx-dir';
      [...hd.children].filter(e => e.classList.contains('data')).forEach(e => { if (e.id === 'quemlog') e.remove(); else dir.appendChild(e); });
      hd.appendChild(dir); q = null;
    }
    if (!q){ q = document.createElement('div'); q.id = 'quemlog'; dir.appendChild(q); }
  } else {
    const f = document.querySelector('.side .foot'); if (!f) return;
    if (!q){ q = document.createElement('div'); q.id = 'quemlog'; f.appendChild(q); }
  }
  q.className = 'cx-quem';
  q.innerHTML = 'Conectado: <b></b> · ' + papel.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  q.querySelector('b').textContent = quem;
}
document.addEventListener('papel-pronto', () => mostraConectado());

// Vigia de versão (pedido Silvio 17/09/2026): a cada 10 min confere se há publicação nova
// da página e recarrega automaticamente — garante todo mundo na versão mais atual sem
// F5 cego (não interrompe quem usa se nada mudou).
(function(){
  if (!/custos|tabelas/.test(location.pathname)) return;
  let marca = null;
  async function checaVersao(){
    try {
      const r = await fetch(location.pathname + '?vchk=' + Date.now(), { method:'HEAD', cache:'no-store' });
      const m = r.headers.get('etag') || r.headers.get('last-modified');
      if (!m) return;
      if (marca === null) { marca = m; return; }
      if (m !== marca) location.reload();
    } catch(e) { /* offline momentâneo: tenta no próximo ciclo */ }
  }
  window.addEventListener('load', checaVersao);
  setInterval(checaVersao, 10*60*1000);
})();
