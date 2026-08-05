async function loadPassenger(){
  await updateFare();
  const {data,error}=await client.from('rides').select('*').eq('passenger_id',currentUser.id).order('requested_at',{ascending:false}).limit(20);
  if(error)throw error;
  const rides=data||[];
  const active=rides.find(r=>['requested','accepted','driver_arriving','in_progress'].includes(r.status));
  if(active?.driver_id){
    const [{data:driver},{data:profile},{data:vehicle}]=await Promise.all([
      client.from('drivers').select('pix_key').eq('user_id',active.driver_id).maybeSingle(),
      client.from('profiles').select('full_name,phone').eq('id',active.driver_id).maybeSingle(),
      client.from('vehicles').select('model,color,plate').eq('driver_id',active.driver_id).maybeSingle()
    ]);
    active.driver_info={driver,profile,vehicle};
  }
  renderPassengerActive(active);
  $('#passengerRequestCard').classList.toggle('hidden',Boolean(active));
  $('#passengerRides').innerHTML=rides.length?rides.map(rideCard).join(''):'<p>Nenhuma corrida solicitada.</p>';
}

function renderPassengerActive(r){
  const box=$('#passengerActiveRide');
  if(!r){box.classList.add('hidden');box.innerHTML='';return}
  box.classList.remove('hidden');
  let extra='';
  if(r.driver_id){
    const info=r.driver_info||{},name=info.profile?.full_name||'Motociclista',vehicle=info.vehicle||{};
    extra=`<div class="driver-summary"><strong>${safe(name)}</strong><span>${safe(vehicle.model||'Moto')} · ${safe(vehicle.color||'')} · ${safe(vehicle.plate||'')}</span></div>`;
    if(r.payment_method==='pix'&&info.driver?.pix_key)extra+=`<p><strong>Chave PIX:</strong> ${safe(info.driver.pix_key)}</p>`;
  }
  if(r.status==='driver_arriving')extra+=`<div class="code-box"><span>Código de segurança</span><strong>${safe(r.safety_code)}</strong></div>`;
  box.innerHTML=`<h2>${labels[r.status]}</h2><p><strong>Destino:</strong> ${safe(r.destination_address)}</p><p><strong>Valor:</strong> ${money(r.final_price||r.estimated_price)} · ${r.payment_method==='pix'?'PIX':'Dinheiro'}</p>${extra}${['requested','accepted','driver_arriving'].includes(r.status)?`<button class="danger-button" data-cancel="${r.id}">Cancelar corrida</button>`:''}`;
  box.querySelector('[data-cancel]')?.addEventListener('click',()=>cancelRide(r.id));
}