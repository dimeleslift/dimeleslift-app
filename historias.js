function abrirEditorHistoria(dk) {
  const u = viewUid();
  const resumen = resumenNv(u, dk);
  const ejercicios = resumen.det;
  if (!ejercicios.length) return toast("Registra una serie para crear tu historia.");
  let mayor;
  for (const ejercicio of ejercicios) {
    for (const serie of ejercicio.sets) {
      if (serie.p > 0 && (!mayor || serie.p > mayor.serie.p)) mayor = {ejercicio, serie};
    }
  }
  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-labelledby", "historia-titulo");
  dialog.style.cssText = "width:min(92vw,480px);max-height:90dvh;background:#141414;color:white;border:1px solid #555;border-radius:18px;padding:20px;overflow:auto";
  dialog.innerHTML = `<div class="row between"><h2 id="historia-titulo">¿Qué quieres destacar hoy?</h2><button class="btn ghost" aria-label="Cerrar">×</button></div>
    <label class="f">Mi historia<select name="modo"><option value="peso" ${mayor ? "" : "disabled"}>Mi mayor carga</option><option value="ej">Elegir mi ejercicio</option><option value="total">Mi sesión completa</option></select></label>
    <div class="opciones"><label class="f">Ejercicio<select name="ejercicio"></select></label><label class="f">Serie<select name="serie"></select></label></div>
    <canvas width="1080" height="1920" aria-label="Vista previa de tu historia" style="display:block;max-height:42dvh;max-width:100%;width:auto;margin:12px auto;border-radius:10px"></canvas>
    <p>Etiquétame para que pueda compartir tu logro.</p><button class="btn ghost copiar">Copiar @dimeleslift</button><span role="status"></span><button class="gd-cta enviar" style="margin-top:12px">Compartir historia</button>`;
  document.body.append(dialog);
  const get = selector => dialog.querySelector(selector);
  const modo = get('[name="modo"]'), ejercicio = get('[name="ejercicio"]'), serie = get('[name="serie"]');
  modo.value = mayor ? "peso" : "ej";
  ejercicios.forEach((e,i) => ejercicio.add(new Option(ejName(e.ej), i)));
  const detalle = (e,s) => s.u === "reps" ? (s.p ? fmtKg(s.p)+" kg"+(e.manc ? " c/u" : "")+" × " : "")+s.r+" reps" : s.r+" "+s.u;
  function cargarSeries() {
    serie.replaceChildren();
    const e = ejercicios[ejercicio.selectedIndex];
    e.sets.forEach((s,i) => serie.add(new Option("Serie "+(i+1)+" · "+detalle(e,s), i)));
  }
  const cv = get("canvas"), x = cv.getContext("2d"), enviar = get(".enviar");
  let revision = 0, archivo;
  function dibujar() {
    const turno = ++revision;
    enviar.disabled = true;
    archivo = null;
    get(".opciones").hidden = modo.value !== "ej";
    const total = modo.value === "total";
    const e = modo.value === "peso" ? mayor.ejercicio : ejercicios[ejercicio.selectedIndex];
    const s = modo.value === "peso" ? mayor.serie : e.sets[serie.selectedIndex];
    const fondo = x.createLinearGradient(0,0,1080,1920);
    fondo.addColorStop(0,"#33142f"); fondo.addColorStop(.5,"#0b0b0b"); fondo.addColorStop(1,"#243019");
    x.fillStyle = fondo; x.fillRect(0,0,1080,1920);
    function linea(txt,y,size,color) {
      x.fillStyle = color;
      do { x.font = "800 "+size--+"px 'League Spartan', sans-serif"; } while(size>16 && x.measureText(txt).width>920);
      x.fillText(txt,80,y);
    }
    linea(fmtDate(resumen.fecha)+" · "+nvNombre(u),290,44,"#F4F1EC");
    linea(total ? "MI SESIÓN COMPLETA" : modo.value === "peso" ? "MI MAYOR CARGA DE HOY" : "MI SERIE DESTACADA",570,50,"#A3E850");
    linea(total ? "Volumen total" : ejName(e.ej),750,88,"#F4F1EC");
    linea(total ? fmtNum(resumen.ton)+" kg" : detalle(e,s),970,160,"#F4F1EC");
    linea(total ? resumen.series+" series · "+ejercicios.length+" ejercicios" : "La serie que me llevo de hoy.",1120,52,"#DA45A4");
    linea("dimeLESlift",1550,76,"#A3E850"); linea("@dimeleslift",1620,42,"#F4F1EC");
    cv.toBlob(blob => { if(turno!==revision || !dialog.open) return; archivo=blob; enviar.disabled=!blob; if(!blob) get('[role="status"]').textContent="No se pudo preparar la imagen."; }, "image/png");
  }
  ejercicio.onchange = () => { cargarSeries(); dibujar(); };
  modo.onchange = serie.onchange = dibujar;
  get('[aria-label="Cerrar"]').onclick = () => dialog.close();
  dialog.onclose = () => dialog.remove();
  get(".copiar").onclick = async () => {
    try { await navigator.clipboard.writeText("@dimeleslift"); get('[role="status"]').textContent=" Usuario copiado."; }
    catch { get('[role="status"]').textContent=" Copia este usuario: @dimeleslift"; }
  };
  enviar.onclick = () => { if(archivo) compartirHistoria(archivo); };
  cargarSeries(); dialog.showModal(); dibujar();
}
