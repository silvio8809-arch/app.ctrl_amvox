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
  document.documentElement.style.visibility = 'visible';
  document.dispatchEvent(new CustomEvent('papel-pronto'));
  return session;
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
