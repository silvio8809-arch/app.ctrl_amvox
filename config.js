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
  document.documentElement.style.visibility = 'visible';
  document.dispatchEvent(new CustomEvent('papel-pronto'));
  return session;
}
async function sair(){ await SB.auth.signOut(); location.replace('index.html'); }
