// Config do app AMVOX Preços (GitHub Pages + Supabase Auth)
const SUPABASE_URL = 'https://dzxekwdpktvishdsmiep.supabase.co';
const SUPABASE_KEY = 'sb_publishable_i59McYEiS6vZq6lfLUqB2w_NRVQ6DWN'; // publishable (pública por design; RLS protege os dados)
const SB = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
async function guardaPagina(){
  const { data: { session } } = await SB.auth.getSession();
  if (!session) { location.replace('index.html'); return null; }
  try {
    const { data } = await SB.from('profiles').select('papel').eq('id', session.user.id).single();
    window.PAPEL = (data && data.papel) || 'CONSULTA';
  } catch (e) { window.PAPEL = 'CONSULTA'; }
  sessionStorage.setItem('perfil', window.PAPEL === 'ADM' ? 'adm' : 'consulta');
  window.USUARIO_EMAIL = session.user.email;
  if (!(await carregaDadosPagina())) return null;
  document.documentElement.style.visibility = 'visible';
  document.dispatchEvent(new CustomEvent('papel-pronto'));
  return session;
}
// Dados FORA do código público (caminho b, 06/10/2026): páginas com <script type="text/plain" data-pos-dados>
// recebem os trechos de dado da tabela app_bloco (RLS: só usuário logado com perfil) e só então rodam esses
// scripts, na ordem. Página sem esses scripts (index, curva) não é afetada.
async function carregaDadosPagina(){
  // espera a página inteira ser lida ANTES de procurar os scripts adiados (eles ficam no fim do <body>)
  if (document.readyState === 'loading') await new Promise(r => document.addEventListener('DOMContentLoaded', r, { once:true }));
  const adiados = [...document.querySelectorAll('script[type="text/plain"][data-pos-dados]')];
  if (!adiados.length) return true;
  const pagina = (location.pathname.split('/').pop() || '').replace(/\.html$/, '');
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
