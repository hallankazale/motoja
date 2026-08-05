const config = window.MOTOJA_CONFIG;
const client = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey);

const $ = (selector) => document.querySelector(selector);
const money = (value) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
let currentUser = null;
let currentProfile = null;
let currentDriver = null;

function setMessage(target, text, isError = false) {
  const element = $(target);
  element.textContent = text || '';
  element.classList.toggle('error', isError);
}

function toggleAuthMode(mode) {
  const signup = mode === 'signup';
  $('#loginForm').classList.toggle('hidden', signup);
  $('#signupForm').classList.toggle('hidden', !signup);
  $('#showLogin').classList.toggle('active', !signup);
  $('#showSignup').classList.toggle('active', signup);
  setMessage('#authMessage', '');
}

function showAuthenticated(isAuthenticated) {
  $('#authView').classList.toggle('active-screen', !isAuthenticated);
  $('#appView').classList.toggle('active-screen', isAuthenticated);
  $('#logoutButton').classList.toggle('hidden', !isAuthenticated);
}

async function loadProfile() {
  const { data, error } = await client.from('profiles').select('*').eq('id', currentUser.id).single();
  if (error) throw error;
  currentProfile = data;

  document.querySelectorAll('.role-view').forEach((view) => view.classList.add('hidden'));
  $(`#${data.role}View`)?.classList.remove('hidden');
  $('#accountBanner').textContent = `${data.full_name} · ${data.role === 'driver' ? 'Motociclista' : data.role === 'admin' ? 'Administrador' : 'Passageiro'}`;

  if (data.role === 'passenger') await loadPassengerArea();
  if (data.role === 'driver') await loadDriverArea();
  if (data.role === 'admin') await loadAdminArea();
}

async function loadPassengerArea() {
  await updateFare();
  const { data, error } = await client.from('rides').select('*').eq('passenger_id', currentUser.id).order('requested_at', { ascending: false }).limit(20);
  if (error) throw error;
  $('#passengerRides').innerHTML = data.length ? data.map(renderRide).join('') : '<p>Nenhuma corrida solicitada.</p>';
}

async function updateFare() {
  const distance = Number($('#distanceKm').value || 0);
  if (distance <= 0) return;
  const { data, error } = await client.rpc('calculate_fare', { p_distance_km: distance });
  $('#fareEstimate').textContent = error ? 'Indisponível' : money(data);
}

async function createRide(event) {
  event.preventDefault();
  setMessage('#appMessage', 'Solicitando corrida...');
  const payload = {
    p_pickup_address: $('#pickupAddress').value.trim(),
    p_destination_address: $('#destinationAddress').value.trim(),
    p_distance_km: Number($('#distanceKm').value),
    p_payment_method: document.querySelector('input[name="paymentMethod"]:checked').value
  };
  const { data, error } = await client.rpc('create_ride', payload);
  if (error) return setMessage('#appMessage', error.message, true);
  setMessage('#appMessage', `Corrida solicitada. Código de segurança: ${data.safety_code}`);
  $('#destinationAddress').value = '';
  await loadPassengerArea();
}

function renderRide(ride) {
  return `<article class="list-item">
    <div><strong>${escapeHtml(ride.destination_address)}</strong><span>${ride.status} · ${money(ride.estimated_price)}</span></div>
    <small>${new Date(ride.requested_at).toLocaleString('pt-BR')}</small>
  </article>`;
}

async function loadDriverArea() {
  const { data, error } = await client.from('drivers').select('*').eq('user_id', currentUser.id).single();
  if (error) throw error;
  currentDriver = data;
  $('#driverApprovalText').textContent = `Situação: ${data.approval_status} · Mensalidade: ${money(data.monthly_fee)}`;
  $('#onlineToggle').checked = data.is_online;
  $('#onlineToggle').disabled = data.approval_status !== 'approved';
  $('#pixKey').value = data.pix_key || '';

  const { data: vehicle } = await client.from('vehicles').select('*').eq('driver_id', currentUser.id).maybeSingle();
  if (vehicle) {
    $('#vehicleModel').value = vehicle.model || '';
    $('#vehicleColor').value = vehicle.color || '';
    $('#vehiclePlate').value = vehicle.plate || '';
    $('#vehicleYear').value = vehicle.year || '';
  }

  const { data: open } = await client.from('rides').select('*').eq('status', 'requested').order('requested_at').limit(20);
  $('#openRides').innerHTML = open?.length ? open.map((ride) => `${renderRide(ride)}<button class="small-button" data-accept="${ride.id}">Aceitar</button>`).join('') : '<p>Nenhuma corrida disponível.</p>';

  const { data: mine } = await client.from('rides').select('*').eq('driver_id', currentUser.id).order('requested_at', { ascending: false }).limit(20);
  $('#driverRides').innerHTML = mine?.length ? mine.map(renderRide).join('') : '<p>Nenhuma corrida aceita.</p>';

  document.querySelectorAll('[data-accept]').forEach((button) => button.addEventListener('click', () => acceptRide(button.dataset.accept)));
}

async function saveDriverSetup(event) {
  event.preventDefault();
  const { error: driverError } = await client.from('drivers').update({ pix_key: $('#pixKey').value.trim() }).eq('user_id', currentUser.id);
  if (driverError) return setMessage('#appMessage', driverError.message, true);

  const vehicle = {
    driver_id: currentUser.id,
    model: $('#vehicleModel').value.trim(),
    color: $('#vehicleColor').value.trim(),
    plate: $('#vehiclePlate').value.trim().toUpperCase(),
    year: Number($('#vehicleYear').value) || null
  };
  const { error } = await client.from('vehicles').upsert(vehicle, { onConflict: 'driver_id' });
  setMessage('#appMessage', error ? error.message : 'Cadastro salvo para análise.', Boolean(error));
}

async function toggleOnline() {
  const { error } = await client.from('drivers').update({ is_online: $('#onlineToggle').checked }).eq('user_id', currentUser.id);
  if (error) {
    $('#onlineToggle').checked = !$('#onlineToggle').checked;
    setMessage('#appMessage', error.message, true);
  }
}

async function acceptRide(rideId) {
  const { error } = await client.rpc('accept_ride', { p_ride_id: rideId });
  setMessage('#appMessage', error ? error.message : 'Corrida aceita.', Boolean(error));
  await loadDriverArea();
}

async function loadAdminArea() {
  const { data: drivers, error } = await client.from('drivers').select('*, profiles!drivers_user_id_fkey(full_name,phone), vehicles(*)').order('created_at', { ascending: false });
  if (error) throw error;
  $('#adminDrivers').innerHTML = drivers.length ? drivers.map((driver) => `<article class="list-item admin-item">
    <div><strong>${escapeHtml(driver.profiles?.full_name || 'Motociclista')}</strong><span>${driver.approval_status} · ${driver.subscription_status}</span></div>
    <div class="inline-actions"><button data-driver="${driver.user_id}" data-status="approved">Aprovar</button><button data-driver="${driver.user_id}" data-status="suspended">Suspender</button></div>
  </article>`).join('') : '<p>Nenhum motociclista.</p>';

  const { data: rides } = await client.from('rides').select('*').order('requested_at', { ascending: false }).limit(30);
  $('#adminRides').innerHTML = rides?.length ? rides.map(renderRide).join('') : '<p>Nenhuma corrida.</p>';
  document.querySelectorAll('[data-driver]').forEach((button) => button.addEventListener('click', () => updateDriverStatus(button.dataset.driver, button.dataset.status)));
}

async function updateDriverStatus(userId, status) {
  const { error } = await client.from('drivers').update({ approval_status: status }).eq('user_id', userId);
  setMessage('#appMessage', error ? error.message : `Motociclista ${status === 'approved' ? 'aprovado' : 'suspenso'}.`, Boolean(error));
  await loadAdminArea();
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

$('#showLogin').addEventListener('click', () => toggleAuthMode('login'));
$('#showSignup').addEventListener('click', () => toggleAuthMode('signup'));
$('#distanceKm').addEventListener('input', updateFare);
$('#rideForm').addEventListener('submit', createRide);
$('#driverSetupForm').addEventListener('submit', saveDriverSetup);
$('#onlineToggle').addEventListener('change', toggleOnline);

$('#loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const { error } = await client.auth.signInWithPassword({ email: $('#loginEmail').value.trim(), password: $('#loginPassword').value });
  setMessage('#authMessage', error ? error.message : '', Boolean(error));
});

$('#signupForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const { error } = await client.auth.signUp({
    email: $('#signupEmail').value.trim(),
    password: $('#signupPassword').value,
    options: { data: { full_name: $('#signupName').value.trim(), phone: $('#signupPhone').value.trim(), requested_role: $('#signupRole').value } }
  });
  setMessage('#authMessage', error ? error.message : 'Conta criada. Confirme o e-mail, caso seja solicitado.', Boolean(error));
});

$('#logoutButton').addEventListener('click', () => client.auth.signOut());

client.auth.onAuthStateChange(async (_event, session) => {
  currentUser = session?.user || null;
  showAuthenticated(Boolean(currentUser));
  if (currentUser) {
    try { await loadProfile(); } catch (error) { setMessage('#appMessage', error.message, true); }
  }
});

(async function bootstrap() {
  const { data } = await client.auth.getSession();
  currentUser = data.session?.user || null;
  showAuthenticated(Boolean(currentUser));
  if (currentUser) {
    try { await loadProfile(); } catch (error) { setMessage('#appMessage', error.message, true); }
  }
})();
